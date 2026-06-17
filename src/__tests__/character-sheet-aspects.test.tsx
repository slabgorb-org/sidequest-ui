import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CharacterSheet, type CharacterSheetData } from "../components/CharacterSheet";

const base: CharacterSheetData = {
  name: "Mara", class: "Investigator", class_reference_url: null,
  level: 1, stats: {}, abilities: [], class_moves: [], backstory: "x",
};

describe("CharacterSheet aspects", () => {
  it("renders Fate aspects with kind labels when present", () => {
    render(<CharacterSheet data={{ ...base, fate_aspects: [
      { text: "Disgraced Pinkerton With a Long Memory", kind: "high_concept", free_invokes: 0 },
      { text: "Can't Leave a Mystery Alone", kind: "trouble", free_invokes: 0 },
    ] }} />);
    expect(screen.getByText("Aspects")).toBeInTheDocument();
    expect(screen.getByText(/High Concept/)).toBeInTheDocument();
    expect(screen.getByText(/Disgraced Pinkerton With a Long Memory/)).toBeInTheDocument();
  });

  it("omits the Aspects section when there are none", () => {
    render(<CharacterSheet data={base} />);
    expect(screen.queryByText("Aspects")).not.toBeInTheDocument();
  });
});
