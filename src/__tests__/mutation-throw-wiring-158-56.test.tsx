/**
 * Story 158-56 — WIRING: the chosen mutation rides the DICE_THROW to the server.
 *
 * 158-54 landed the server dice-path mutation route: DICE_THROW.mutation_id names
 * WHICH owned mutation to use on a `mutation_resolution` beat, and a marked commit
 * with NO mutation_id raises a loud DiceDispatchError. The UI's primary path (beat
 * tile → DICE_THROW → dispatch) has no `mutation_id` today, so the marquee mechanic
 * is unusable from a real client — the 102-2 cast gap, one beat over.
 *
 * Contract pinned here, against App's PRODUCTION beat-commit chain (GameBoard
 * stubbed to a prop trap — we test App's side of the wire; harness mirrors
 * cast-spell-throw-wiring-102-2.test.tsx):
 *
 *  1. A mutation-beat commit (`onBeatSelect("mutant_ability", playerAction,
 *     undefined, "structure/iron_hide")`) latches the mutation alongside the typed
 *     action; when the dice settle the outbound DICE_THROW carries
 *     `mutation_id: "structure/iron_hide"` AND the typed `player_action` (Zork
 *     Problem guardrail — the picker augments typed text, never replaces it).
 *  2. Regression: a non-mutation commit produces a DICE_THROW with NO mutation_id
 *     key — the pre-158-56 wire shape, byte-for-byte.
 *  3. The latched mutation is consumed atomically with the beat: the next
 *     (non-mutation) commit must not leak the previous throw's mutation_id.
 *
 * Server-side mirror: sidequest-server/tests/integration/
 * test_dice_path_mutation_use_158_54.py + test_confrontation_payload_mutation_economy_158_56.py.
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
// vi.hoisted runs before the GameBoard mock factory below. The fourth
// onBeatSelect parameter (mutationId) is the 158-56 contract under test.
const board = vi.hoisted(() => ({
  confrontationData: null as ConfrontationData | null,
  currentPlayerId: "" as string,
  onBeatSelect: null as
    | null
    | ((
        beatId: string,
        playerAction?: string,
        spellId?: string,
        mutationId?: string,
      ) => void),
  onDiceThrow: null as null | ((params: DiceThrowParams, face: number[]) => void),
}));

// GameBoard stub: trap App's call site. Anything richer defeats the purpose.
vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: {
    messages: GameMessage[];
    confrontationData?: ConfrontationData | null;
    currentPlayerId?: string;
    onBeatSelect?: (
      beatId: string,
      playerAction?: string,
      spellId?: string,
      mutationId?: string,
    ) => void;
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

const RUST_MEMBER = {
  player_id: "rust-pid",
  name: "rust",
  character_name: "Rust",
  class: "Mutant",
  level: 1,
  current_hp: 10,
  max_hp: 10,
  statuses: [],
  current_location: "The Rusted Flats",
  portrait_url: "",
};

const ATTACK_BEAT: BeatOption = {
  id: "attack",
  label: "Attack",
  kind: "strike",
  base: 2,
  stat_check: "STR",
  difficulty: 12,
};

const MUTATE_BEAT: BeatOption & { mutation_resolution?: boolean } = {
  id: "mutant_ability",
  label: "Use Mutation",
  kind: "strike",
  base: 4,
  stat_check: "WIS",
  difficulty: 12,
  mutation_resolution: true,
};

// `mutation_economy` mirrors the server projection contract (158-56 server suite).
function confrontation(): ConfrontationData & {
  mutation_economy?: {
    owned: { id: string; name: string; strain_cost: number }[];
  } | null;
} {
  return {
    type: "combat",
    label: "Wasteland Brawl",
    category: "combat",
    actors: [
      { name: "Rust", role: "combatant" },
      { name: "Feral Raider", role: "combatant" },
    ],
    player_metric: { name: "momentum", current: 0, starting: 0, threshold: 7 },
    opponent_metric: { name: "momentum", current: 0, starting: 0, threshold: 7 },
    beats: [ATTACK_BEAT, MUTATE_BEAT],
    secondary_stats: null,
    genre_slug: "mutant_wasteland",
    mood: "combat",
    mutation_economy: {
      owned: [{ id: "structure/iron_hide", name: "Iron Hide", strain_cost: 1 }],
    },
  };
}

const THROW_PARAMS: DiceThrowParams = {
  velocity: [1, -2, 3],
  angular: [10, 20, 30],
  position: [0.4, 0.6],
};

const META = {
  genre_slug: "mutant_wasteland",
  world_slug: "seaboard_of_saints",
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
          JSON.stringify({ mutant_wasteland: { name: "Mutant Wasteland", worlds: [] } }),
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
  const slug = `saints-mutate-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "rust",
    genre: "mutant_wasteland",
    world: "seaboard_of_saints",
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
    payload: { phase: "complete", character: { core: { name: "Rust" } } },
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
    payload: { members: [RUST_MEMBER], companions: [] },
  });
  server.send({ type: "CONFRONTATION", payload: confrontation() });
  await waitFor(() => expect(board.confrontationData).not.toBeNull());
  await waitFor(() => expect(board.currentPlayerId).toBe("rust-pid"));
}

type SentThrow = {
  beat_id?: string;
  spell_id?: string;
  mutation_id?: string;
  player_action?: string;
  face: number[];
};

function sentThrows(server: WS): SentThrow[] {
  return server.messages
    .filter((m) => (m as { type?: string }).type === MessageType.DICE_THROW)
    .map((m) => (m as { payload: SentThrow }).payload);
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "rust");
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

describe("158-56 wiring: the chosen mutation rides the DICE_THROW", () => {
  it("sends mutation_id AND the typed player_action on a mutation-beat commit", async () => {
    const server = await bootInGame();
    await openCombat(server);

    expect(board.onBeatSelect).toBeTypeOf("function");
    act(() => {
      board.onBeatSelect!(
        "mutant_ability",
        "I will my flesh to iron",
        undefined,
        "structure/iron_hide",
      );
    });
    expect(board.onDiceThrow).toBeTypeOf("function");
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [11]);
    });

    await waitFor(() => {
      const throws = sentThrows(server);
      expect(throws).toHaveLength(1);
      expect(throws[0].beat_id).toBe("mutant_ability");
      // THE contract: without this key the server raises the missing-mutation_id
      // DiceDispatchError (158-54) — the marquee mechanic is unusable.
      expect(throws[0].mutation_id).toBe("structure/iron_hide");
      // Zork Problem guardrail: the picker augments typed text, never replaces it.
      expect(throws[0].player_action).toBe("I will my flesh to iron");
    });
  });

  it("regression: a non-mutation commit sends the pre-158-56 wire shape (no mutation_id key)", async () => {
    const server = await bootInGame();
    await openCombat(server);

    act(() => {
      board.onBeatSelect!("attack", "I drive the point home");
    });
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [17]);
    });

    await waitFor(() => {
      const throws = sentThrows(server);
      expect(throws).toHaveLength(1);
      expect(throws[0].beat_id).toBe("attack");
      expect("mutation_id" in throws[0]).toBe(false);
    });
  });

  it("consumes the latched mutation atomically — no leak into the next commit", async () => {
    const server = await bootInGame();
    await openCombat(server);

    act(() => {
      board.onBeatSelect!(
        "mutant_ability",
        "I spend the mutation",
        undefined,
        "structure/iron_hide",
      );
    });
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [11]);
    });
    await waitFor(() => expect(sentThrows(server)).toHaveLength(1));

    // Narrator turn ends; the player follows up with a plain attack.
    act(() => {
      server.send({ type: "NARRATION_END", payload: {} });
    });
    act(() => {
      board.onBeatSelect!("attack");
    });
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [9]);
    });

    await waitFor(() => {
      const throws = sentThrows(server);
      expect(throws).toHaveLength(2);
      expect(throws[1].beat_id).toBe("attack");
      expect("mutation_id" in throws[1]).toBe(false);
    });
  });
});
