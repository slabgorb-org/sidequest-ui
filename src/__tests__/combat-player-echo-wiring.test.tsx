/**
 * REGRESSION (live playtest, 2026-06-04): during a confrontation the player's
 * typed action text was DROPPED from the narrative history — combat became
 * unfollowable ("chandelier swinging completely broken").
 *
 * Ground truth (DRIVER, headless save forensics): NOT a server drop. The save's
 * /timeline records `narrative_authors=['narrator','player']` for every combat
 * round — the player narrative entry IS persisted/emitted server-side. The bug
 * is in the UI: the beat-commit flow never produced a local PLAYER_ACTION echo,
 * so only the narrator's response rendered.
 *
 * Root cause: out-of-combat, `handleSend` pushes a PLAYER_ACTION message into the
 * transcript (the player-echo card). In a confrontation the player types into the
 * InputBar and commits a beat, which routes through `handleBeatSelect` ->
 * `handleDiceThrow` and sends a DICE_THROW carrying `player_action` to the server
 * — but App never pushed an equivalent PLAYER_ACTION echo into its own `messages`.
 * The typed text reached the server (hence the persisted `player` author) but the
 * client transcript never showed it.
 *
 * This suite drives the *production* beat-commit handlers App threads down to
 * GameBoard (onBeatSelect + onDiceThrow), then renders the *real* NarrationCards
 * with the messages App actually accumulated — proving the player-echo card
 * survives a confrontation-active committed-beat turn alongside the narrator
 * response. The NarrationCards render is the wiring assertion: it exercises the
 * real transcript render path, not an isolated mock.
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
import type { DiceThrowParams } from "@/types/payloads";
import { NarrationCards } from "@/components/NarrationCards";

// Shared holder for the production handlers + the messages App accumulates.
// vi.hoisted runs before the GameBoard mock factory below.
const board = vi.hoisted(() => ({
  messages: [] as GameMessage[],
  confrontationData: null as ConfrontationData | null,
  currentPlayerId: "" as string,
  onBeatSelect: null as null | ((beatId: string, playerAction?: string) => void),
  onDiceThrow: null as null | ((params: DiceThrowParams, face: number[]) => void),
}));

// GameBoard stub: latch the production beat-commit handlers + the live messages
// prop. We trap App's side of the wire (the call site + transcript it owns),
// then feed those messages into the REAL NarrationCards for the render assertion.
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

const ESTELLE_MEMBER = {
  player_id: "estelle-pid",
  name: "estelle",
  character_name: "Estelle",
  class: "Swashbuckler",
  level: 3,
  current_hp: 14,
  max_hp: 14,
  statuses: [],
  current_location: "The Grand Ballroom",
  portrait_url: "",
  sheet: {
    stats: { STR: 12, DEX: 16, CON: 12, INT: 10, WIS: 10, CHA: 14 },
    abilities: [],
    backstory: "",
  },
};

const SWING_BEAT: BeatOption = {
  id: "chandelier_swing",
  label: "Swing from the Chandelier",
  kind: "press",
  base: 2,
  stat_check: "DEX",
  // Story 97-3: beat offers carry a server-authored pre-roll DC; a beat
  // without one is refused by handleBeatSelect (No Silent Fallbacks).
  difficulty: 14,
};

function confrontation(): ConfrontationData {
  return {
    type: "duel",
    label: "Ballroom Brawl",
    category: "confrontation",
    actors: [
      { name: "Estelle", role: "duelist" },
      { name: "The Baron", role: "duelist" },
    ],
    player_metric: { name: "tension", current: 0, starting: 0, threshold: 10 },
    opponent_metric: { name: "tension", current: 0, starting: 0, threshold: 10 },
    beats: [SWING_BEAT],
    secondary_stats: null,
    genre_slug: "tea_and_murder",
    mood: "tense",
  };
}

const THROW_PARAMS: DiceThrowParams = {
  velocity: [1, -2, 3],
  angular: [10, 20, 30],
  position: [0.4, 0.6],
};

const META = {
  genre_slug: "tea_and_murder",
  world_slug: "blackthorn_moor",
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
          JSON.stringify({ tea_and_murder: { name: "Tea & Murder", worlds: [] } }),
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
  const slug = `blackthorn-echo-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "estelle",
    genre: "tea_and_murder",
    world: "blackthorn_moor",
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
  // Mark a character present so App's `character` gate is satisfied (gameMessages
  // passthrough) and PLAYER_SEAT/echo paths behave like a real seated session.
  server.send({
    type: "CHARACTER_CREATION",
    payload: { phase: "complete", character: { core: { name: "Estelle" } } },
  });
  server.send({
    type: "SESSION_EVENT",
    payload: { event: "ready", has_character: true },
  });
  await waitFor(() => screen.getByTestId("gameboard-stub"));
  return server;
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "estelle");
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

describe("Confrontation player-echo: committed-beat turn renders BOTH player action + narrator response", () => {
  it("pushes the typed action as a PLAYER_ACTION echo into the transcript on beat-commit", async () => {
    const server = await bootInGame();

    // Resolve the local player id (estelle) so the echo carries a real player_id.
    server.send({
      type: "PARTY_STATUS",
      payload: { members: [ESTELLE_MEMBER], companions: [] },
    });
    // Open the confrontation — beat-commit is gated on an active confrontation
    // and a bound session.
    server.send({ type: "CONFRONTATION", payload: confrontation() });
    await waitFor(() => expect(board.confrontationData).not.toBeNull());
    await waitFor(() => expect(board.currentPlayerId).toBe("estelle-pid"));

    // The player types into the InputBar and commits the swing beat. This is the
    // production confrontation turn flow: onBeatSelect latches the typed action +
    // arms a local dice request, onDiceThrow fires when the dice settle.
    expect(board.onBeatSelect).toBeTypeOf("function");
    act(() => {
      board.onBeatSelect!("chandelier_swing", "I swing from the chandelier");
    });

    expect(board.onDiceThrow).toBeTypeOf("function");
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [17]);
    });

    // The committed beat must leave a PLAYER_ACTION echo in App's transcript —
    // exactly as a free-text submit does out of combat. Without it the player's
    // typed line vanishes from history (the regression).
    await waitFor(() => {
      const echo = board.messages.find(
        (m) =>
          m.type === MessageType.PLAYER_ACTION &&
          (m.payload as { action?: string }).action === "I swing from the chandelier",
      );
      expect(echo).toBeDefined();
    });
  });

  it("renders both the player action text and the narrator response in NarrationCards", async () => {
    const server = await bootInGame();

    server.send({
      type: "PARTY_STATUS",
      payload: { members: [ESTELLE_MEMBER], companions: [] },
    });
    server.send({ type: "CONFRONTATION", payload: confrontation() });
    await waitFor(() => expect(board.confrontationData).not.toBeNull());
    await waitFor(() => expect(board.currentPlayerId).toBe("estelle-pid"));

    act(() => {
      board.onBeatSelect!("chandelier_swing", "I swing from the chandelier");
    });
    act(() => {
      board.onDiceThrow!(THROW_PARAMS, [17]);
    });

    // The narrator resolves the beat and the turn ends.
    act(() => {
      server.send({
        type: "NARRATION",
        payload: { text: "You sail across the ballroom, boot connecting with the Baron's jaw." },
      });
      server.send({ type: "NARRATION_END", payload: {} });
    });

    await waitFor(() => {
      expect(
        board.messages.some(
          (m) =>
            m.type === MessageType.NARRATION &&
            (m.payload as { text?: string }).text?.includes("sail across the ballroom"),
        ),
      ).toBe(true);
    });

    // WIRING ASSERTION: feed App's accumulated transcript through the REAL
    // NarrationCards render path. BOTH the player's typed action AND the
    // narrator's response must appear in the narrative history.
    render(<NarrationCards messages={board.messages} />);

    expect(
      screen.getByText("I swing from the chandelier"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sail across the ballroom/),
    ).toBeInTheDocument();
  });
});
