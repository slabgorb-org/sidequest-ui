/**
 * Story 118-2 (ADR-144 F3b): Fate widget wiring (RED).
 *
 * The mandatory wiring test — proves the panel is reachable from a production
 * code path, not just a component that exists in isolation. Mirrors the
 * GameBoard-quests-tab contract for the importable/registry/behavior checks.
 *
 * THE load-bearing DIFFERENCE from quests/relationships (epic 118 / ADR-144):
 * the Fate surface is ruleset=='fate'-gated so it NEVER co-renders with the
 * WN/native beat/dial ConfrontationOverlay. The server already gates emission
 * (FATE_STATE fires only on a Fate pack), so on the UI side the Fate tab is
 * DATA-GATED (dataGated:true) — it appears only when a FATE_STATE projection
 * has arrived. On the 7 WN/native packs no FATE_STATE ever arrives, so the tab
 * never appears, and it can never sit beside a Confrontation panel. This is the
 * UI realization of the ruleset gate and the epic's required *paired negative
 * test*:
 *   - fateData present  → Fate tab present (Fate pack)
 *   - fateData null     → Fate tab ABSENT (non-fate pack — the gate)
 *   - confrontation active + fateData null → Fate tab ABSENT (never co-renders)
 *
 * This DIVERGES from quests'/relationships' dataGated:false (always-present)
 * pattern on purpose — those surfaces exist on every pack; Fate exists on four.
 *
 * `fate` is not yet a WidgetId and `fateData` is not yet a GameBoard prop, so
 * both are reached through widened types — the RED signal is the missing
 * registry entry / missing render path at runtime, not a type error.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import {
  WIDGET_REGISTRY,
  buildHotkeyMap,
  type WidgetDef,
} from "@/components/GameBoard/widgetRegistry";
import type { FateStatePayload } from "@/types/payloads";
import type { ConfrontationData } from "@/components/ConfrontationOverlay";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const REGISTRY = WIDGET_REGISTRY as Record<string, WidgetDef | undefined>;

// Helper widens GameBoardProps with the not-yet-wired fateData prop so this RED
// test compiles before the prop lands and stays correct after.
type BoardOverrides = Partial<GameBoardProps> & {
  fateData?: FateStatePayload | null;
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

// A minimal but well-typed native/WN confrontation — used for the paired
// negative co-render test (a Fate pack never emits this; a native/WN pack
// never emits FATE_STATE).
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

describe("GameBoard — fate widget wiring (Story 118-2)", () => {
  it("FateWidget is importable from the registered path", async () => {
    const mod = await import("@/components/GameBoard/widgets/FateWidget");
    expect(typeof mod.FateWidget).toBe("function");
  });

  it("FatePanel is importable from the components path", async () => {
    const mod = await import("@/components/FatePanel");
    expect(typeof mod.FatePanel).toBe("function");
  });

  it("widgetRegistry includes a data-gated 'fate' entry with a defined hotkey", () => {
    const entry = REGISTRY["fate"];
    expect(entry, "fate must be a registered widget").toBeDefined();
    // Data-gated (unlike quests'/relationships' always-present false): the tab
    // appears only when a FATE_STATE projection exists — the UI ruleset gate.
    expect(entry?.dataGated).toBe(true);
    expect(typeof entry?.hotkey).toBe("string");
    expect(entry?.hotkey?.length).toBe(1);
  });

  it("the 'fate' hotkey does not collide with any other widget hotkey", () => {
    const map = buildHotkeyMap();
    const hotkeyWidgets = Object.values(map);
    // buildHotkeyMap must still produce a 1:1 key→widget map after fate lands.
    expect(new Set(hotkeyWidgets).size).toBe(hotkeyWidgets.length);
    const fateHotkey = REGISTRY["fate"]?.hotkey;
    expect(fateHotkey).toBeTruthy();
    expect(map[fateHotkey!]).toBe("fate");
  });
});

describe("GameBoard — fate tab is ruleset-gated (Story 118-2 paired test)", () => {
  it("shows the Fate tab when fateData is present (Fate pack)", () => {
    renderBoard({ fateData: seeded });
    expect(fateTab()).toBeInTheDocument();
  });

  it("renders the seeded Fate sheet from GameBoard's render path when data is present", () => {
    // End-to-end wiring: GameBoard.renderWidgetContent must thread fateData into
    // the FateWidget → FatePanel. Activate the tab, then assert sheet content.
    renderBoard({ fateData: seeded });
    const tab = fateTab();
    expect(tab).toBeInTheDocument();
    fireEvent.click(tab!);
    expect(screen.getByText(/sam spadework/i)).toBeInTheDocument();
    expect(screen.getByTestId("fate-points")).toHaveTextContent(/3/);
  });

  it("does NOT show the Fate tab when fateData is null (non-fate pack — the gate)", () => {
    renderBoard({ fateData: null });
    expect(fateTab()).not.toBeInTheDocument();
  });

  it("does NOT show the Fate tab during a confrontation with no Fate state (never co-renders with the ConfrontationOverlay)", () => {
    // The epic's required negative: on a WN/native pack a confrontation is
    // active but no FATE_STATE has arrived (server gate). The Fate surface must
    // stay absent so it can never sit beside the beat/dial ConfrontationOverlay.
    renderBoard({ fateData: null, confrontationData: activeConfrontation });
    expect(fateTab()).not.toBeInTheDocument();
  });
});
