/**
 * Story 108-5 (epic 108, ADR-143) — WN combat player action surface: the
 * RP-flavor rider's wire contract from the UI side.
 *
 * Under a Without-Number binding combat is declared through WN action buttons,
 * each firing a real WN roll. The player may ATTACH freeform text to a button
 * press (the "chandelier swing"), which rides on `DICE_THROW.player_action` as a
 * narrator hook — and ONLY then. The two load-bearing UI-side invariants:
 *
 *   1. ATTACHED — when the player types a flourish and commits a button, the
 *      outbound DICE_THROW carries that text as `player_action` alongside the
 *      button's `beat_id` (the server pairs them; the roll is on the button).
 *   2. OPT-IN — when the player commits a button with NO flourish, the outbound
 *      DICE_THROW carries the `beat_id` but NO `player_action` key. The rider is
 *      never fabricated; a bare button press is a pure mechanical action. This
 *      is the UI guarantee behind the server's `affected_mechanics=false`
 *      attestation — there is nothing to mechanize when nothing was typed.
 *
 * These drive the *production* beat-commit handlers App threads down to
 * GameBoard (onBeatSelect + onDiceThrow) and assert on the bytes App actually
 * puts on the wire — the wiring assertion is the real outbound DICE_THROW, not
 * an isolated mock. (The bare-Enter InputBar lock that keeps free text from
 * submitting during combat — AC4 — is covered by InputBar.test.tsx and is not
 * re-proven here.)
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
import { MessageType, type GameMessage } from "@/types/protocol";
import type {
  ConfrontationData,
  BeatOption,
} from "@/components/ConfrontationOverlay";
import type { DiceThrowParams, DiceThrowPayload } from "@/types/payloads";

// Shared holder for the production handlers App threads down to GameBoard.
const board = vi.hoisted(() => ({
  messages: [] as GameMessage[],
  confrontationData: null as ConfrontationData | null,
  currentPlayerId: "" as string,
  onBeatSelect: null as null | ((beatId: string, playerAction?: string) => void),
  onDiceThrow: null as null | ((params: DiceThrowParams, face: number[]) => void),
}));

vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: {
    messages: GameMessage[];
    confrontationData?: ConfrontationData | null;
    currentPlayerId?: string;
    onBeatSelect?: (beatId: string, playerAction?: string) => void;
    onDiceThrow?: (params: DiceThrowParams, face: number[]) => void;
  }) => {
    board.messages = props.messages;
    board.confrontationData = props.confrontationData ?? null;
    board.currentPlayerId = props.currentPlayerId ?? "";
    board.onBeatSelect = props.onBeatSelect ?? null;
    board.onDiceThrow = props.onDiceThrow ?? null;
    return <div data-testid="gameboard-stub" />;
  },
}));

import App from "../App";

// ── Fixtures ────────────────────────────────────────────────────────────────

const RUX_MEMBER = {
  player_id: "rux-pid",
  name: "rux",
  character_name: "Rux",
  class: "Warrior",
  level: 1,
  current_hp: 12,
  max_hp: 12,
  statuses: [],
  current_location: "The Reliquary Gate",
  portrait_url: "",
  sheet: {
    stats: { STR: 12, DEX: 10, CON: 10, INT: 14, WIS: 10, CHA: 10 },
    abilities: [],
    backstory: "",
  },
};

// The WN "Attack" button — a hp_depletion confrontation under a WN binding. The
// server authors the button set + the pre-roll DC (the target's armor class).
const ATTACK_BEAT: BeatOption = {
  id: "committed_blow",
  label: "Attack",
  kind: "press",
  base: 2,
  stat_check: "STR",
  difficulty: 12,
};

function confrontation(): ConfrontationData {
  return {
    type: "combat",
    label: "Blade-work in the Reliquary",
    category: "confrontation",
    actors: [
      { name: "Rux", role: "combatant" },
      { name: "Furnace Thrall", role: "combatant" },
    ],
    player_metric: { name: "momentum", current: 0, starting: 0, threshold: 10 },
    opponent_metric: { name: "momentum", current: 0, starting: 0, threshold: 10 },
    player_hp: { current: 12, max: 12 },
    opponent_hp: { current: 10, max: 10 },
    win_condition: "hp_depletion",
    beats: [ATTACK_BEAT],
    secondary_stats: null,
    genre_slug: "heavy_metal",
    mood: "grim",
  };
}

const THROW_PARAMS: DiceThrowParams = {
  velocity: [1, -2, 3],
  angular: [10, 20, 30],
  position: [0.4, 0.6],
};

const META = {
  genre_slug: "heavy_metal",
  world_slug: "barsoom",
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
  const slug = `barsoom-rider-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "rux",
    genre: "heavy_metal",
    world: "barsoom",
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
    payload: { phase: "complete", character: { core: { name: "Rux" } } },
  });
  server.send({
    type: "SESSION_EVENT",
    payload: { event: "ready", has_character: true },
  });
  await waitFor(() => screen.getByTestId("gameboard-stub"));
  return server;
}

/** The latest outbound DICE_THROW App put on the wire. */
function lastDiceThrow(server: WS): DiceThrowPayload | undefined {
  const msgs = [...server.messages].reverse() as GameMessage[];
  const found = msgs.find((m) => m.type === MessageType.DICE_THROW);
  return found?.payload as DiceThrowPayload | undefined;
}

async function openConfrontation(server: WS): Promise<void> {
  server.send({
    type: "PARTY_STATUS",
    payload: { members: [RUX_MEMBER], companions: [] },
  });
  server.send({ type: "CONFRONTATION", payload: confrontation() });
  await waitFor(() => expect(board.confrontationData).not.toBeNull());
  await waitFor(() => expect(board.currentPlayerId).toBe("rux-pid"));
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "rux");
  vi.stubGlobal("fetch", makeFetchMock());
  board.messages = [];
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

describe("WN combat flavor rider: outbound DICE_THROW wire contract (108-5)", () => {
  it("ATTACHED: a typed flourish rides the button press as player_action", async () => {
    const server = await bootInGame();
    await openConfrontation(server);

    // Player types "I swing from the chandelier" then clicks Attack.
    expect(board.onBeatSelect).toBeTypeOf("function");
    act(() => {
      board.onBeatSelect!("committed_blow", "I swing from the chandelier");
    });
    expect(board.onDiceThrow).toBeTypeOf("function");
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [17]);
    });

    await waitFor(() => {
      const payload = lastDiceThrow(server);
      expect(payload).toBeDefined();
      // The button's mechanical identity AND the RP flavor rider ride together.
      expect(payload!.beat_id).toBe("committed_blow");
      expect(payload!.player_action).toBe("I swing from the chandelier");
    });
  });

  it("OPT-IN: a bare button press carries no player_action key (rider never fabricated)", async () => {
    const server = await bootInGame();
    await openConfrontation(server);

    // Player clicks Attack with NOTHING typed (empty flourish).
    act(() => {
      board.onBeatSelect!("committed_blow", "");
    });
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [17]);
    });

    await waitFor(() => {
      const payload = lastDiceThrow(server);
      expect(payload).toBeDefined();
      expect(payload!.beat_id).toBe("committed_blow");
    });
    // A bare button press is a pure mechanical action — no rider is invented.
    // The server's affected_mechanics=false attestation rests on this: there is
    // nothing to mechanize because nothing was typed.
    const payload = lastDiceThrow(server)!;
    expect(payload.player_action ?? null).toBeNull();
  });
});
