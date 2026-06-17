import { render, screen } from "@testing-library/react";
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
