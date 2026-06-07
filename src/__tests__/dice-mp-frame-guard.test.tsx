/**
 * Ping-pong 2026-06-07 — "[BUG] 3D die face does NOT match the reported roll …
 * AND the beat-math line shows the WRONG stat for the committed beat"
 * (perseus_cloud MP, ship_combat round 2, seat 1).
 *
 * Measured mechanism: the server broadcasts every roller's DICE_REQUEST /
 * DICE_RESULT to the whole room (spectator replay, story 34-12), but App's
 * diceRequest/diceResult are last-write-wins singletons. In MP, a PEER's
 * frames clobber the LOCAL player's in-flight roll: Groucho committed Evasive
 * Maneuver (Reflex) and his TARGET banner showed Chico's `INTELLECT +2 ·
 * TARGET 10`, his die settled on his own physics, and the readout showed a
 * different total — die face ≠ readout ≠ server total. Solo control case
 * (five_points-2): server and UI agree exactly — the divergence is MP-only.
 *
 * Fix under test (the frame guard in App's handleMessage):
 *  - OWN frames (rolling_player_id === currentPlayerId) are always accepted.
 *  - A peer DICE_REQUEST is accepted only when the slot is idle or already
 *    showing a peer — it never clobbers the local player's roll.
 *  - A peer DICE_RESULT is accepted only when it pairs with the DISPLAYED
 *    request (same request_id) — a result under a different banner is the
 *    exact mixed-pair readout from the screenshot.
 *  - Spectating stays alive: with the slot idle, a peer's request+result pair
 *    displays (and replays) normally.
 *
 * Harness cribbed from dice-overlay-wiring-34-5.test.tsx Section 1: GameBoard
 * is stubbed to a prop-serializing element so we trap App's wire side.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import type { DiceRequestPayload, DiceResultPayload } from "@/types/payloads";

// R3F + rapier + dice-lib stubs — App's import graph reaches the canvas
// modules even though the GameBoard stub never renders them (same rationale
// as dice-overlay-wiring-34-5.test.tsx).
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
  useLoader: () => ({ wrapS: 0, wrapT: 0, clone: vi.fn() }),
}));
vi.mock("@react-three/rapier", () => ({
  Physics: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RigidBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CuboidCollider: () => null,
  ConvexHullCollider: () => null,
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@local/dice-lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@local/dice-lib")>();
  return {
    ...actual,
    DiceScene: () => <div data-testid="dice-scene-stub" />,
  };
});

vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: {
    diceRequest?: DiceRequestPayload | null;
    diceResult?: DiceResultPayload | null;
    currentPlayerId?: string;
  }) => (
    <div
      data-testid="gameboard-stub"
      data-dice-request={JSON.stringify(props.diceRequest ?? null)}
      data-dice-result={JSON.stringify(props.diceResult ?? null)}
      data-current-player-id={props.currentPlayerId ?? ""}
    />
  ),
}));

import App from "../App";

// ── Fixtures ──────────────────────────────────────────────────────────────

const CARL_MEMBER = {
  player_id: "carl-pid",
  name: "carl",
  character_name: "Carl",
  class: "Fighter",
  level: 1,
  current_hp: 8,
  max_hp: 8,
  statuses: [],
  current_location: "The Threshold",
  portrait_url: "",
};

const BOB_MEMBER = {
  ...CARL_MEMBER,
  player_id: "bob-pid",
  name: "bob",
  character_name: "Bob",
  class: "Thief",
};

function ownRequest(): DiceRequestPayload {
  return {
    request_id: "req-carl-own",
    rolling_player_id: "carl-pid",
    character_name: "Carl",
    dice: [{ sides: 20, count: 1 }],
    modifier: 1,
    stat: "DEX",
    difficulty: 12,
    context: "Evasive Maneuver — DEX check",
  };
}

function peerRequest(): DiceRequestPayload {
  return {
    request_id: "req-bob-peer",
    rolling_player_id: "bob-pid",
    character_name: "Bob",
    dice: [{ sides: 20, count: 1 }],
    modifier: 2,
    stat: "INT",
    difficulty: 10,
    context: "Broadside — INT check",
  };
}

function peerResult(): DiceResultPayload {
  return {
    request_id: "req-bob-peer",
    rolling_player_id: "bob-pid",
    character_name: "Bob",
    rolls: [{ spec: { sides: 20, count: 1 }, faces: [6] }],
    modifier: 2,
    total: 8,
    difficulty: 10,
    outcome: "Fail",
    seed: 42,
    throw_params: { velocity: [1, 2, 3], angular: [4, 5, 6], position: [0.5, 0.5] },
  };
}

const META = {
  genre_slug: "caverns_and_claudes",
  world_slug: "sunden",
  mode: "multiplayer",
};

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(META), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            caverns_and_claudes: { name: "Caverns & Claudes", worlds: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

let slugCounter = 0;
function freshSlug(): string {
  slugCounter += 1;
  const slug = `sunden-mp-dice-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "carl",
    genre: "caverns_and_claudes",
    world: "sunden",
    last_played_iso: new Date().toISOString(),
    game_slug: slug,
    mode: "multiplayer",
  });
  localStorage.setItem("sidequest-history", JSON.stringify(existing));
  return slug;
}

/** Boot App in-game and bind currentPlayerId=carl-pid via PARTY_STATUS. */
async function bootInGameAsCarl(): Promise<WS> {
  const slug = freshSlug();
  const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
  render(
    <MemoryRouter initialEntries={[`/solo/${slug}`]}>
      <App />
    </MemoryRouter>,
  );
  await server.connected;
  await server.nextMessage;
  server.send({
    type: "SESSION_EVENT",
    payload: { event: "ready", has_character: true },
  });
  await waitFor(() => screen.getByTestId("gameboard-stub"));
  server.send({
    type: "PARTY_STATUS",
    payload: { members: [CARL_MEMBER, BOB_MEMBER], companions: [] },
  });
  await waitFor(() => {
    expect(
      screen.getByTestId("gameboard-stub").getAttribute("data-current-player-id"),
    ).toBe("carl-pid");
  });
  return server;
}

function readDiceRequest(): DiceRequestPayload | null {
  const raw = screen.getByTestId("gameboard-stub").getAttribute("data-dice-request");
  return JSON.parse(raw ?? "null");
}

function readDiceResult(): DiceResultPayload | null {
  const raw = screen.getByTestId("gameboard-stub").getAttribute("data-dice-result");
  return JSON.parse(raw ?? "null");
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "carl");
  vi.stubGlobal("fetch", makeFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

describe("MP dice frame guard — peer frames never clobber the local roll", () => {
  it("keeps the OWN in-flight request when a peer DICE_REQUEST arrives (the wrong-stat banner)", async () => {
    const server = await bootInGameAsCarl();

    server.send({ type: "DICE_REQUEST", payload: ownRequest() });
    await waitFor(() => expect(readDiceRequest()?.request_id).toBe("req-carl-own"));

    server.send({ type: "DICE_REQUEST", payload: peerRequest() });

    // The banner must stay on Carl's Evasive Maneuver (DEX vs 12) — never
    // flip to Bob's INTELLECT +2 / TARGET 10 (the operator screenshot).
    await waitFor(() => {
      const req = readDiceRequest();
      expect(req?.request_id).toBe("req-carl-own");
      expect(req?.stat).toBe("DEX");
    });
  });

  it("drops a peer DICE_RESULT that does not pair with the displayed request (the mixed readout)", async () => {
    const server = await bootInGameAsCarl();

    server.send({ type: "DICE_REQUEST", payload: ownRequest() });
    await waitFor(() => expect(readDiceRequest()?.request_id).toBe("req-carl-own"));

    // Bob's result arrives while Carl's roll is in flight — pre-fix this
    // painted "Rolled 8 vs 10 — Fail" under Carl's banner.
    server.send({ type: "DICE_RESULT", payload: peerResult() });

    // Give the frame a tick to (not) land; the displayed result must stay null.
    await waitFor(() => expect(readDiceRequest()?.request_id).toBe("req-carl-own"));
    expect(readDiceResult()).toBeNull();
  });

  it("still spectates a peer's roll when the slot is idle (request+result pair displays)", async () => {
    const server = await bootInGameAsCarl();

    server.send({ type: "DICE_REQUEST", payload: peerRequest() });
    server.send({ type: "DICE_RESULT", payload: peerResult() });

    await waitFor(() => {
      expect(readDiceRequest()?.request_id).toBe("req-bob-peer");
      expect(readDiceResult()?.total).toBe(8);
    });
  });

  it("lets an OWN request replace a displayed peer roll (own frames always win)", async () => {
    const server = await bootInGameAsCarl();

    server.send({ type: "DICE_REQUEST", payload: peerRequest() });
    await waitFor(() => expect(readDiceRequest()?.request_id).toBe("req-bob-peer"));

    server.send({ type: "DICE_REQUEST", payload: ownRequest() });

    await waitFor(() => {
      expect(readDiceRequest()?.request_id).toBe("req-carl-own");
      expect(readDiceResult()).toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// InlineDiceTray attribution — a spectated roll must name its roller
// ════════════════════════════════════════════════════════════════════════════

import { InlineDiceTray } from "@/dice/InlineDiceTray";

describe("InlineDiceTray attribution — whose roll is this?", () => {
  it("labels a PEER's target banner with the roller's name", () => {
    render(
      <InlineDiceTray
        diceRequest={peerRequest()}
        diceResult={null}
        playerId="carl-pid"
        onThrow={vi.fn()}
        genreSlug="space_opera"
      />,
    );
    const attribution = screen.getByTestId("dice-roller-attribution");
    expect(attribution.textContent).toContain("Bob");
  });

  it("does NOT label the local player's own banner", () => {
    render(
      <InlineDiceTray
        diceRequest={ownRequest()}
        diceResult={null}
        playerId="carl-pid"
        onThrow={vi.fn()}
        genreSlug="space_opera"
      />,
    );
    expect(screen.queryByTestId("dice-roller-attribution")).toBeNull();
  });

  it("names the roller in the result readout", () => {
    render(
      <InlineDiceTray
        diceRequest={peerRequest()}
        diceResult={peerResult()}
        playerId="carl-pid"
        onThrow={vi.fn()}
        genreSlug="space_opera"
      />,
    );
    const readout = screen.getByTestId("dice-result");
    expect(readout.textContent).toContain("Bob rolled");
  });

  it("suppresses a result that does not pair with the displayed request (mixed-pair backstop)", () => {
    // App's frame guard should prevent this state, but the tray is the last
    // line of defense — a result under a different banner must not render.
    render(
      <InlineDiceTray
        diceRequest={ownRequest()}
        diceResult={peerResult()}
        playerId="carl-pid"
        onThrow={vi.fn()}
        genreSlug="space_opera"
      />,
    );
    expect(screen.queryByTestId("dice-result")).toBeNull();
  });
});
