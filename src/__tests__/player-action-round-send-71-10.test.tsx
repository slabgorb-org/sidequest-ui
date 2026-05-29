/**
 * Story 71-10 (RED) — the outbound PLAYER_ACTION carries the CURRENT round.
 *
 * AC-2: the UI must stamp `round: currentRound` on the player-action it sends,
 * so the server (and, on replay, the transcript) can anchor peer entries by
 * exact round instead of arrival position.
 *
 * This drives the REAL App through a mocked WebSocket (jest-websocket-mock):
 *   1. reach the game phase (GameBoard — here a stub exposing App's onSend),
 *   2. ADVANCE the round by delivering an ACTION_REVEAL{round:N} (App.tsx sets
 *      currentRound from this frame, App.tsx:870),
 *   3. submit a real action through App's handleSend,
 *   4. assert the PLAYER_ACTION that reaches the server carries round = N.
 *
 * Advancing the round BEFORE submit is the load-bearing part: `handleSend`'s
 * useCallback deps are `[send, executeSlashCommand, toggleWidget]` — they do
 * NOT include currentRound. A naive `round: currentRound` added to the payload
 * would capture a STALE round (the value at first memoization, 0). Two distinct
 * round values also guard against a hardcoded literal. So this test fails both
 * when round is absent (undefined) and when it is stale/hardcoded.
 *
 * RED: PLAYER_ACTION carries no round today, so `sent.payload.round` is
 * undefined.
 */
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

vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: { onSend?: (text: string, aside: boolean) => void }) => (
    <div data-testid="gameboard-stub">
      <button type="button" onClick={() => props.onSend?.("I breach the airlock", false)}>
        stub-send
      </button>
    </div>
  ),
}));

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

function actionReveal(round: number) {
  return {
    type: "ACTION_REVEAL",
    payload: {
      player_id: "p2",
      character_name: "Bob",
      status: "submitted",
      action: "I cover the corridor",
      aside: false,
      seq: 1,
      round,
    },
    player_id: "p2",
  };
}

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

async function reachGame(server: WS) {
  await server.connected;
  await server.nextMessage; // consume SESSION_EVENT{connect} handshake

  act(() => {
    server.send({
      type: "SESSION_EVENT",
      payload: { event: "ready", has_character: true },
    });
  });
  await waitFor(() => {
    expect(screen.getByTestId("gameboard-stub")).toBeInTheDocument();
  });
}

// The PLAYER_ACTION reaches the server carrying whatever round was current at
// submit time. Drive currentRound via ACTION_REVEAL, submit, assert.
async function submitAtRoundAndReadAction(server: WS, round: number) {
  const user = userEvent.setup();
  renderApp();
  await reachGame(server);

  // Advance the round counter (App sets currentRound from the ACTION_REVEAL).
  act(() => {
    server.send(actionReveal(round));
  });

  await user.click(screen.getByRole("button", { name: "stub-send" }));
  const sent = (await server.nextMessage) as {
    type: string;
    payload: { action: string; round?: number };
  };
  expect(sent.type).toBe("PLAYER_ACTION");
  expect(sent.payload.action).toBe("I breach the airlock");
  return sent;
}

describe("71-10 AC-2 — outbound PLAYER_ACTION carries the current round", () => {
  it("stamps the round that was current at submit time (round 3)", async () => {
    const server = new WS(wsUrl, { jsonProtocol: true });
    const sent = await submitAtRoundAndReadAction(server, 3);
    expect(sent.payload.round).toBe(3);
  });

  it("tracks a different current round (round 5) — not stale, not hardcoded", async () => {
    const server = new WS(wsUrl, { jsonProtocol: true });
    const sent = await submitAtRoundAndReadAction(server, 5);
    expect(sent.payload.round).toBe(5);
  });
});
