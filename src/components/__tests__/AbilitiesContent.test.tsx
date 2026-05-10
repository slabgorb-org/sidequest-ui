import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AbilitiesContent } from "../CharacterPanel";
import type { AbilityDefinition } from "../CharacterSheet";

const cleric_turn_undead: AbilityDefinition = {
  name: "Turn Undead",
  genre_description: "He raises the holy symbol.",
  mechanical_effect: "2d6 vs HD.",
  involuntary: false,
  source: "Class",
};

describe("AbilitiesContent — four-section restructure", () => {
  it("never renders 'No abilities.'", () => {
    const { container } = render(
      <AbilitiesContent
        abilities={[]}
        class_moves={[]}
        magicState={null}
        characterId="c1"
      />,
    );
    expect(container.textContent).not.toContain("No abilities.");
  });

  it("renders Class signature card with prose for a Cleric", () => {
    render(
      <AbilitiesContent
        abilities={[cleric_turn_undead]}
        class_moves={["pray", "shield_bash", "turn_undead"]}
        magicState={null}
        characterId="c1"
      />,
    );
    expect(screen.getByText("Turn Undead")).toBeInTheDocument();
    expect(screen.getByText(/raises the holy symbol/i)).toBeInTheDocument();
  });

  it("renders class_moves as a chip row", () => {
    render(
      <AbilitiesContent
        abilities={[]}
        class_moves={["pray", "shield_bash", "turn_undead"]}
        magicState={null}
        characterId="c1"
      />,
    );
    expect(screen.getByText("pray")).toBeInTheDocument();
    expect(screen.getByText("shield_bash")).toBeInTheDocument();
    expect(screen.getByText("turn_undead")).toBeInTheDocument();
  });

  it("hides Class signature header when no Class-source abilities", () => {
    render(
      <AbilitiesContent
        abilities={[]}
        class_moves={["cast_spell"]}
        magicState={null}
        characterId="c1"
      />,
    );
    expect(screen.queryByText(/class signature/i)).not.toBeInTheDocument();
  });

  it("hides 'From inventory' header when no Item-source abilities", () => {
    render(
      <AbilitiesContent
        abilities={[cleric_turn_undead]}
        class_moves={["pray"]}
        magicState={null}
        characterId="c1"
      />,
    );
    expect(screen.queryByText(/from inventory/i)).not.toBeInTheDocument();
  });

  it("does not surface auto-filled scaffolding entries", () => {
    const leak: AbilityDefinition = {
      ...cleric_turn_undead,
      name: "thing-auto-filled",
    };
    render(
      <AbilitiesContent
        abilities={[cleric_turn_undead, leak]}
        class_moves={[]}
        magicState={null}
        characterId="c1"
      />,
    );
    expect(screen.queryByText("thing-auto-filled")).not.toBeInTheDocument();
  });
});
