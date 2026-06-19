/**
 * Story 126-26 (PART B of 126-19): RE-HOME the non-conflict 4dF roll tray (RED).
 *
 * 118-7 mounted the out-of-conflict FateDiceTray (`fate-dice-tray`) inside the
 * STANDALONE "Fate" dock tab (FateWidget → FatePanel). 126-26 removes that tab
 * because the Fate sheet it showed is already consolidated under Character→Stats
 * (118-2). But the roll tray is NOT duplicated under Character — so it must be
 * RE-HOMED there FIRST, or the out-of-conflict roll surface is lost.
 *
 * New reality this suite pins: the non-conflict 4dF roll tray renders under the
 * Character surface (the Stats tab, beside the FateCharacterSheet), reachable
 * end-to-end through GameBoard's real `renderWidgetContent` → CharacterWidget →
 * CharacterPanel path — the mandatory wiring test (ui CLAUDE.md "Every Test
 * Suite Needs a Wiring Test"). The roll comes through GameBoard's existing
 * `latestFateRoll` prop; Dev threads it into the Character render path the same
 * way `fateData`/`fateSheet` is already threaded (118-2).
 *
 * Paired negatives (the ruleset gate survives the move):
 *   - Fate pack, roll present  → sheet AND tray under Character
 *   - Fate pack, no roll yet   → sheet but NOT the tray
 *   - native/WN pack + a roll  → no Fate sheet, no tray (fateData-gated)
 *
 * NOT touched: the Fate CONFLICT surface (FateConflictSurface) keeps its OWN
 * FateDiceTray — that is a separate, conflict-gated surface (118-6) and out of
 * scope here.
 *
 * R3F/dice-lib are mocked (no WebGL in jsdom). test-setup.ts mocks matchMedia →
 * "mobile", so renderBoard() renders via MobileTabView (flat role="tab" buttons;
 * the Character tab is labeled "Character"). CharacterPanel defaults to the
 * "stats" tab, so opening Character shows the Fate sheet (and re-homed tray)
 * with no sub-tab click.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { CharacterSheetData } from "@/components/CharacterSheet";
import type { FateRollPayload, FateStatePayload } from "@/types/payloads";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@local/dice-lib", () => ({
  DiceScene: () => <div data-testid="dice-scene" />,
  D6_RADIUS: 0.36,
  DEFAULT_DICE_THEME: { dieColor: "#4a1a3a", labelColor: "#d4af37" },
  // FateDiceTray replays the roll via dice-lib's converter (Story 125-4).
  replayThrowParams: () => ({
    position: [0, 0.86, 0],
    rotation: [0, 0, 0],
    linearVelocity: [0, 4, -1],
    angularVelocity: [0.5, 0.5, 0.5],
  }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const FATE_PC = "Sam Spadework";

// The local PC's collapsed sheet — its name matches the FATE_STATE roster below
// so GameBoard derives a non-null fateSheet and the Stats tab renders the Fate
// sheet (118-2). This is what the re-homed roll tray sits beside.
const baseSheet: CharacterSheetData = {
  name: FATE_PC,
  class: "Sleuth",
  level: 1,
  hp: 10,
  hp_max: 10,
  stats: { Edge: 10 },
  abilities: [],
  class_moves: [],
  backstory: "",
};

type BoardOverrides = Partial<GameBoardProps> & {
  fateData?: FateStatePayload | null;
  latestFateRoll?: FateRollPayload | null;
};

function renderBoard(overrides: BoardOverrides = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [
      {
        player_id: "p1",
        name: "Sam",
        character_name: FATE_PC,
        class: "Sleuth",
        level: 1,
        hp: 10,
        hp_max: 10,
        status_effects: [],
        portrait_url: "",
        current_location: "",
      },
    ],
    characterSheet: baseSheet,
    currentPlayerId: "p1",
    onSend: vi.fn(),
    disabled: false,
  };
  const props = { ...defaults, ...overrides } as GameBoardProps;
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
}

// The roll tray's new home is the Character surface (Stats tab, default).
function openCharacterTab() {
  fireEvent.click(screen.getByRole("tab", { name: /character/i }));
}

const seeded: FateStatePayload = {
  characters: [
    {
      name: FATE_PC,
      fate_points: 3,
      refresh: 3,
      skills: [{ name: "Investigate", rating: 4, ladder: "Great" }],
      aspects: [
        { text: "Hard-boiled detective", kind: "high_concept", free_invokes: 0 },
      ],
      stress: { physical: [{ value: 1, checked: false }], mental: [] },
      consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
    },
  ],
  scene_aspects: [],
  conflict: null,
};

const SUCCEED: FateRollPayload = {
  dice: [1, 1, 0, -1],
  roll_total: 1,
  ladder_total: 4,
  ladder_name: "Great",
  opposition: 2,
  shifts: 2,
  tier: "Succeed",
  succeeded_with_style: false,
  throw_params: { velocity: [1, 2, -0.5], angular: [0.5, 0.5, 0.5], position: [0.5, 0.5] },
  seed: 4242,
};

describe("GameBoard — non-conflict 4dF roll tray re-homed under Character (Story 126-26)", () => {
  it("mounts the roll surface beside the Fate sheet under Character when a roll has arrived", () => {
    // RED: today the latest roll is only threaded into the (about-to-be-removed)
    // standalone Fate dock tab, never into the Character render path — so opening
    // Character shows the sheet but the tray is absent.
    renderBoard({ fateData: seeded, latestFateRoll: SUCCEED });
    openCharacterTab();
    expect(screen.getByTestId("fate-character")).toBeInTheDocument();
    expect(
      screen.getByTestId("fate-dice-tray"),
      "the re-homed 4dF roll tray must mount in the Character surface",
    ).toBeInTheDocument();
  });

  it("shows the Fate sheet but NOT the roll surface before any roll arrives (paired negative)", () => {
    renderBoard({ fateData: seeded, latestFateRoll: null });
    openCharacterTab();
    expect(screen.getByTestId("fate-character")).toBeInTheDocument();
    expect(screen.queryByTestId("fate-dice-tray")).not.toBeInTheDocument();
  });

  it("does NOT mount the roll tray under Character on a native/WN pack even if a roll is passed (ruleset gate survives the move)", () => {
    // The re-home must stay fateData-gated, exactly like the old dock tab: a
    // native pack has no Fate sheet and must never grow a 4dF tray.
    renderBoard({ fateData: null, latestFateRoll: SUCCEED });
    openCharacterTab();
    expect(screen.queryByTestId("fate-character")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fate-dice-tray")).not.toBeInTheDocument();
  });
});
