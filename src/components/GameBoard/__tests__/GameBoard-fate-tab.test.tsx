/**
 * Story 126-26 (PART B of 126-19): REMOVE the duplicate standalone "Fate" dock
 * tab (RED). REVERSES the 118-2 RED in this same file.
 *
 * 118-2 added a standalone, data-gated "Fate" dock tab (WidgetId 'fate' →
 * FateWidget → FatePanel) to surface the player's Fate sheet. Since then the
 * SAME sheet was consolidated under Character→Stats (118-2's FateCharacterSheet,
 * threaded via GameBoard's `fateSheet`), so the standalone tab is now a DUPLICATE
 * of the Character sheet. 126-26 removes it.
 *
 * The one thing the standalone tab hosted that Character did NOT — the
 * non-conflict 4dF roll tray (`fate-dice-tray`) — is re-homed under Character by
 * its sibling suite GameBoard-fate-roll.test.tsx FIRST. This suite pins the
 * REMOVAL + dead-path cleanup:
 *   - the `fate` WidgetId / WIDGET_REGISTRY entry / hotkey 'f' are gone
 *   - no standalone "Fate" tab renders on a Fate pack
 *   - widgets/FateWidget.tsx is deleted
 *   - MobileTabView no longer lists a 'fate' tab
 * while PRESERVING what must survive:
 *   - the Fate sheet still renders under Character→Stats (the consolidation)
 *   - the `fate-conflict` surface (a DIFFERENT, conflict-gated widget) is untouched
 *
 * jsdom note: test-setup.ts mocks matchMedia → "mobile", so renderBoard() renders
 * via MobileTabView (flat role="tab" buttons). The Character tab is labeled
 * "Character"; CharacterPanel defaults to the "stats" tab.
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
import type { CharacterSheetData } from "@/components/CharacterSheet";
import type { FateStatePayload } from "@/types/payloads";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const REGISTRY = WIDGET_REGISTRY as Record<string, WidgetDef | undefined>;

const FATE_PC = "Sam Spadework";

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

function renderBoard(overrides: Partial<GameBoardProps> = {}) {
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
  const props = { ...defaults, ...overrides };
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
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

describe("GameBoard — the duplicate 'fate' dock tab is removed (Story 126-26)", () => {
  it("WIDGET_REGISTRY no longer defines a 'fate' widget", () => {
    expect(REGISTRY["fate"], "the duplicate 'fate' widget must be removed").toBeUndefined();
  });

  it("KEEPS the distinct 'fate-conflict' widget (a different, conflict-gated surface — out of scope)", () => {
    expect(
      REGISTRY["fate-conflict"],
      "fate-conflict is a separate surface and must NOT be removed",
    ).toBeDefined();
    expect(REGISTRY["fate-conflict"]?.label).toMatch(/fate conflict/i);
  });

  it("frees the 'f' hotkey — no widget maps to 'fate' anymore", () => {
    const map = buildHotkeyMap();
    expect(map["f"], "the 'f' hotkey must be freed when the fate tab is removed").toBeUndefined();
    expect(Object.values(map)).not.toContain("fate");
    // The map stays 1:1 (no collisions introduced by the removal).
    const ids = Object.values(map);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("deletes widgets/FateWidget.tsx (dead path cleanup)", () => {
    // import.meta.glob is statically resolved by Vite — after the file is deleted
    // it drops out of the match set. RED while the file still exists.
    const widgetFiles = import.meta.glob("../widgets/*.tsx");
    const hasFateWidget = Object.keys(widgetFiles).some((p) =>
      /\/FateWidget\.tsx$/.test(p),
    );
    expect(hasFateWidget, "widgets/FateWidget.tsx must be deleted").toBe(false);
  });

  it("MobileTabView no longer lists a 'fate' tab (but keeps 'fate-conflict')", async () => {
    const src = (await import("@/components/GameBoard/MobileTabView?raw")) as unknown as {
      default: string;
    };
    expect(src.default, "the mobile 'fate' tab entry must be removed").not.toMatch(
      /id:\s*["']fate["']/,
    );
    expect(src.default, "the mobile 'fate-conflict' tab must remain").toMatch(
      /id:\s*["']fate-conflict["']/,
    );
  });

  it("does NOT render a standalone 'Fate' tab on a Fate pack", () => {
    renderBoard({ fateData: seeded });
    // Exact name — must not match the still-valid 'Fate Conflict' tab.
    expect(screen.queryByRole("tab", { name: "Fate" })).not.toBeInTheDocument();
  });
});

describe("GameBoard — removing the dock tab PRESERVES the consolidated Fate sheet (Story 126-26)", () => {
  it("still surfaces the player's Fate sheet under Character→Stats (the sheet wasn't lost, only its duplicate tab)", () => {
    // Regression guard: the 118-2 consolidation must survive. A Fate PC opening
    // Character still sees their sheet — the removal targets the duplicate tab,
    // not the sheet.
    renderBoard({ fateData: seeded });
    fireEvent.click(screen.getByRole("tab", { name: /character/i }));
    expect(screen.getByTestId("fate-character")).toBeInTheDocument();
  });
});
