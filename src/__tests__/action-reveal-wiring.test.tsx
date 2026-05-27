import { render, fireEvent, act, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState, useCallback, useRef, useEffect } from "react";
import { useGameSocket } from "@/hooks/useGameSocket";
import { usePeerReveals } from "@/hooks/usePeerReveals";
import { PeerRevealList } from "@/components/PeerRevealList";
import InputBar, { type InputBarRevealCall } from "@/components/InputBar";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { ActionRevealEntry, ActionRevealPayload } from "@/types/payloads";

// ---------------------------------------------------------------------------
// MockWebSocket — mirrors the canonical pattern from reconnect-banner-wiring
// ---------------------------------------------------------------------------
const instances: MockWebSocket[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
}

// ---------------------------------------------------------------------------
// Host — exercises the real production chain:
//   useGameSocket → onMessage handler → usePeerReveals.apply → PeerRevealList
//   InputBar.onReveal → handleReveal → send (outbound ACTION_REVEAL)
//
// useGameSocket uses autoConnect: false, so we must call connect() after mount.
// We expose it via an onConnect callback fired from a useEffect.
// ---------------------------------------------------------------------------
function Host({ onConnect }: { onConnect: (fn: () => void) => void }) {
  const [round, setRound] = useState(1);
  const peerReveals = usePeerReveals({ selfPlayerId: "p1", round });

  // Keep a stable ref to apply so the memoised handleMessage callback doesn't
  // need to list peerReveals in its dep array (mirrors App.tsx's peerRevealsApplyRef).
  const applyRef = useRef(peerReveals.apply);
  useEffect(() => {
    applyRef.current = peerReveals.apply;
  });

  const handleMessage = useCallback((msg: GameMessage) => {
    if (msg.type === MessageType.ACTION_REVEAL) {
      const entry = msg.payload as unknown as ActionRevealEntry;
      setRound(entry.round);
      applyRef.current(entry);
    }
  }, []);

  const { send, connect } = useGameSocket({
    url: "ws://test/socket",
    onMessage: handleMessage,
  });

  // Expose connect to the test via a stable effect — runs once on mount.
  // useEffect is the correct place to perform side effects outside render.
  const onConnectRef = useRef(onConnect);
  useEffect(() => {
    onConnectRef.current(connect);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReveal = useCallback(
    (call: InputBarRevealCall) => {
      const payload: ActionRevealPayload = {
        player_id: "p1",
        character_name: "Alex",
        status: call.status,
        action: call.action,
        aside: call.aside,
        seq: call.seq,
        round,
      };
      send({
        type: MessageType.ACTION_REVEAL,
        payload,
        player_id: "p1",
      } as unknown as GameMessage);
    },
    [send, round],
  );

  return (
    <>
      <PeerRevealList reveals={peerReveals.reveals} partyOrder={["p1", "p2"]} />
      <InputBar onSend={() => {}} onReveal={handleReveal} round={round} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ACTION_REVEAL end-to-end wiring", () => {
  beforeEach(() => {
    instances.length = 0;
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("typing produces outbound composing; inbound peer reveal renders", () => {
    let doConnect: (() => void) | null = null;
    render(<Host onConnect={(fn) => { doConnect = fn; }} />);

    // useGameSocket uses autoConnect: false — kick the connect explicitly.
    // The useEffect that fires onConnect runs synchronously inside act().
    act(() => {
      doConnect!();
    });

    // The MockWebSocket constructor has run; open it.
    act(() => {
      const ws = instances[0];
      ws.readyState = MockWebSocket.OPEN;
      ws.onopen?.(new Event("open"));
    });

    // Type into the input — debounced composing fires after 250 ms.
    const input = screen.getByPlaceholderText("What do you do?");
    fireEvent.change(input, { target: { value: "I sneak in" } });
    act(() => vi.advanceTimersByTime(250));

    // sent frames are parsed from JSON — treat as unknown then cast.
    const sent = instances[0].sent.map((s) => JSON.parse(s) as unknown as GameMessage);
    const composing = sent.find(
      (m) =>
        m.type === "ACTION_REVEAL" &&
        (m.payload as unknown as ActionRevealPayload).status === "composing",
    );
    expect(composing).toBeDefined();
    expect((composing!.payload as unknown as ActionRevealPayload).action).toBe("I sneak in");
    expect((composing!.payload as unknown as ActionRevealPayload).player_id).toBe("p1");

    // Inject an inbound peer reveal — must flow through onMessage → usePeerReveals → PeerRevealList.
    act(() => {
      instances[0].onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "ACTION_REVEAL",
            payload: {
              player_id: "p2",
              character_name: "Bob",
              status: "composing",
              action: "I draw",
              aside: false,
              seq: 0,
              round: 1,
            },
            player_id: "p2",
          }),
        }),
      );
    });

    expect(screen.getByText(/Bob.*Composing/i)).toBeInTheDocument();
    expect(screen.getByText("I draw")).toBeInTheDocument();
  });

  it("inbound submitted flips the row badge from composing to submitted", () => {
    let doConnect: (() => void) | null = null;
    render(<Host onConnect={(fn) => { doConnect = fn; }} />);

    act(() => {
      doConnect!();
    });
    act(() => {
      const ws = instances[0];
      ws.readyState = MockWebSocket.OPEN;
      ws.onopen?.(new Event("open"));
    });

    // First: peer starts composing.
    act(() => {
      instances[0].onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "ACTION_REVEAL",
            payload: {
              player_id: "p2",
              character_name: "Bob",
              status: "composing",
              action: "I draw my pistol",
              aside: false,
              seq: 0,
              round: 1,
            },
            player_id: "p2",
          }),
        }),
      );
    });

    expect(screen.getByText(/Bob.*Composing/i)).toBeInTheDocument();

    // Now flip to submitted with a higher seq.
    act(() => {
      instances[0].onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "ACTION_REVEAL",
            payload: {
              player_id: "p2",
              character_name: "Bob",
              status: "submitted",
              action: "I draw my pistol",
              aside: false,
              seq: 1,
              round: 1,
            },
            player_id: "p2",
          }),
        }),
      );
    });

    // PeerRevealList renders "Bob ✓ submitted" for submitted status.
    expect(screen.getByText(/Bob.*Sealed/)).toBeInTheDocument();
  });
});
