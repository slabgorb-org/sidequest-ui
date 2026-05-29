import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWebSocket } from "@/hooks/useWebSocket";

// ══════════════════════════════════════════════════════════════════════════════
// Story 67-8 — RED: duplicate-socket reconnect loop stranding confrontations
// in AwaitingConnect (deferred AC1/AC2/AC3/AC6 from 67-7).
//
// DIAGNOSIS (AC1, Operator-accepted 2026-05-29 — see session Delivery Findings):
// The dogfight strand is churn-gated. A clean session commits beats first-try
// with a single socket; the strand only appears when a remount/reconnect mid-
// confrontation opens a SECOND server socket. Root-cause defect confirmed at
// the socket-lifecycle layer:
//
//   `useWebSocket.createSocket()` (useWebSocket.ts:137-187) detaches the prior
//   socket's handlers (line 142) but NEVER calls `.close()` on it before
//   replacing `wsRef.current`. And `connect()` (lines 189-195) unconditionally
//   calls `createSocket()` even though its DOCUMENTED contract (line 46) is
//   "Open a connection (no-op if already connected)." So when the connect path
//   re-fires while a socket is still live, the prior socket lingers OPEN and
//   the server sees two live connections — the freshly-opened one briefly in
//   AwaitingConnect, stranding a racing beat DICE_THROW (rejected
//   `session.message_rejected_unbound` ×4+).
//
// These tests pin the AC2/AC3/AC6 invariants at the layer that OWNS socket
// lifecycle (useWebSocket), fix-agnostically — they pass whether Dev fixes by
// (a) making connect() a no-op while OPEN, or (b) having createSocket() close
// the orphan before replacing it. Both align with the locked AC4 decision
// ("eliminate the loop", never buffer). They deliberately do NOT assert a
// specific fix shape, nor reproduce the unpinned App-remount trigger (which
// would encode a guessed mechanism — see TEA deviation in the session file).
//
// AC4 / No-Silent-Fallbacks: the server-side unbound-frame rejection from 67-7
// stays correct and loud; the fix removes the CHURN that keeps a second socket
// unbound, it does not buffer or retry frames.
// ══════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Minimal WebSocket mock — same shape as useWebSocket-teardown.test.ts's mock.
// `close()` models real async behavior: it flips readyState to CLOSING
// immediately (the browser fires onclose later). A socket counts as "live"
// (server-visible) only while OPEN.
// ---------------------------------------------------------------------------
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = MockWebSocket.CONNECTING;

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSING;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateClose(code = 1006) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code }));
  }
}

/** Drive every still-CONNECTING socket to OPEN — models the server accepting
 *  each connection it was handed. */
function serverAcceptsAllPending() {
  for (const s of MockWebSocket.instances) {
    if (s.readyState === MockWebSocket.CONNECTING) {
      act(() => s.simulateOpen());
    }
  }
}

/** Count sockets the server would currently see as live (OPEN). */
function liveSocketCount(): number {
  return MockWebSocket.instances.filter((s) => s.readyState === MockWebSocket.OPEN).length;
}

const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.WebSocket = MockWebSocket as any;
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  vi.useRealTimers();
});

// useGameSocket (App's wrapper) uses autoConnect:false + fixed backoff and
// drives connect() explicitly — mirror that here so the test exercises the
// real production configuration.
const URL = "ws://localhost:8765/ws";
const GAME_SOCKET_OPTS = { url: URL, autoConnect: false, backoff: "fixed" as const };

describe("useWebSocket — 67-8 duplicate-socket elimination (AC2/AC3/AC6)", () => {
  it("AC2: re-firing connect() while a socket is already OPEN never leaves two live sockets", () => {
    // This is the churn the diagnosis pinned: the connect path re-fires (slug-
    // connect effect re-run / reconnect race) while the current socket is still
    // OPEN. The server must never end up with two live connections — exactly the
    // condition that strands one of them in AwaitingConnect.
    const { result } = renderHook(() =>
      useWebSocket({ ...GAME_SOCKET_OPTS, onMessage: () => {} }),
    );

    // First connect → one socket, accepted by the server.
    act(() => result.current.connect());
    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => MockWebSocket.instances[0]!.simulateOpen());
    expect(liveSocketCount()).toBe(1);

    // Connect fires AGAIN while the first socket is still OPEN (the bug trigger).
    act(() => result.current.connect());

    // The server accepts whatever connections the hook handed it.
    serverAcceptsAllPending();

    // INVARIANT: at most one live (OPEN) socket. Pre-fix, createSocket() orphans
    // the first socket OPEN and opens a second → liveSocketCount() === 2 (RED).
    expect(liveSocketCount()).toBe(1);
  });

  it("AC2: connect() while OPEN does not orphan the prior socket in a live state", () => {
    // Sharper framing of the same root cause: whatever the fix shape, the prior
    // socket must not be left OPEN-but-orphaned. Either it was closed
    // (close-and-replace) or it was reused (no-op) — in neither valid outcome is
    // a detached socket still OPEN.
    const { result } = renderHook(() =>
      useWebSocket({ ...GAME_SOCKET_OPTS, onMessage: () => {} }),
    );

    act(() => result.current.connect());
    const firstSocket = MockWebSocket.instances[0]!;
    act(() => firstSocket.simulateOpen());

    act(() => result.current.connect());
    serverAcceptsAllPending();

    const replaced = MockWebSocket.instances.length > 1;
    if (replaced) {
      // A replacement socket was opened → the first MUST have been closed,
      // never left OPEN. Pre-fix: close() is never called on it (RED).
      expect(firstSocket.close).toHaveBeenCalled();
      expect(firstSocket.readyState).not.toBe(MockWebSocket.OPEN);
    } else {
      // No replacement (no-op contract honored) → the original socket is still
      // the single live one, untouched.
      expect(firstSocket.readyState).toBe(MockWebSocket.OPEN);
      expect(firstSocket.close).not.toHaveBeenCalled();
    }
  });

  it("AC3: send() never transmits on a socket that is not OPEN (no frame fired into AwaitingConnect)", () => {
    // The client-side half of "first-attempt roll, no unbound rejection": an
    // action frame must not be flushed into a socket that is still mid-handshake.
    // Combined with the AC2 single-live-socket invariant, the only socket a frame
    // reaches is the bound one → the DICE_THROW lands first try.
    const { result } = renderHook(() =>
      useWebSocket({ ...GAME_SOCKET_OPTS, onMessage: () => {} }),
    );

    act(() => result.current.connect());
    const socket = MockWebSocket.instances[0]!;
    expect(socket.readyState).toBe(MockWebSocket.CONNECTING);

    // Submit a beat frame BEFORE the handshake completes.
    act(() => result.current.send({ type: "DICE_THROW", beat_id: "broadside" }));
    expect(socket.send).not.toHaveBeenCalled();

    // Once OPEN (server bound), the frame goes through.
    act(() => socket.simulateOpen());
    act(() => result.current.send({ type: "DICE_THROW", beat_id: "broadside" }));
    expect(socket.send).toHaveBeenCalledTimes(1);
  });

  it("AC6 regression: a genuine mid-session reconnect still yields exactly one live socket", () => {
    // Guard the fix the other way — eliminating the duplicate must NOT break the
    // legitimate reconnect path. A real server-side drop on a live socket should
    // reconnect to exactly one new live socket, not zero and not two.
    const { result } = renderHook(() =>
      useWebSocket({
        ...GAME_SOCKET_OPTS,
        onMessage: () => {},
        shouldReconnect: () => true,
      }),
    );

    act(() => result.current.connect());
    const first = MockWebSocket.instances[0]!;
    act(() => first.simulateOpen());
    expect(liveSocketCount()).toBe(1);

    // Server drops the live connection (handlers still attached — no teardown).
    act(() => first.simulateClose(1006));

    // Advance past the fixed backoff so the reconnect timer fires createSocket().
    act(() => vi.advanceTimersByTime(2000));
    serverAcceptsAllPending();

    // Exactly one live socket after reconnect: the dropped one is CLOSED, the
    // replacement is OPEN.
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    expect(liveSocketCount()).toBe(1);
    expect(first.readyState).toBe(MockWebSocket.CLOSED);
  });
});
