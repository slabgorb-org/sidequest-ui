import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CharacterSheet, type CharacterSheetData } from "../components/CharacterSheet";

const base: CharacterSheetData = {
  name: "Mara", class: "Investigator", class_reference_url: null,
  level: 1, stats: {}, abilities: [], class_moves: [],
  backstory: "An ex-ratcatcher.",
};

describe("CharacterSheet appearance", () => {
  it("renders the Appearance section when appearance is present", () => {
    render(<CharacterSheet data={{ ...base, appearance: "Tall, soot-stained, missing a tooth." }} />);
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Tall, soot-stained, missing a tooth.")).toBeInTheDocument();
  });

  it("omits the Appearance section when appearance is empty/absent", () => {
    render(<CharacterSheet data={base} />);
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
  });
});
