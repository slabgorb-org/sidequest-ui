// Transient-error auto-clear wiring test — Story 71-3.
//
// The transient-error banner ("Your action couldn't be processed") was set on
// non-fatal ERROR frames but never auto-cleared: it persisted until the user
// clicked Dismiss, even after the connection recovered or a turn succeeded.
//
// Per CLAUDE.md "Verify Wiring, Not Just Existence" + "No Source-Text Wiring
// Tests": these tests drive the REAL `App` through a mocked WebSocket server
// (jest-websocket-mock) and assert the message → state → banner pipeline is
// connected end-to-end. They prove the AC-1 reconnect-clear effect and the
// AC-2 NARRATION_END clear are actually mounted in App.tsx and reachable from
// the live handleMessage / effect paths — not just that setTransientError(null)
// exists in the source.
//
// Coverage:
//   AC-1  successful reconnect (socket drops 1006 → reconnects OPEN) clears it
//   AC-2  NARRATION_END (turn round-trip completes) clears it
//   AC-3  manual Dismiss still clears it (regression guard)
//   AC-4  a failed/in-progress reconnect does NOT clear it
//   AC-4  an unrelated streaming NARRATION frame (not a turn boundary) does NOT clear it

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "../App";

const SLUG = "2026-04-22-moldharrow-keep";
const GAME_META = {
  genre_slug: "low_fantasy",
  world_slug: "greyhawk",
  mode: "multiplayer",
};

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(GAME_META), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ low_fantasy: { name: "Low Fantasy", worlds: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

const wsUrl = `ws://${location.host}/ws`;

// A non-fatal ERROR frame that lands on the transient path: code is not in
// FATAL_ERROR_CODES, not "session_unbound", and reconnect_required is falsy.
const TRANSIENT_ERROR = {
  type: "ERROR",
  payload: {
    code: "invalid_action",
    message: "That action couldn't be processed. Your session is still active.",
    reconnect_required: false,
  },
};

function renderApp() {
  return render(
    <MemoryRouter initialEntries={[`/play/${SLUG}`]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "alice");
  // Seed journey history so AppInner's slug-mode trust gate treats this as an
  // existing identity and fires the WS connect (rather than the NamePrompt).
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "alice",
        genre: "low_fantasy",
        world: "greyhawk",
        last_played_iso: new Date().toISOString(),
        game_slug: SLUG,
        mode: "multiplayer",
      },
    ]),
  );
  vi.stubGlobal("fetch", makeFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

async function connectAndRaiseError(server: WS) {
  await server.connected;
  await server.nextMessage; // consume the SESSION_EVENT{connect} handshake

  // No banner before the server rejects anything.
  expect(screen.queryByTestId("transient-error-banner")).toBeNull();

  act(() => {
    server.send(TRANSIENT_ERROR);
  });

  await waitFor(() => {
    expect(screen.getByTestId("transient-error-banner")).toBeInTheDocument();
  });
}

describe("transient-error banner auto-clear wiring (71-3)", () => {
  it("AC-2: clears the banner when NARRATION_END completes a turn round-trip", async () => {
    const server = new WS(wsUrl, { jsonProtocol: true });
    renderApp();
    await connectAndRaiseError(server);

    act(() => {
      server.send({ type: "NARRATION_END", payload: {} });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("transient-error-banner")).toBeNull();
    });
  });

  it("AC-3: manual Dismiss still clears the banner (regression)", async () => {
    const user = userEvent.setup();
    const server = new WS(wsUrl, { jsonProtocol: true });
    renderApp();
    await connectAndRaiseError(server);

    await user.click(screen.getByRole("button", { name: /dismiss error/i }));

    expect(screen.queryByTestId("transient-error-banner")).toBeNull();
  });

  it("AC-4: a streaming NARRATION frame (not a turn boundary) does NOT clear it", async () => {
    const server = new WS(wsUrl, { jsonProtocol: true });
    renderApp();
    await connectAndRaiseError(server);

    act(() => {
      // A non-terminal narration frame — e.g. mid-turn or a peer's narration
      // in MP. It is NOT NARRATION_END, so it must not clear the banner.
      server.send({ type: "NARRATION", payload: { text: "The hall is quiet." } });
    });

    // Give the handler a tick to process, then assert the banner survived.
    await Promise.resolve();
    expect(screen.getByTestId("transient-error-banner")).toBeInTheDocument();
  });

  it("AC-1: clears the banner once the socket successfully reconnects", async () => {
    const server = new WS(wsUrl, { jsonProtocol: true });
    renderApp();
    await connectAndRaiseError(server);

    // Unintentional drop (code 1006, not clean) → the hook flips
    // isReconnecting true and schedules a reconnect (shouldReconnect: code !==
    // 1000). The error persists while reconnecting (AC-4).
    act(() => {
      server.close({ code: 1006, reason: "drop", wasClean: false });
    });

    await waitFor(() => {
      expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
    });

    // Bring up a fresh server so the scheduled reconnect (1s backoff) succeeds.
    const reconnected = new WS(wsUrl, { jsonProtocol: true });
    await reconnected.connected;

    // On the OPEN-and-not-reconnecting transition the AC-1 effect fires.
    await waitFor(
      () => {
        expect(screen.queryByTestId("transient-error-banner")).toBeNull();
      },
      { timeout: 5000 },
    );
  });

  it("AC-4: a failed/in-progress reconnect does NOT clear the banner", async () => {
    const server = new WS(wsUrl, { jsonProtocol: true });
    renderApp();
    await connectAndRaiseError(server);

    // Drop the socket (1006) and do NOT bring up a replacement server — the
    // client stays in the reconnect loop, never reaching OPEN. The stale error
    // must survive so the player still sees that their last action bounced.
    act(() => {
      server.close({ code: 1006, reason: "drop", wasClean: false });
    });

    await waitFor(() => {
      // ReconnectBanner ("Reconnecting…") confirms we are mid-reconnect.
      expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
    });

    // The transient error is still on screen during the failed reconnect.
    expect(screen.getByTestId("transient-error-banner")).toBeInTheDocument();
  });
});
