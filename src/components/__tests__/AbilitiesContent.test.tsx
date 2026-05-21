import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AbilitiesContent } from "../CharacterPanel";
import type { AbilityDefinition, ClassMove } from "../CharacterSheet";

const cleric_turn_undead: AbilityDefinition = {
  name: "Turn Undead",
  genre_description: "He raises the holy symbol.",
  mechanical_effect: "2d6 vs HD.",
  involuntary: false,
  source: "Class",
};

const move = (id: string, label: string, description?: string): ClassMove => ({
  id,
  label,
  description,
});

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
        class_moves={[move("pray", "Pray")]}
        magicState={null}
        characterId="c1"
      />,
    );
    expect(screen.getByText("Turn Undead")).toBeInTheDocument();
    expect(screen.getByText(/raises the holy symbol/i)).toBeInTheDocument();
  });

  it("renders class_moves as labeled chips, not raw snake_case ids", () => {
    render(
      <AbilitiesContent
        abilities={[]}
        class_moves={[
          move("cross_examine", "Cross-Examine"),
          move("present_argument", "Present Argument"),
        ]}
        magicState={null}
        characterId="c1"
      />,
    );
    // Human labels render…
    expect(screen.getByText("Cross-Examine")).toBeInTheDocument();
    expect(screen.getByText("Present Argument")).toBeInTheDocument();
    // …and the raw beat ids do NOT leak into the DOM.
    expect(screen.queryByText("cross_examine")).not.toBeInTheDocument();
    expect(screen.queryByText("present_argument")).not.toBeInTheDocument();
  });

  it("surfaces a class-move description as a tooltip (title attribute)", () => {
    render(
      <AbilitiesContent
        abilities={[]}
        class_moves={[
          move("cross_examine", "Cross-Examine", "Pick apart the testimony."),
        ]}
        magicState={null}
        characterId="c1"
      />,
    );
    const chip = screen.getByText("Cross-Examine");
    expect(chip.getAttribute("title")).toContain("Pick apart the testimony.");
  });

  it("hides Class signature header when no Class-source abilities", () => {
    render(
      <AbilitiesContent
        abilities={[]}
        class_moves={[move("cast_spell", "Cast Spell")]}
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
        class_moves={[move("pray", "Pray")]}
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
