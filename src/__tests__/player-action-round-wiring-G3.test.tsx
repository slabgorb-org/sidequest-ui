// sq-playtest 2026-05-28 #G3 — solo PLAYER_ACTION must carry payload.round + player_id.
//
// The bug: handleSend in App.tsx built the PLAYER_ACTION GameMessage as
//   { type: PLAYER_ACTION, payload: { action, aside }, player_id: "" }
// — with NO `payload.round` and an empty envelope `player_id`. The server's
// GameMessage schema REQUIRES PlayerActionPayload.round (ge=0, No Silent
// Fallbacks), so every solo submit failed validation (`ws.malformed_json`) and
// the socket was torn down before any handler ran — no solo turn could resolve.
//
// Per CLAUDE.md "Verify Wiring, Not Just Existence" + "No Source-Text Wiring
// Tests": this drives the REAL `App` through a mocked WebSocket and a GameBoard
// stub that forwards App's actual `onSend` callback, then inspects the message
// that actually reaches the wire. It asserts the live ADR-051 round and the
// seated player_id are threaded onto the outgoing PLAYER_ACTION — the exact
// fields whose absence bricked the solo playtest.

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

// Stub GameBoard, exposing the REAL App onSend callback as a button so the
// production handleSend path is exercised genuinely.
vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: { onSend?: (text: string, aside: boolean) => void }) => (
    <div data-testid="gameboard-stub">
      <button type="button" onClick={() => props.onSend?.("I take the second mug", false)}>
        stub-send
      </button>
    </div>
  ),
}));

const SLUG = "2026-05-28-glenross";
const GAME_META = { genre_slug: "tea_and_murder", world_slug: "glenross", mode: "single" };

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
        new Response(JSON.stringify({ tea_and_murder: { name: "Tea & Murder", worlds: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

const wsUrl = `ws://${location.host}/ws`;

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
  localStorage.setItem("sq:display-name", "Vyvyan");
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "Vyvyan",
        genre: "tea_and_murder",
        world: "glenross",
        last_played_iso: new Date().toISOString(),
        game_slug: SLUG,
        mode: "single",
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

describe("#G3 — PLAYER_ACTION submit carries round + player_id", () => {
  it("threads the live ADR-051 round and the seated player_id onto the wire message", async () => {
    const user = userEvent.setup();
    const server = new WS(wsUrl, { jsonProtocol: true });
    renderApp();

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT{connect}

    // Reach the game phase (chargen-bypass: ready + has_character).
    act(() => {
      server.send({ type: "SESSION_EVENT", payload: { event: "ready", has_character: true } });
    });
    await waitFor(() => {
      expect(screen.getByTestId("gameboard-stub")).toBeInTheDocument();
    });

    // Seat the local player so currentPlayerId resolves (matched by name).
    act(() => {
      server.send({
        type: "PARTY_STATUS",
        payload: { members: [{ player_id: "p_vyvyan", name: "Vyvyan", character_name: "Vyvyan" }] },
      });
    });

    // Advance the live round to 3 via an ACTION_REVEAL so we can prove the
    // submit threads the CURRENT round, not a hardcoded 0.
    act(() => {
      server.send({
        type: "ACTION_REVEAL",
        payload: {
          player_id: "p_other",
          character_name: "Neil",
          status: "composing",
          action: "",
          aside: false,
          seq: 1,
          round: 3,
        },
      });
    });

    // Real submit through App's handleSend.
    await user.click(screen.getByRole("button", { name: "stub-send" }));

    const sent = (await server.nextMessage) as {
      type: string;
      payload: { action: string; round?: number; aside?: boolean };
      player_id: string;
    };

    expect(sent.type).toBe("PLAYER_ACTION");
    expect(sent.payload.action).toBe("I take the second mug");
    // The #G3 fix: round is present, numeric, and the live round (3) — not missing.
    expect(typeof sent.payload.round).toBe("number");
    expect(sent.payload.round).toBe(3);
    // The seated player id rides the envelope, not the empty string.
    expect(sent.player_id).toBe("p_vyvyan");
  });
});
