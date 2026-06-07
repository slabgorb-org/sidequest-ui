/**
 * Story 97-3 (RED) — Dice banner DC has two sources of truth.
 *
 * Measured (ping-pong 2026-06-07 dice entry, FIXER notes ui #352): the
 * pre-roll TARGET banner shows a CLIENT-side formula — `handleBeatSelect`
 * arms a local DiceRequest with `rawDc = clamp(10 + |beat.base|*2, 10..30)`
 * (App.tsx) — while the server resolves against its own effective difficulty
 * (`ruleset.attack_params(...).target_number`). Under SWN/hp_depletion the
 * server number is the opponent's armor class, which the client cannot know.
 * Chico repro: total=12 vs displayed DC 12 → Fail, because the server's
 * effective DC wasn't 12. This breaks THE Sebastien/Jade player-facing math
 * surface (CLAUDE.md: "expose the math behind mechanical resolution").
 *
 * Fix contract pinned here (companion server suite:
 * tests/server/test_dice_dc_single_source_97_3.py): the server authors a
 * per-beat `difficulty` on the CONFRONTATION beat offer, and the client
 * banner renders THAT number. The client formula dies.
 *
 *  1. handleBeatSelect arms the dice request with the server-authored
 *     beat.difficulty — NOT the local base-derived formula.
 *  2. A beat offer missing `difficulty` is refused LOUDLY (no dice request
 *     armed) — falling back to the client formula would be exactly the
 *     silent fallback CLAUDE.md forbids, and it is the current bug.
 *
 * Harness pattern: `combat-player-echo-wiring.test.tsx` — GameBoard is
 * stubbed to a prop-latching element so we trap App's production wire→state→
 * prop chain (the armed diceRequest App hands down is the banner source:
 * InlineDiceTray renders `diceRequest.difficulty` as TARGET).
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import type {
  ConfrontationData,
  BeatOption,
} from "@/components/ConfrontationOverlay";
import type { DiceRequestPayload, DiceThrowParams } from "@/types/payloads";

// Shared holder so the test can invoke the production handlers App threads
// down to GameBoard, and read the armed diceRequest (the TARGET banner
// source). vi.hoisted runs before the GameBoard mock factory below.
const board = vi.hoisted(() => ({
  confrontationData: null as ConfrontationData | null,
  currentPlayerId: "" as string,
  diceRequest: null as DiceRequestPayload | null,
  onBeatSelect: null as null | ((beatId: string, playerAction?: string) => void),
  onDiceThrow: null as null | ((params: DiceThrowParams, face: number[]) => void),
}));

vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: {
    confrontationData?: ConfrontationData | null;
    currentPlayerId?: string;
    diceRequest?: DiceRequestPayload | null;
    onBeatSelect?: (beatId: string, playerAction?: string) => void;
    onDiceThrow?: (params: DiceThrowParams, face: number[]) => void;
  }) => {
    board.confrontationData = props.confrontationData ?? null;
    board.currentPlayerId = props.currentPlayerId ?? "";
    board.diceRequest = props.diceRequest ?? null;
    board.onBeatSelect = props.onBeatSelect ?? null;
    board.onDiceThrow = props.onDiceThrow ?? null;
    return <div data-testid="gameboard-stub" />;
  },
}));

import App from "../App";

// ── Fixtures ────────────────────────────────────────────────────────────────

const VANE_MEMBER = {
  player_id: "vane-pid",
  name: "vane",
  character_name: "Vane",
  class: "Warrior",
  level: 2,
  current_hp: 10,
  max_hp: 10,
  statuses: [],
  current_location: "Spaceport Docks",
  portrait_url: "",
  sheet: {
    // PHYSIQUE 12 — the client's legacy native curve floor((12-10)/2) = +1.
    stats: { PHYSIQUE: 12, REFLEX: 12, INTELLECT: 12, CUNNING: 12, RESOLVE: 12, INFLUENCE: 12 },
    abilities: [],
    backstory: "",
  },
};

// base=2 → the dead client formula says clamp(10 + 2*2) = 14. The server
// (SWN) authored 17 — the opponent's armor class. If the armed request says
// 14, the client formula is still alive and the banner lies (the bug).
const SERVER_DC = 17;
const CLIENT_FORMULA_DC = 14;

const SHOOT_BEAT: BeatOption & { difficulty?: number } = {
  id: "shoot",
  label: "Open Fire",
  kind: "strike",
  base: 2,
  stat_check: "REFLEX",
  difficulty: SERVER_DC,
};

// Same beat shape but the server forgot to author a DC — the offer is
// malformed under the 97-3 contract. Arming the formula DC instead would be
// a silent fallback (CLAUDE.md), i.e. the exact pre-fix behavior.
const NAKED_BEAT: BeatOption = {
  id: "stab",
  label: "Stab",
  kind: "strike",
  base: 2,
  stat_check: "REFLEX",
};

function confrontation(beats: BeatOption[]): ConfrontationData {
  return {
    type: "combat",
    label: "Spaceport Firefight",
    category: "combat",
    actors: [
      { name: "Vane", role: "combatant" },
      { name: "Scrag", role: "combatant" },
    ],
    player_metric: { name: "momentum", current: 0, starting: 0, threshold: 7 },
    opponent_metric: { name: "momentum", current: 0, starting: 0, threshold: 7 },
    beats,
    secondary_stats: null,
    genre_slug: "space_opera",
    mood: "tense",
  };
}

const META = {
  genre_slug: "space_opera",
  world_slug: "perseus_cloud",
  mode: "solo",
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
          JSON.stringify({ space_opera: { name: "Space Opera", worlds: [] } }),
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
  const slug = `perseus-dc-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "vane",
    genre: "space_opera",
    world: "perseus_cloud",
    last_played_iso: new Date().toISOString(),
    game_slug: slug,
    mode: "solo",
  });
  localStorage.setItem("sidequest-history", JSON.stringify(existing));
  return slug;
}

/** Boot App against a mock socket and drive it to an in-game confrontation. */
async function bootWithConfrontation(beats: BeatOption[]): Promise<WS> {
  const slug = freshSlug();
  const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
  render(
    <MemoryRouter initialEntries={[`/solo/${slug}`]}>
      <App />
    </MemoryRouter>,
  );
  await server.connected;
  await server.nextMessage; // initial client frame
  server.send({
    type: "CHARACTER_CREATION",
    payload: { phase: "complete", character: { core: { name: "Vane" } } },
  });
  server.send({
    type: "SESSION_EVENT",
    payload: { event: "ready", has_character: true },
  });
  await waitFor(() => screen.getByTestId("gameboard-stub"));
  server.send({
    type: "PARTY_STATUS",
    payload: { members: [VANE_MEMBER], companions: [] },
  });
  server.send({ type: "CONFRONTATION", payload: confrontation(beats) });
  await waitFor(() => expect(board.confrontationData).not.toBeNull());
  await waitFor(() => expect(board.currentPlayerId).toBe("vane-pid"));
  return server;
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "vane");
  vi.stubGlobal("fetch", makeFetchMock());
  board.confrontationData = null;
  board.currentPlayerId = "";
  board.diceRequest = null;
  board.onBeatSelect = null;
  board.onDiceThrow = null;
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

describe("97-3: the TARGET banner renders the server-authored DC, not a client formula", () => {
  it("arms the dice request with beat.difficulty from the server beat offer", async () => {
    await bootWithConfrontation([SHOOT_BEAT]);

    expect(board.onBeatSelect).toBeTypeOf("function");
    act(() => {
      board.onBeatSelect!("shoot", "I open fire");
    });

    await waitFor(() => expect(board.diceRequest).not.toBeNull());
    // The armed request IS the banner: InlineDiceTray renders
    // `diceRequest.difficulty` as TARGET. It must be the server's number.
    expect(board.diceRequest!.difficulty).toBe(SERVER_DC);
    // And explicitly NOT the resurrected client formula — equality with 14
    // here means `rawDc = clamp(10 + |base|*2)` is still the author.
    expect(board.diceRequest!.difficulty).not.toBe(CLIENT_FORMULA_DC);
  });

  it("refuses a beat offer with no server-authored difficulty — loudly, with no formula fallback", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await bootWithConfrontation([NAKED_BEAT]);

      expect(board.onBeatSelect).toBeTypeOf("function");
      act(() => {
        board.onBeatSelect!("stab", "I stab");
      });

      // No request may be armed: computing clamp(10 + |base|*2) locally and
      // showing it would be a silent fallback to the very bug under test.
      // Settle the microtask queue, then assert nothing got armed.
      await act(async () => {
        await Promise.resolve();
      });
      expect(board.diceRequest).toBeNull();

      // And the refusal is LOUD (No Silent Fallbacks): one of the consoles
      // carries a message naming the missing difficulty.
      const allCalls = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .filter((a): a is string => typeof a === "string");
      expect(
        allCalls.some((msg) => /difficulty/i.test(msg)),
        `expected a loud console message naming the missing difficulty; got: ${JSON.stringify(allCalls)}`,
      ).toBe(true);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
