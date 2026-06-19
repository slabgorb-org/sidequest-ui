/**
 * Story 126-19 PART A (ADR-144 / ADR-117): suppress residual NATIVE chrome on a
 * Fate-ruleset character (RED). Source: sq-playtest-pingpong 2026-06-19, a
 * pulp_noir/annees_folles PC ("Roy Calder", screenshot 150-1-005-game-opening).
 *
 * Under a Fate binding there is no HP, no level, no class — harm is Stress +
 * Consequences (ADR-144 replaces the native ruleset, it does not layer on top).
 * Four native render sites leak that chrome onto a Fate PC and must be suppressed:
 *   1. Character HEADER — the "Lv 1" badge + the "HP 10/10" pill
 *   2. Character BODY — the FolioEdgeTicks block, which renders BOTH the
 *      "HP/Vitality 10/10" label AND the row of ♦ diamond pips (the title's two
 *      "redundant forms" — one component, `character-edge-ticks`)
 *   3. PARTY panel row — "{class} Lv.{level} · HP {hp}/{hp_max}" (class_hint + level + HP)
 *   4. action/input bar — the co-located HP pip scale (`input-hp-scale`)
 *
 * THE load-bearing invariant (SOUL "Bind the Ruleset, Don't Balance It"):
 * suppression must BRANCH on the bound ruleset, never delete globally. HP/level/
 * class are LEGITIMATE under Worlds Without Number. So every assertion below is
 * PAIRED: a Fate pack (fateData present) hides the chrome; a native/WN pack
 * (fateData == null) keeps it. A one-sided test would green-light a global
 * deletion that breaks every WN pack — the exact failure this paired suite guards.
 *
 * This is the mandatory WIRING test (server/ui CLAUDE.md "Every Test Suite Needs
 * a Wiring Test"): the chrome is exercised through GameBoard's real production
 * render path — `renderWidgetContent` → CharacterWidget/CharacterPanel for the
 * panel surfaces, and the always-present input region for the HP scale — not the
 * components in isolation. The ruleset signal is GameBoard's existing `fateData`
 * prop (the same signal that already drives `showCurrency={fateData == null}` on
 * the inventory widget); no new props are introduced by this story.
 *
 * NOT in scope (split to a follow-up per Keith, 2026-06-19): PART B — removing the
 * standalone "Fate" dock tab. That tab also hosts story 118-7's non-conflict 4dF
 * roll tray (FateDiceTray), which is NOT duplicated under Character→Stats; removing
 * it wholesale loses the out-of-conflict roll surface. The dedup + roll re-home is
 * its own story. This file therefore does NOT touch GameBoard-fate-tab.test.tsx.
 *
 * jsdom note: test-setup.ts mocks matchMedia → "mobile", so renderBoard() renders
 * via MobileTabView (flat role="tab" buttons; the Character tab is labeled
 * "Character"). The HP pip scale sits in the always-present input region, so it
 * needs no tab switch.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { CharacterSheetData } from "@/components/CharacterSheet";
import type { CharacterSummary } from "@/types/party";
import type { FateStatePayload } from "@/types/payloads";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const FATE_PC = "Roy Calder";

// The native PARTY_STATUS roster the server emits even for a Fate PC (the
// "orphaned native model" root): class_hint="Detective", level=1, hp=10/10.
const baseCharacters: CharacterSummary[] = [
  {
    player_id: "p1",
    name: "keith",
    character_name: FATE_PC,
    class: "Detective",
    level: 1,
    hp: 10,
    hp_max: 10,
    status_effects: [],
    portrait_url: "",
    current_location: "",
  },
];

// The local PC's collapsed sheet — also carries the orphaned native HP/level/class
// (this is exactly what made "Lv 1 / HP 10/10" leak in the screenshot).
const baseSheet: CharacterSheetData = {
  name: FATE_PC,
  class: "Detective",
  level: 1,
  hp: 10,
  hp_max: 10,
  stats: { Edge: 10 },
  abilities: [],
  class_moves: [],
  backstory: "",
};

// A FATE_STATE projection (emitted only on a ruleset=='fate' pack). Its character
// name matches the local sheet so GameBoard derives a non-null fateSheet.
const fateState: FateStatePayload = {
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

function renderBoard(overrides: Partial<GameBoardProps> = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: baseCharacters,
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

// Activate the mobile "Character" tab so CharacterPanel mounts. (The HP pip scale
// lives in the always-present input region and needs no activation.)
function openCharacterTab() {
  fireEvent.click(screen.getByRole("tab", { name: /character/i }));
}

describe("Story 126-19 PART A — a Fate pack SUPPRESSES native HP/level/class chrome", () => {
  it("Character header hides the native level badge and HP pill", () => {
    renderBoard({ fateData: fateState });
    openCharacterTab();
    // sanity: we are looking at the real panel rendered via GameBoard's path
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("character-level-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("character-edge-badge")).not.toBeInTheDocument();
  });

  it("Character body hides the redundant 'HP/Vitality 10/10' pill + ♦ diamond-pip row", () => {
    renderBoard({ fateData: fateState });
    openCharacterTab();
    // FolioEdgeTicks renders BOTH the HP label and the pip row — one testid covers
    // the title's two "redundant forms".
    expect(screen.queryByTestId("character-edge-ticks")).not.toBeInTheDocument();
  });

  it("Party panel row hides class, level, and HP for a Fate PC (but keeps the name)", () => {
    renderBoard({ fateData: fateState });
    openCharacterTab();
    const row = screen.getByTestId("party-member-p1");
    expect(row).toHaveTextContent(FATE_PC); // identity stays
    expect(row).not.toHaveTextContent("Detective"); // native class_hint gone
    expect(row).not.toHaveTextContent("Lv."); // native level gone
    expect(
      within(row).queryByTestId("party-member-edge-p1"),
    ).not.toBeInTheDocument(); // native HP pill gone
  });

  it("Action/input bar hides the co-located HP pip scale for a Fate PC", () => {
    renderBoard({ fateData: fateState });
    // No tab switch — the scale is in the always-present input region.
    expect(screen.queryByTestId("input-hp-scale")).not.toBeInTheDocument();
  });

  it("harm surfaces as the Fate sheet (Stress + Consequences), not native HP", () => {
    // AC-1 positive half: the Fate harm model replaces the native HP it suppressed.
    renderBoard({ fateData: fateState });
    openCharacterTab();
    expect(screen.getByTestId("fate-character")).toBeInTheDocument();
  });
});

describe("Story 126-19 PART A — a native/WN pack KEEPS its HP/level/class chrome (paired regression)", () => {
  it("Character header still shows the level badge and HP pill off Fate", () => {
    renderBoard({ fateData: null });
    openCharacterTab();
    expect(screen.getByTestId("character-level-badge")).toHaveTextContent("Lv 1");
    expect(screen.getByTestId("character-edge-badge")).toHaveTextContent("10/10");
  });

  it("Character body still shows the HP/Vitality pill + ♦ pip row off Fate", () => {
    renderBoard({ fateData: null });
    openCharacterTab();
    expect(screen.getByTestId("character-edge-ticks")).toBeInTheDocument();
  });

  it("Party panel row still shows class, level, and HP off Fate", () => {
    renderBoard({ fateData: null });
    openCharacterTab();
    const row = screen.getByTestId("party-member-p1");
    expect(row).toHaveTextContent("Detective");
    expect(row).toHaveTextContent("Lv.1");
    expect(within(row).getByTestId("party-member-edge-p1")).toBeInTheDocument();
  });

  it("Action/input bar still shows the HP pip scale off Fate", () => {
    renderBoard({ fateData: null });
    expect(screen.getByTestId("input-hp-scale")).toBeInTheDocument();
  });
});

describe("Story 126-19 PART A — suppression keys on the bound RULESET, not a per-PC name match", () => {
  it("still suppresses native chrome on a Fate pack when the fate roster name does not match the local sheet", () => {
    // A Fate session (fateData present) where fateData.characters does NOT contain
    // the local sheet's name. A suppression keyed only on a name-matched fateSheet
    // would derive null and LEAK the native chrome. The ruleset signal is
    // `fateData != null` (mirroring the inventory `showCurrency` gate), so the
    // chrome must stay gone regardless — never leak HP/Lv/class on a Fate pack.
    const mismatched: FateStatePayload = {
      ...fateState,
      characters: [{ ...fateState.characters[0], name: "Someone Else Entirely" }],
    };
    renderBoard({ fateData: mismatched });
    openCharacterTab();
    expect(screen.queryByTestId("character-level-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("character-edge-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("character-edge-ticks")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-hp-scale")).not.toBeInTheDocument();
  });
});
