import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import { installWebAudioMock, installLocalStorageMock } from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "../App";

// ══════════════════════════════════════════════════════════════════════════════
// Ping-pong 2026-06-07 — "[BUG] UI: after server restart, client auto-reconnects
// the socket but never re-binds the session".
//
// THE DEFECT CHAIN (measured against App.tsx on develop @ #349):
//   1. Server restarts → socket drops → useWebSocket schedules backoff retries.
//   2. A retry against the still-down server fires `onerror` → App's
//      `if (error) clearSession()` effect (App.tsx ~2030) wipes the
//      sessionStorage row.
//   3. Server comes back → socket reopens → the re-handshake effect
//      (App.tsx ~2002) runs, but `loadSession()` is now null — it falls
//      through SILENTLY and binds nothing.
//   4. The player types into an OPEN-but-unbound socket →
//      `session.message_rejected_unbound type=PLAYER_ACTION` server-side,
//      red "Cannot process PLAYER_ACTION: not connected" banner client-side.
//
// THE FIX CONTRACT pinned here: the re-handshake must key off the URL slug
// (the authoritative session identity for the whole /solo/:slug mount — the
// same identity the slug-connect effect and a manual page reload use), so a
// cleared sessionStorage row cannot disarm the rebind.
//
// These tests reproduce step 2's effect deterministically by removing the
// saved-session row directly (exactly what clearSession() does), instead of
// racing a real failed-retry `onerror` through mock-socket timing.
// ══════════════════════════════════════════════════════════════════════════════

const LOBBY_STORAGE_KEY = "sidequest-connect";
const SESSION_KEY = "sidequest-session";
const SLUG = "2026-06-07-reconnect-rebind";
const APP_WS_URL = `ws://${location.host}/ws`;

const GAME_META = {
  genre_slug: "low_fantasy",
  world_slug: "greyhawk",
  mode: "solo",
};

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (
      typeof url === "string" &&
      /\/api\/games\/[^?]+/.test(url) &&
      (!opts || opts.method !== "POST")
    ) {
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
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

function seedTrustedIdentity() {
  localStorage.setItem(
    LOBBY_STORAGE_KEY,
    JSON.stringify({ playerName: "Keith", genre: "low_fantasy", world: "greyhawk" }),
  );
  localStorage.setItem("sq:display-name", "Keith");
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

/** Wait real milliseconds inside act() — the reconnect backoff runs on real
 *  timers (useWebSocket INITIAL_BACKOFF_MS = 1000). */
async function waitMs(ms: number) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

let server: WS;

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  vi.stubGlobal("fetch", makeFetchMock());
  seedTrustedIdentity();
  server = new WS(APP_WS_URL, { jsonProtocol: true });
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

/** Mount real <App> at /solo/:slug and drive the first handshake to a bound,
 *  steady-state session. */
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
  act(() => {
    server.send({ type: "SESSION_EVENT", payload: { event: "connected" } });
  });
}

describe("App — reconnect re-bind survives a cleared saved session (ping-pong 2026-06-07)", () => {
  it(
    "re-sends SESSION_EVENT{connect} with the URL slug after a server restart, even when the saved session was wiped by the error→clearSession path",
    async () => {
      await mountAndConnect();

      // Step 2 of the defect chain: a failed retry's onerror ran clearSession().
      // Reproduce its exact effect deterministically.
      sessionStorage.removeItem(SESSION_KEY);

      // Server "restarts": kill every connection abnormally (code !== 1000 so
      // useWebSocket schedules a reconnect), tear the server down, stand up a
      // replacement at the same URL.
      server.close({ code: 1006, reason: "server restart", wasClean: false });
      WS.clean();
      server = new WS(APP_WS_URL, { jsonProtocol: true });

      // The client's backoff reconnect (1000ms initial) reopens the socket.
      await waitMs(1300);
      await server.connected;

      // THE INVARIANT: the reopened socket must be re-bound. Pre-fix the
      // re-handshake read loadSession() (null — wiped above) and silently
      // skipped the rebind; the next PLAYER_ACTION died with
      // session.message_rejected_unbound. Post-fix the rebind keys off the
      // URL slug and fires regardless of sessionStorage state.
      const rebind = (await server.nextMessage) as {
        type: string;
        payload: Record<string, unknown>;
      };
      expect(rebind.type).toBe("SESSION_EVENT");
      expect(rebind.payload.event).toBe("connect");
      expect(rebind.payload.game_slug).toBe(SLUG);
      expect(rebind.payload.player_name).toBe("Keith");
    },
    15000,
  );

  it(
    "re-binds on reconnect in the ordinary case too (saved session intact) — regression guard for the pre-existing path",
    async () => {
      await mountAndConnect();

      server.close({ code: 1006, reason: "server restart", wasClean: false });
      WS.clean();
      server = new WS(APP_WS_URL, { jsonProtocol: true });

      await waitMs(1300);
      await server.connected;

      const rebind = (await server.nextMessage) as {
        type: string;
        payload: Record<string, unknown>;
      };
      expect(rebind.type).toBe("SESSION_EVENT");
      expect(rebind.payload.event).toBe("connect");
      expect(rebind.payload.game_slug).toBe(SLUG);
    },
    15000,
  );
});
