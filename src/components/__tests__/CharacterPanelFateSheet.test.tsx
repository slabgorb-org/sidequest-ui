import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { CharacterPanel } from "../CharacterPanel";
import type { CharacterSheetData } from "../CharacterSheet";
import type { FateCharacterEntry } from "@/types/payloads";

// Playtest 2026-06-17 [BUG] (ping-pong): on a Fate world the in-game Character
// panel showed the native unified surface (HP/Lv) and "No stats available." — it
// never rendered the player's Fate sheet, even though core.fate_sheet was fully
// populated in the save. A Fate player could not see or invoke aspects, read
// skills, or watch stress/consequences (a direct Sebastien/Jade "show me the math
// in the player UI" miss). Fix: thread the local PC's FateCharacterEntry into the
// Stats tab and render the shared FateCharacterSheet (reused from FatePanel).

// A Fate-world character: native `stats` is empty (the WN/native stat block is
// not populated on a Fate pack), which is exactly the state that produced the
// "No stats available." bug.
const FATE_CHARACTER: CharacterSheetData = {
  name: "Groucho",
  class: "Stubborn Skeptic",
  level: 1,
  stats: {},
  abilities: [],
  class_moves: [],
  backstory: "",
  current_location: "The Yellow Brick Road",
};

const FATE_SHEET: FateCharacterEntry = {
  name: "Groucho",
  fate_points: 3,
  refresh: 3,
  skills: [
    { name: "Rapport", rating: 3, ladder: "Good" },
    { name: "Deceive", rating: 4, ladder: "Great" },
  ],
  aspects: [
    {
      kind: "high_concept",
      text: "Fast-Talking Skeptic Adrift in Oz",
      free_invokes: 0,
    },
    {
      kind: "trouble",
      text: "Never Met an Authority I Didn't Sass",
      free_invokes: 1,
    },
  ],
  stress: { physical: [{ value: 1, checked: false }, { value: 2, checked: false }] },
  consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
};

beforeEach(() => {
  localStorage.clear();
});

describe("CharacterPanel — Fate sheet in the Stats tab (playtest 2026-06-17)", () => {
  it("renders the player's Fate sheet (aspects, skills, fate points) when fateSheet is provided", () => {
    render(<CharacterPanel character={FATE_CHARACTER} fateSheet={FATE_SHEET} />);

    // The shared per-PC Fate sheet is mounted in the Stats tab.
    expect(screen.getByTestId("fate-character")).toBeInTheDocument();
    // Skills are legible (name + signed rating).
    expect(screen.getByText("Deceive")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    // Aspects are present.
    expect(
      screen.getByText("Fast-Talking Skeptic Adrift in Oz"),
    ).toBeInTheDocument();
    // Fate points are surfaced.
    expect(screen.getByTestId("fate-points")).toHaveTextContent("3");
  });

  it("does NOT show the 'No stats available.' empty state for a Fate character", () => {
    render(<CharacterPanel character={FATE_CHARACTER} fateSheet={FATE_SHEET} />);
    expect(screen.queryByText("No stats available.")).not.toBeInTheDocument();
  });

  it("falls back to the native stats empty-state when no fateSheet is provided (non-Fate discriminator)", () => {
    // fateSheet absent ⇒ native StatsContent path. An empty native stat block
    // still reads "No stats available." — the prior behavior is preserved for
    // WN/native packs (GameBoard passes null on a non-Fate pack).
    render(<CharacterPanel character={FATE_CHARACTER} />);
    expect(screen.getByText("No stats available.")).toBeInTheDocument();
    expect(screen.queryByTestId("fate-character")).not.toBeInTheDocument();
  });
});

// Playtest 150-2 [BUG-LOW]: a player who picked 3 stunts at chargen saw them
// NOWHERE in game — the Fate sheet rendered no Stunts section, and Character→
// Abilities showed the native "Class moves" surface instead. Under Fate a PC's
// special abilities ARE their stunts. Fix: project stunts onto FATE_STATE (server)
// and render them in the Fate sheet (Stats tab) + the Abilities tab, suppressing the
// native class-move surface for Fate.
const FATE_SHEET_WITH_STUNTS: FateCharacterEntry = {
  ...FATE_SHEET,
  stunts: [
    { name: "The Quick Draw", description: "Iron clears leather first." },
    { name: "Nerves of Cold Iron", description: "+2 Will under a leveled gun." },
  ],
};

// A Fate character that ALSO carries native class moves — proves the moves are
// actively SUPPRESSED under Fate, not merely absent.
const FATE_CHARACTER_WITH_NATIVE_MOVES: CharacterSheetData = {
  ...FATE_CHARACTER,
  class_moves: [{ id: "fan_hammer", label: "Fan the Hammer" }],
};

describe("CharacterPanel — Fate stunts (playtest 150-2)", () => {
  it("renders the chosen stunts in the Stats-tab Fate sheet", () => {
    render(
      <CharacterPanel character={FATE_CHARACTER} fateSheet={FATE_SHEET_WITH_STUNTS} />,
    );
    expect(screen.getByTestId("fate-stunts")).toBeInTheDocument();
    expect(screen.getByText("The Quick Draw")).toBeInTheDocument();
    expect(screen.getByText(/Iron clears leather first\./)).toBeInTheDocument();
    expect(screen.getByText("Nerves of Cold Iron")).toBeInTheDocument();
  });

  it("renders stunts in the Abilities tab and suppresses native 'Class moves' under Fate", () => {
    render(
      <CharacterPanel
        character={FATE_CHARACTER_WITH_NATIVE_MOVES}
        fateSheet={FATE_SHEET_WITH_STUNTS}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Abilities" }));
    // The PC's stunts are the Abilities surface under Fate.
    expect(screen.getByText("The Quick Draw")).toBeInTheDocument();
    // The native class-move surface is suppressed — no heading, no move label.
    expect(screen.queryByText("Class moves")).not.toBeInTheDocument();
    expect(screen.queryByText("Fan the Hammer")).not.toBeInTheDocument();
  });

  it("shows an honest empty-state in the Abilities tab when a Fate PC has no stunts (never native moves)", () => {
    render(
      <CharacterPanel
        character={FATE_CHARACTER_WITH_NATIVE_MOVES}
        fateSheet={FATE_SHEET}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Abilities" }));
    expect(screen.getByText(/under Fate your special abilities are your stunts/i)).toBeInTheDocument();
    expect(screen.queryByText("Class moves")).not.toBeInTheDocument();
    expect(screen.queryByText("Fan the Hammer")).not.toBeInTheDocument();
  });
});

// 2026-06-20 design import — the Fate character sheet was restyled to the
// imported Claude Design ("Fate Sheet.dc.html", project "Fate character sheet
// improvements"): a world eyebrow above the cartouche, a fate-point token row,
// and the ladder grouped into rungs (signed value + adjective + skill chips).
// The restyle is READ-ONLY — the sheet DISPLAYS state, it never mutates it
// (spending fate points / invoking aspects flows through the conflict surface,
// not the sheet). So the sheet body carries no interactive controls: the
// prototype's per-aspect Invoke buttons and clickable tokens are deliberately
// omitted rather than rendered dead (No Stubbing).
describe("CharacterPanel — Fate sheet redesign (Fate Sheet.dc.html)", () => {
  it("shows a world eyebrow with the world name and the Fate Core ruleset label", () => {
    render(
      <CharacterPanel
        character={FATE_CHARACTER}
        fateSheet={FATE_SHEET}
        worldSlug="munchkin_country"
      />,
    );
    const eyebrow = screen.getByTestId("fate-eyebrow");
    expect(eyebrow).toHaveTextContent("Munchkin Country");
    expect(eyebrow).toHaveTextContent("Fate Core");
  });

  it("does not render the Fate eyebrow on a non-Fate pack (no fateSheet)", () => {
    render(
      <CharacterPanel character={FATE_CHARACTER} worldSlug="munchkin_country" />,
    );
    expect(screen.queryByTestId("fate-eyebrow")).not.toBeInTheDocument();
  });

  it("renders one fate-point token per refresh, with fate_points of them filled", () => {
    render(
      <CharacterPanel
        character={FATE_CHARACTER}
        fateSheet={{ ...FATE_SHEET, fate_points: 1, refresh: 3 }}
      />,
    );
    const tokens = screen.getAllByTestId("fate-point-token");
    expect(tokens).toHaveLength(3); // one per refresh
    const filled = tokens.filter(
      (t) => t.getAttribute("data-filled") === "true",
    );
    expect(filled).toHaveLength(1); // fate_points currently available
  });

  it("groups ladder skills by rating into rungs, apex rung first", () => {
    render(<CharacterPanel character={FATE_CHARACTER} fateSheet={FATE_SHEET} />);
    // FATE_SHEET: Deceive +4 (Great), Rapport +3 (Good) → two rungs.
    const rungs = screen.getAllByTestId("fate-rung");
    expect(rungs).toHaveLength(2);
    // The apex rung (+4) sorts first and carries its skill chip + adjective.
    expect(rungs[0]).toHaveTextContent("+4");
    expect(rungs[0].textContent?.toUpperCase()).toContain("GREAT");
    expect(within(rungs[0]).getByText("Deceive")).toBeInTheDocument();
  });

  it("is read-only: the sheet body carries no interactive controls", () => {
    render(<CharacterPanel character={FATE_CHARACTER} fateSheet={FATE_SHEET} />);
    const sheet = screen.getByTestId("fate-character");
    // No Invoke buttons, no clickable fate-point/stress controls in the sheet.
    expect(within(sheet).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText("Invoke")).not.toBeInTheDocument();
  });
});
