/**
 * Story 71-4 AC2 — END-TO-END WIRING test (project doctrine: prove the full
 * ACTION_REVEAL → TURN_STATUS{resolved} → persisted-segment flow through the
 * REAL component chain, not just a buildSegments unit assert).
 *
 * Drives the production units:
 *   useGameSocket → onMessage → usePeerReveals.apply (real hook)
 *   → on TURN_STATUS{resolved}: SNAPSHOT the filtered reveals BEFORE clear()
 *     (the ephemeral→persistent bridge — Architect ruling A1)
 *   → real NarrationCards (peerActionsByRound prop) → buildSegments → renderSegment
 *
 * The Host mirrors App.tsx's wiring (the snapshot-before-clear handler Dev
 * implements in GREEN). The load-bearing assertions are on the RENDERED
 * output of the real NarrationCards: the submitted peer action must SURVIVE
 * the clear and appear in the transcript; a composing-only reveal must not;
 * one entry per (player_id, round).
 */
import { render, act, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState, useCallback, useRef, useEffect, type ReactElement } from "react";
import { useGameSocket } from "@/hooks/useGameSocket";
import { usePeerReveals } from "@/hooks/usePeerReveals";
import { NarrationCards } from "@/components/NarrationCards";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { ActionRevealEntry } from "@/types/payloads";

// NarrationCards gains a `peerActionsByRound` prop in GREEN (Architect
// CORRECTED-FINAL contract). Cast so the wiring test compiles against the
// locked accumulator shape now.
const NarrationCardsWithPeers = NarrationCards as unknown as (props: {
  messages: GameMessage[];
  peerActionsByRound?: Map<number, ActionRevealEntry[]>;
}) => ReactElement;

// ---------------------------------------------------------------------------
// MockWebSocket — canonical pattern from action-reveal-wiring.test.tsx
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
// Host — mirrors App.tsx: real socket + real usePeerReveals, plus the
// snapshot-before-clear capture Dev builds in GREEN, rendering the real
// NarrationCards with the persisted accumulator.
// ---------------------------------------------------------------------------
function Host({ onConnect }: { onConnect: (fn: () => void) => void }) {
  const [round, setRound] = useState(1);
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [persistedPeers, setPersistedPeers] = useState<Map<number, ActionRevealEntry[]>>(new Map());
  const peerReveals = usePeerReveals({ selfPlayerId: "p1", round });

  const applyRef = useRef(peerReveals.apply);
  const clearRef = useRef(peerReveals.clear);
  const revealsRef = useRef(peerReveals.reveals);
  useEffect(() => {
    applyRef.current = peerReveals.apply;
    clearRef.current = peerReveals.clear;
    revealsRef.current = peerReveals.reveals;
  });

  const handleMessage = useCallback((msg: GameMessage) => {
    if (msg.type === MessageType.ACTION_REVEAL) {
      const entry = msg.payload as unknown as ActionRevealEntry;
      setRound(entry.round);
      applyRef.current(entry);
      return;
    }
    if (msg.type === MessageType.TURN_STATUS) {
      const status = (msg.payload as { status?: string }).status;
      if (status === "resolved") {
        // THE BRIDGE: snapshot the perception-filtered reveals BEFORE clear().
        // Filter to submitted; dedup one-per-(player_id, round).
        const snap = Array.from(revealsRef.current.values()).filter(
          (e) => e.status === "submitted",
        );
        setPersistedPeers((prev) => {
          const next = new Map(prev);
          for (const e of snap) {
            const list = next.has(e.round) ? [...next.get(e.round)!] : [];
            if (!list.some((x) => x.player_id === e.player_id)) list.push(e);
            next.set(e.round, list);
          }
          return next;
        });
        clearRef.current();
      }
      return;
    }
    // Narration etc. accumulate into the scroll (ACTION_REVEAL/TURN_STATUS are
    // state-only, never in `messages` — matches production).
    setMessages((prev) => [...prev, msg]);
  }, []);

  const { connect } = useGameSocket({ url: "ws://test/socket", onMessage: handleMessage });

  const onConnectRef = useRef(onConnect);
  useEffect(() => {
    onConnectRef.current(connect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <NarrationCardsWithPeers messages={messages} peerActionsByRound={persistedPeers} />;
}

function inbound(payload: Record<string, unknown>, type = "ACTION_REVEAL", playerId = "p2") {
  return new MessageEvent("message", {
    data: JSON.stringify({ type, payload, player_id: playerId }),
  });
}

function boot(): void {
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
}

describe("71-4 AC2 — peer action persists post-resolution (end-to-end wiring)", () => {
  beforeEach(() => {
    instances.length = 0;
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("a submitted peer reveal SURVIVES TURN_STATUS{resolved} and renders in the transcript", () => {
    boot();

    // Peer p2 composes, then submits.
    act(() => {
      instances[0].onmessage?.(
        inbound({ player_id: "p2", character_name: "Bob", status: "composing", action: "I creep toward the vault", aside: false, seq: 0, round: 1 }),
      );
    });
    act(() => {
      instances[0].onmessage?.(
        inbound({ player_id: "p2", character_name: "Bob", status: "submitted", action: "I creep toward the vault", aside: false, seq: 1, round: 1 }),
      );
    });

    // Turn resolves — usePeerReveals clears, but the snapshot must persist.
    act(() => {
      instances[0].onmessage?.(
        inbound({ player_id: "p2", character_name: "Bob", status: "resolved" }, "TURN_STATUS", "p2"),
      );
    });

    // The peer's submitted action survives the clear and shows in the transcript.
    expect(screen.getByText(/I creep toward the vault/)).toBeInTheDocument();
    // Attribution by character name.
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("a composing-only reveal (never submitted) does NOT persist after resolution", () => {
    boot();

    act(() => {
      instances[0].onmessage?.(
        inbound({ player_id: "p2", character_name: "Bob", status: "composing", action: "I hesitate at the threshold", aside: false, seq: 0, round: 1 }),
      );
    });
    act(() => {
      instances[0].onmessage?.(
        inbound({ player_id: "p2", character_name: "Bob", status: "resolved" }, "TURN_STATUS", "p2"),
      );
    });

    expect(screen.queryByText(/I hesitate at the threshold/)).not.toBeInTheDocument();
  });

  it("renders exactly one persisted entry per peer (dedup) after resolution", () => {
    boot();

    // Two submitted frames for the same peer/round (e.g. an edit re-submit).
    act(() => {
      instances[0].onmessage?.(
        inbound({ player_id: "p2", character_name: "Bob", status: "submitted", action: "I cover the hall", aside: false, seq: 1, round: 1 }),
      );
    });
    act(() => {
      instances[0].onmessage?.(
        inbound({ player_id: "p2", character_name: "Bob", status: "submitted", action: "I cover the hall", aside: false, seq: 2, round: 1 }),
      );
    });
    act(() => {
      instances[0].onmessage?.(
        inbound({ player_id: "p2", character_name: "Bob", status: "resolved" }, "TURN_STATUS", "p2"),
      );
    });

    const matches = screen.getAllByText(/I cover the hall/);
    expect(matches).toHaveLength(1);
  });
});
