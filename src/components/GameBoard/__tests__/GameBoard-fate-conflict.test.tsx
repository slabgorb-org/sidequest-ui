/**
 * Story 118-6 (ADR-144 F3f): Fate conflict surface wiring (RED).
 *
 * The mandatory wiring test (CLAUDE.md "Every Test Suite Needs a Wiring Test"):
 * proves the FateConflictSurface is reachable from a production GameBoard path,
 * not merely a component that exists in isolation. It mirrors the GameBoard-fate-
 * tab contract, but the conflict surface is gated on an ACTIVE conflict, not just
 * the presence of a Fate sheet:
 *
 *   - fateData.conflict.active        → the conflict surface is reachable
 *   - fateData present, conflict null → NO conflict surface (the fate SHEET tab
 *     still exists, but the conflict surface is gated on an active conflict)
 *   - confrontation active + fateData null → NO conflict surface (the epic's
 *     required paired negative — it can never sit beside the WN/native
 *     ConfrontationOverlay, because a WN pack never emits FATE_STATE)
 *
 * The conflict surface consumes the shared `latestFateRoll` mirror slice (118-7
 * F3g) — one field, two consumers (the Fate panel's FateWidget and this surface).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import {
  WIDGET_REGISTRY,
  type WidgetDef,
} from "@/components/GameBoard/widgetRegistry";
import type { FateStatePayload, FateRollPayload } from "@/types/payloads";
import type { ConfrontationData } from "@/components/ConfrontationOverlay";

// R3F / drei / dice-lib mocks — the conflict surface mounts the FateDiceTray.
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

const REGISTRY = WIDGET_REGISTRY as Record<string, WidgetDef | undefined>;

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

function conflictTab() {
  return screen.queryByRole("tab", { name: /conflict/i });
}

const sheetOnly: FateStatePayload = {
  characters: [
    {
      name: "Sam Spadework",
      fate_points: 3,
      refresh: 3,
      skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
      aspects: [{ text: "Hard-boiled detective", kind: "high_concept", free_invokes: 0 }],
      stress: { physical: [{ value: 1, checked: false }], mental: [] },
      consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
    },
  ],
  scene_aspects: [],
  conflict: null,
};

const inConflict: FateStatePayload = {
  ...sheetOnly,
  conflict: {
    active: true,
    participants: [
      { name: "Sam Spadework", side: "player" },
      { name: "The Fat Man", side: "opponent" },
    ],
  },
};

const roll: FateRollPayload = {
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

// A native/WN confrontation for the paired negative (a Fate pack never emits this).
const activeConfrontation: ConfrontationData = {
  type: "duel",
  label: "Cantina Standoff",
  category: "combat",
  actors: [
    { name: "Sam Spadework", role: "protagonist", side: "player" },
    { name: "The Fat Man", role: "antagonist", side: "opponent" },
  ],
  player_metric: { name: "edge", current: 0, starting: 0, threshold: 3 },
  opponent_metric: { name: "edge", current: 0, starting: 0, threshold: 3 },
  beats: [],
  secondary_stats: null,
  genre_slug: "spaghetti_western",
  mood: "tense",
};

describe("GameBoard — fate conflict surface wiring (Story 118-6)", () => {
  it("FateConflictSurface is importable from the components path", async () => {
    const mod = await import("@/components/FateConflictSurface");
    expect(typeof mod.FateConflictSurface).toBe("function");
  });

  it("widgetRegistry includes a data-gated 'fate-conflict' entry", () => {
    const entry = REGISTRY["fate-conflict"];
    expect(entry, "fate-conflict must be a registered widget").toBeDefined();
    // Data-gated on an active conflict — the UI realization of the ruleset gate.
    expect(entry?.dataGated).toBe(true);
  });
});

describe("GameBoard — fate conflict surface is conflict-gated (Story 118-6 paired test)", () => {
  it("reaches the conflict surface from the render path when a conflict is active", () => {
    renderBoard({ fateData: inConflict, latestFateRoll: roll });
    expect(conflictTab()).toBeInTheDocument();
  });

  it("does NOT show the conflict surface when a Fate sheet exists but no conflict is active", () => {
    // The fate SHEET tab still appears (sheet present); the conflict surface does
    // not — it is gated on conflict.active, not merely on FATE_STATE.
    renderBoard({ fateData: sheetOnly });
    expect(conflictTab()).not.toBeInTheDocument();
  });

  it("does NOT show the conflict surface during a WN/native confrontation with no Fate state (never co-renders with ConfrontationOverlay)", () => {
    renderBoard({ fateData: null, confrontationData: activeConfrontation });
    expect(conflictTab()).not.toBeInTheDocument();
  });
});
