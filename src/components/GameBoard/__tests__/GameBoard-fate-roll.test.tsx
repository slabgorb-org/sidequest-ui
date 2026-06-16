/**
 * Story 118-7 (ADR-144 F3g): the FATE_ROLL surface is reachable from a
 * production render path (RED) — the mandatory wiring test (server/ui CLAUDE.md
 * "Every Test Suite Needs a Wiring Test"). FateDiceTray + the latest-roll slice
 * mean nothing if GameBoard.renderWidgetContent never threads the roll into the
 * FateWidget → FatePanel → FateDiceTray chain.
 *
 * Proves: activate the Fate tab on a Fate pack and, when a roll has arrived, the
 * 3D roll surface mounts inside the dock panel — driven entirely through
 * GameBoard's real render path, not a hand-mounted FateDiceTray.
 *
 * Paired negative (epic 118 ruleset gate): the same activated tab WITHOUT a roll
 * shows the sheet but NOT the tray — the surface only appears once a roll exists,
 * and (fateData-gated) never on a WN/native pack.
 *
 * `latestFateRoll` is not yet a GameBoard prop, so it's reached through a widened
 * type. R3F/dice-lib are mocked (no WebGL in jsdom).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
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
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// Widen GameBoardProps with the not-yet-wired latestFateRoll prop so this RED
// test compiles before the prop lands and stays correct after.
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
        character_name: "Sam Spadework",
        class: "Sleuth",
        level: 1,
        hp: 10,
        hp_max: 10,
        status_effects: [],
        portrait_url: "",
        current_location: "",
      },
    ],
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

function fateTab() {
  return screen.queryByRole("tab", { name: /fate/i });
}

const seeded: FateStatePayload = {
  characters: [
    {
      name: "Sam Spadework",
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
};

describe("GameBoard — FATE_ROLL surface wiring (Story 118-7)", () => {
  it("mounts the roll surface in the Fate dock panel when a roll has arrived", () => {
    renderBoard({ fateData: seeded, latestFateRoll: SUCCEED });
    const tab = fateTab();
    expect(tab, "Fate tab must be present on a Fate pack").toBeInTheDocument();
    fireEvent.click(tab!);
    // The sheet renders AND the roll surface threads through to the tray.
    expect(screen.getByText(/sam spadework/i)).toBeInTheDocument();
    expect(screen.getByTestId("fate-dice-tray")).toBeInTheDocument();
  });

  it("shows the sheet but NOT the roll surface before any roll arrives (paired negative)", () => {
    renderBoard({ fateData: seeded, latestFateRoll: null });
    const tab = fateTab();
    expect(tab).toBeInTheDocument();
    fireEvent.click(tab!);
    expect(screen.getByText(/sam spadework/i)).toBeInTheDocument();
    expect(screen.queryByTestId("fate-dice-tray")).not.toBeInTheDocument();
  });
});
