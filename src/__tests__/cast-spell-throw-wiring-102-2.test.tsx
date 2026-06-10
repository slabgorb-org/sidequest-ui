/**
 * Story 102-2 — WIRING: the chosen spell rides the DICE_THROW to the server.
 *
 * Measured AC5b gap #2 (epic 102): the UI's primary path (beat tile →
 * DICE_THROW → dispatch) has no `spell_id`, so the server resolves "Work a
 * Spell" as a generic INT throw — no `wwn.spell.cast`, no cast spent.
 *
 * Contract pinned here, against App's PRODUCTION beat-commit chain (GameBoard
 * stubbed to a prop trap — we test App's side of the wire, not GameBoard's
 * render tree; harness pattern: combat-player-echo-wiring.test.tsx):
 *
 *  1. A cast-beat commit (`onBeatSelect("cast_spell", playerAction,
 *     "wracking_bolt")`) latches the spell alongside the typed action; when
 *     the dice settle, the outbound DICE_THROW carries
 *     `spell_id: "wracking_bolt"` AND the typed `player_action` (Zork
 *     Problem guardrail — the picker is an alternate submit verb layered on
 *     typed text, never a replacement for it).
 *  2. Regression: a non-cast commit produces a DICE_THROW with NO spell_id
 *     key — the pre-102-2 wire shape, byte-for-byte.
 *  3. The latched spell is consumed atomically with the beat: the next
 *     (non-cast) commit must not leak the previous throw's spell_id.
 *
 * Server-side mirror: sidequest-server/tests/integration/
 * test_dice_path_spell_cast_102_2.py + the protocol suite.
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
import { MessageType } from "@/types/protocol";
import type { GameMessage } from "@/types/protocol";
import type {
  BeatOption,
  ConfrontationData,
} from "@/components/ConfrontationOverlay";
import type { DiceThrowParams } from "@/types/payloads";

// Shared holder for the production handlers App threads down to GameBoard.
// vi.hoisted runs before the GameBoard mock factory below. The third
// onBeatSelect parameter is the 102-2 contract under test.
const board = vi.hoisted(() => ({
  confrontationData: null as ConfrontationData | null,
  currentPlayerId: "" as string,
  onBeatSelect: null as
    | null
    | ((beatId: string, playerAction?: string, spellId?: string) => void),
  onDiceThrow: null as null | ((params: DiceThrowParams, face: number[]) => void),
}));

// GameBoard stub: trap App's call site. Anything richer defeats the purpose.
vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: {
    messages: GameMessage[];
    confrontationData?: ConfrontationData | null;
    currentPlayerId?: string;
    onBeatSelect?: (beatId: string, playerAction?: string, spellId?: string) => void;
    onDiceThrow?: (params: DiceThrowParams, face: number[]) => void;
  }) => {
    board.confrontationData = props.confrontationData ?? null;
    board.currentPlayerId = props.currentPlayerId ?? "";
    board.onBeatSelect = props.onBeatSelect ?? null;
    board.onDiceThrow = props.onDiceThrow ?? null;
    return <div data-testid="gameboard-stub" />;
  },
}));

import App from "../App";

// ── Fixtures ────────────────────────────────────────────────────────────────

const VESSKA_MEMBER = {
  player_id: "vesska-pid",
  name: "vesska",
  character_name: "Vesska",
  class: "Necromancer",
  level: 1,
  current_hp: 12,
  max_hp: 12,
  statuses: [],
  current_location: "The Reliquary Gate",
  portrait_url: "",
};

const STRIKE_BEAT: BeatOption = {
  id: "strike",
  label: "Strike",
  kind: "strike",
  base: 2,
  stat_check: "STR",
  difficulty: 14,
};

const CAST_BEAT: BeatOption = {
  id: "cast_spell",
  label: "Work a Spell",
  kind: "strike",
  base: 2,
  stat_check: "INT",
  difficulty: 12,
};

// `spellcasting` mirrors the server projection contract (102-2 server suite).
function confrontation(): ConfrontationData & {
  spellcasting?: { casts_remaining: number; casts_per_day?: number; prepared: string[] };
} {
  return {
    type: "combat",
    label: "Blade-work",
    category: "combat",
    actors: [
      { name: "Vesska", role: "combatant" },
      { name: "Furnace Thrall", role: "combatant" },
    ],
    player_metric: { name: "momentum", current: 0, starting: 0, threshold: 10 },
    opponent_metric: { name: "momentum", current: 0, starting: 0, threshold: 10 },
    beats: [STRIKE_BEAT, CAST_BEAT],
    secondary_stats: null,
    genre_slug: "heavy_metal",
    mood: "grim",
    spellcasting: { casts_remaining: 2, casts_per_day: 2, prepared: ["wracking_bolt"] },
  };
}

const THROW_PARAMS: DiceThrowParams = {
  velocity: [1, -2, 3],
  angular: [10, 20, 30],
  position: [0.4, 0.6],
};

const META = {
  genre_slug: "heavy_metal",
  world_slug: "evropi",
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
          JSON.stringify({ heavy_metal: { name: "Heavy Metal", worlds: [] } }),
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
  const slug = `evropi-cast-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "vesska",
    genre: "heavy_metal",
    world: "evropi",
    last_played_iso: new Date().toISOString(),
    game_slug: slug,
    mode: "solo",
  });
  localStorage.setItem("sidequest-history", JSON.stringify(existing));
  return slug;
}

/** Boot App against a mock socket and drive it to the in-game phase. */
async function bootInGame(): Promise<WS> {
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
    payload: { phase: "complete", character: { core: { name: "Vesska" } } },
  });
  server.send({
    type: "SESSION_EVENT",
    payload: { event: "ready", has_character: true },
  });
  await waitFor(() => screen.getByTestId("gameboard-stub"));
  return server;
}

async function openCombat(server: WS): Promise<void> {
  server.send({
    type: "PARTY_STATUS",
    payload: { members: [VESSKA_MEMBER], companions: [] },
  });
  server.send({ type: "CONFRONTATION", payload: confrontation() });
  await waitFor(() => expect(board.confrontationData).not.toBeNull());
  await waitFor(() => expect(board.currentPlayerId).toBe("vesska-pid"));
}

function sentThrows(server: WS): Array<{
  beat_id?: string;
  spell_id?: string;
  player_action?: string;
  face: number[];
}> {
  return server.messages
    .filter((m) => (m as { type?: string }).type === MessageType.DICE_THROW)
    .map((m) => (m as { payload: never }).payload);
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "vesska");
  vi.stubGlobal("fetch", makeFetchMock());
  board.confrontationData = null;
  board.currentPlayerId = "";
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

describe("102-2 wiring: the chosen spell rides the DICE_THROW", () => {
  it("sends spell_id AND the typed player_action on a cast-beat commit", async () => {
    const server = await bootInGame();
    await openCombat(server);

    expect(board.onBeatSelect).toBeTypeOf("function");
    act(() => {
      board.onBeatSelect!(
        "cast_spell",
        "I pull the working from my marrow",
        "wracking_bolt",
      );
    });
    expect(board.onDiceThrow).toBeTypeOf("function");
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [11]);
    });

    await waitFor(() => {
      const throws = sentThrows(server);
      expect(throws).toHaveLength(1);
      expect(throws[0].beat_id).toBe("cast_spell");
      // THE contract: without this key the server cannot route the cast spine
      // and resolves a generic INT throw (the measured AC5b gap).
      expect(throws[0].spell_id).toBe("wracking_bolt");
      // Zork Problem guardrail: the picker augments typed text, never
      // replaces it — the chandelier-swing carry must survive the cast flow.
      expect(throws[0].player_action).toBe("I pull the working from my marrow");
    });
  });

  it("regression: a non-cast commit sends the pre-102-2 wire shape (no spell_id key)", async () => {
    const server = await bootInGame();
    await openCombat(server);

    act(() => {
      board.onBeatSelect!("strike", "I drive the point home");
    });
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [17]);
    });

    await waitFor(() => {
      const throws = sentThrows(server);
      expect(throws).toHaveLength(1);
      expect(throws[0].beat_id).toBe("strike");
      expect("spell_id" in throws[0]).toBe(false);
    });
  });

  it("consumes the latched spell atomically — no leak into the next commit", async () => {
    const server = await bootInGame();
    await openCombat(server);

    act(() => {
      board.onBeatSelect!("cast_spell", "I spend the working", "wracking_bolt");
    });
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [11]);
    });
    await waitFor(() => expect(sentThrows(server)).toHaveLength(1));

    // Narrator turn ends; the player follows up with a plain strike.
    act(() => {
      server.send({ type: "NARRATION_END", payload: {} });
    });
    act(() => {
      board.onBeatSelect!("strike");
    });
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [9]);
    });

    await waitFor(() => {
      const throws = sentThrows(server);
      expect(throws).toHaveLength(2);
      expect(throws[1].beat_id).toBe("strike");
      expect("spell_id" in throws[1]).toBe(false);
    });
  });
});
