import { render, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import { installWebAudioMock, installLocalStorageMock } from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "../App";

// ══════════════════════════════════════════════════════════════════════════════
// Story 67-9 — RED: Hoist WebSocket connection + slug-connect handshake above
// <Routes> to kill the remount re-handshake (67-8 Layer 2).
//
// CONTEXT (from completed story 67-8, 2026-05-29):
//   The WebSocket connection + slug-connect handshake are owned in `AppInner`,
//   which lives INSIDE the per-route `LobbyRoot` (App.tsx). `LobbyRoot` renders
//   `<LazyDashboard/>` OR `<GameStateProvider><AppInner/></GameStateProvider>`
//   based on `window.location.hash === "#/dashboard"`. So toggling the
//   `#/dashboard` hash UNMOUNTS AppInner (useWebSocket cleanup calls ws.close(),
//   useWebSocket.ts:271) and toggling back REMOUNTS it — recreating the
//   `slugConnectFired` ref (→ false) and re-running the entire connect
//   handshake: a second GET /api/games/:slug, a second `connect()` → second
//   `new WebSocket`, a second SESSION_EVENT{connect}, a second
//   ws.connection_accepted / chargen_gate cycle server-side.
//
//   67-8 Layers 1+3 made that re-handshake HARMLESS (no orphaned duplicate
//   socket; no beat committed while AwaitingConnect) but did NOT remove the
//   churn. 67-9 (Layer 2) removes it at the architectural root by hoisting the
//   connection + handshake to a stable owner ABOVE `<Routes>`, so route /
//   dashboard-hash / StrictMode remounts cannot re-run the handshake.
//
// WHY THE DASHBOARD-HASH TOGGLE IS THE PINNED TRIGGER (not route nav):
//   react-router-dom v6 reconciles routes by element TYPE + position. "/",
//   "/solo/:slug", "/play/:slug" all render `<LobbyRoot/>` — same type at the
//   same reconciler slot, so navigating between them REUSES the instance (refs
//   survive — see lobby-start-ws-open.test.tsx). The remount that resets the
//   ref and re-fires the handshake is the dashboard-hash conditional inside
//   LobbyRoot (and StrictMode double-mount). So these tests exercise the
//   `#/dashboard` toggle — the concrete, deterministic, in-spec trigger.
//
// FIX-AGNOSTIC OBSERVABLES (the client-side proxy for "no second
// ws.connection_accepted cycle" — AC1/AC3): across a mid-session dashboard
// toggle, the client must fire NO second handshake. We count two independent
// signals, neither of which assumes a fix shape:
//   1. GET /api/games/:slug  — step 1 of the handshake (App.tsx:1775)
//   2. `new WebSocket(...)`  — connect() → createSocket() (useWebSocket.ts:158)
// Pre-fix both become 2 after the toggle (RED). Post-fix (connection hoisted
// above <Routes>, outside LobbyRoot's dashboard conditional) both stay 1.
//
// AC3's server-side OTEL half (presence.multi_socket_attach never fires; no
// second chargen_gate span) is a live-playtest acceptance check, mirroring the
// 67-8 disposition — these unit tests cover the trigger-independent CLIENT
// observable. See the TEA deviation logged in the session file.
//
// No-Silent-Fallbacks: a genuine socket drop must still reconnect (covered by
// the already-green useWebSocket-67-8-duplicate-socket.test.ts reconnect
// invariant — AC4 reuse, not re-litigated here).
// ══════════════════════════════════════════════════════════════════════════════

const LOBBY_STORAGE_KEY = "sidequest-connect";
const SLUG = "2026-05-30-hoist-session";

const GAME_META = {
  genre_slug: "low_fantasy",
  world_slug: "greyhawk",
  mode: "solo",
};

// Count GET /api/games/:slug calls — step 1 of the slug-connect handshake.
let gameMetaGetCount = 0;

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (
      typeof url === "string" &&
      /\/api\/games\/[^?]+/.test(url) &&
      (!opts || opts.method !== "POST")
    ) {
      gameMetaGetCount += 1;
      return Promise.resolve(
        new Response(JSON.stringify(GAME_META), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.startsWith("/api/sessions")) {
      return Promise.resolve(
        new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

// Track every `new WebSocket(...)` via a Proxy construct trap. A Proxy (vs. a
// subclass) returns a genuine instance of mock-socket's client class — so its
// server-registration, `instanceof`, static constants (WebSocket.OPEN etc.,
// which App.tsx reads), and live `readyState` all pass straight through, and we
// can both COUNT constructions and inspect each socket's lifecycle state.
let constructedSockets: WebSocket[] = [];

function installWebSocketCounter() {
  const Real = globalThis.WebSocket;
  const Counting = new Proxy(Real, {
    construct(target, args: [string, (string | string[])?]) {
      const sock = new (target as unknown as new (
        ...a: typeof args
      ) => WebSocket)(...args);
      constructedSockets.push(sock);
      return sock;
    },
  });
  globalThis.WebSocket = Counting as unknown as typeof WebSocket;
  return Real;
}

/** Toggle the #/dashboard hash and fire the hashchange LobbyRoot listens for. */
function setDashboard(on: boolean) {
  act(() => {
    window.location.hash = on ? "#/dashboard" : "#/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

/** Flush micro+macrotask queues so any re-fired fetch().then(connect()) chain
 *  settles. The fetch mock resolves immediately, so the pre-fix re-handshake
 *  (2nd GET + 2nd socket) completes within a couple of ticks. */
async function flush(ticks = 4) {
  for (let i = 0; i < ticks; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function seedTrustedIdentity() {
  localStorage.setItem(
    LOBBY_STORAGE_KEY,
    JSON.stringify({ playerName: "Keith", genre: "low_fantasy", world: "greyhawk" }),
  );
  localStorage.setItem("sq:display-name", "Keith");
  // Seed journey history with SLUG so the slug-connect trust gate
  // (App.tsx:1757 — "is this slug known?") recognizes us and the handshake
  // fires without waiting on NamePrompt confirmation.
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "Keith",
        genre: "low_fantasy",
        world: "greyhawk",
        game_slug: SLUG,
        mode: "solo",
        last_played_iso: new Date().toISOString(),
      },
    ]),
  );
}

let server: WS;
let realWebSocket: typeof WebSocket;

beforeEach(() => {
  gameMetaGetCount = 0;
  constructedSockets = [];
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  vi.stubGlobal("fetch", makeFetchMock());
  seedTrustedIdentity();
  server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
  realWebSocket = installWebSocketCounter();
});

afterEach(() => {
  globalThis.WebSocket = realWebSocket;
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "";
  document.documentElement.removeAttribute("data-archetype");
});

/** Mount real <App> at /solo/:slug and drive the first handshake to completion.
 *  Returns once SESSION_EVENT{connect} has been received by the server. */
async function mountAndConnect() {
  render(
    <MemoryRouter initialEntries={[`/solo/${SLUG}`]}>
      <App />
    </MemoryRouter>,
  );
  await server.connected;
  const connectMsg = (await server.nextMessage) as {
    type: string;
    payload: Record<string, unknown>;
  };
  expect(connectMsg.type).toBe("SESSION_EVENT");
  expect(connectMsg.payload.event).toBe("connect");
  expect(connectMsg.payload.game_slug).toBe(SLUG);
  // Settle the server into a bound session so AppInner is in steady state.
  act(() => {
    server.send({ type: "SESSION_EVENT", payload: { event: "connected" } });
  });
}

describe("App — 67-9: connection + slug-connect handshake hoisted above <Routes>", () => {
  it("AC5 (baseline/regression): a clean slug mount fires the connect handshake exactly once", async () => {
    // Guards the hoist against breaking the initial handshake: one GET, one
    // socket, one SESSION_EVENT{connect}. Passes pre- and post-fix — its job
    // is to prove the harness drives the real handshake and that 67-9 must not
    // regress first-connect. (This same mount IS the wiring proof: the
    // production <App>/<AppRoutes>/<LobbyRoot> path reaches the handshake.)
    await mountAndConnect();
    await flush();

    expect(gameMetaGetCount).toBe(1);
    expect(constructedSockets).toHaveLength(1);
  });

  it("AC1/AC3 (RED): a mid-session #/dashboard toggle fires NO second GET /api/games/:slug", async () => {
    await mountAndConnect();
    expect(gameMetaGetCount).toBe(1);

    // Operator opens the GM dashboard, then closes it — mid-session.
    setDashboard(true);
    await flush();
    setDashboard(false);
    await flush();

    // INVARIANT (AC1): the connect handshake is owned above <Routes>, so the
    // dashboard remount does NOT re-run it. Pre-fix: AppInner unmounts on
    // #/dashboard, remounts on toggle-off with a fresh slugConnectFired ref,
    // and the slug-connect effect re-fetches metadata → gameMetaGetCount === 2.
    expect(gameMetaGetCount).toBe(1);
  });

  it("AC1/AC3 (RED): a mid-session #/dashboard toggle opens NO second WebSocket", async () => {
    await mountAndConnect();
    expect(constructedSockets).toHaveLength(1);

    setDashboard(true);
    await flush();
    setDashboard(false);
    await flush();

    // INVARIANT (AC1/AC3 client half): no second `ws.connection_accepted`
    // cycle. Pre-fix: AppInner unmount closes the socket (useWebSocket.ts:271)
    // and the remount's re-fired connect() opens a second one →
    // constructedSockets.length === 2. Post-fix the connection lives above
    // <Routes> and survives the toggle → exactly one socket per page-session.
    expect(constructedSockets).toHaveLength(1);
  });

  it("AC2 (RED): the connection persists across the dashboard toggle — the original socket stays OPEN, never torn down", async () => {
    await mountAndConnect();
    expect(constructedSockets).toHaveLength(1);
    const firstSocket = constructedSockets[0]!;
    expect(firstSocket.readyState).toBe(WebSocket.OPEN);

    setDashboard(true);
    await flush();
    setDashboard(false);
    await flush();

    // AC2: the slug-connect handshake fires once per page-session, owned above
    // the per-route dashboard toggle — so the original connection is never
    // closed by the toggle and no replacement socket is stood up. Pre-fix:
    // AppInner's unmount runs useWebSocket's cleanup (ws.close(),
    // useWebSocket.ts:271) → firstSocket transitions to CLOSED, and the
    // remount opens a second socket (RED on BOTH assertions).
    expect(firstSocket.readyState).toBe(WebSocket.OPEN);
    expect(constructedSockets).toHaveLength(1);
  });

  it("AC4 (regression guardrail): the initial handshake still sends a well-formed SESSION_EVENT{connect}", async () => {
    // The hoist must preserve the connect payload contract (player_name +
    // game_slug + event) that slug-resume and chargen depend on. A behavioral
    // check that the handshake the playgroup relies on is intact post-hoist.
    render(
      <MemoryRouter initialEntries={[`/solo/${SLUG}`]}>
        <App />
      </MemoryRouter>,
    );
    await server.connected;
    const connectMsg = (await server.nextMessage) as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(connectMsg.payload.event).toBe("connect");
    expect(connectMsg.payload.game_slug).toBe(SLUG);
    expect(connectMsg.payload.player_name).toBe("Keith");

    await waitFor(() => expect(gameMetaGetCount).toBe(1));
  });
});
