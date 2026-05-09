import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CharacterCreation } from "../CharacterCreation";

/**
 * Tasks 6.3 + 6.4 from docs/superpowers/plans/2026-05-09-cnc-chargen-big-improvements.md:
 *
 * 6.3 — wire StatArrangePanel and StoryPanel into CharacterCreation by
 *       dispatching on `scene.input_type` to the new sub-components.
 * 6.4 — drop the per-section Pencil "edit" affordance from the confirmation
 *       screen now that the server-side handler is gone.
 *
 * These tests pin both behaviors. The new `stat_arrange` and `story` render
 * branches must bridge their child-component callbacks back to `onRespond`
 * with the new phase strings the server expects, and the confirmation
 * branch must no longer render any `review-edit-*` Pencil button.
 */

describe("CharacterCreation: stat_arrange branch", () => {
  it("renders StatArrangePanel when scene.input_type is stat_arrange", () => {
    const onRespond = vi.fn();
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          input_type: "stat_arrange",
          prompt: "Arrange them.",
          pool: [12, 9, 15, 8, 14, 11],
          assignment: { STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null },
          class_requirements: [{ name: "Fighter", requirement_label: "STR 9+" }],
          qualifying_classes: [],
          confirm_enabled: false,
        }}
        loading={false}
        onRespond={onRespond}
      />,
    );
    expect(screen.getByTestId("stat-arrange-panel")).toBeInTheDocument();
  });

  it("emits arrange_assign on pool+slot click", () => {
    const onRespond = vi.fn();
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          input_type: "stat_arrange",
          prompt: "...",
          pool: [12, 9, 15, 8, 14, 11],
          assignment: { STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null },
          class_requirements: [],
          qualifying_classes: [],
          confirm_enabled: false,
        }}
        loading={false}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByTestId("arrange-pool-value-2"));
    fireEvent.click(screen.getByTestId("arrange-slot-STR"));
    expect(onRespond).toHaveBeenCalledWith({
      phase: "arrange_assign",
      stat: "STR",
      value: 15,
    });
  });

  it("emits arrange_reject when reject clicked", () => {
    const onRespond = vi.fn();
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          input_type: "stat_arrange",
          prompt: "...",
          pool: [12, 9, 15, 8, 14, 11],
          assignment: { STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null },
          class_requirements: [],
          qualifying_classes: [],
          confirm_enabled: false,
        }}
        loading={false}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByTestId("arrange-reject"));
    expect(onRespond).toHaveBeenCalledWith({ phase: "arrange_reject" });
  });
});

describe("CharacterCreation: story branch", () => {
  it("renders StoryPanel when scene.input_type is story", () => {
    const onRespond = vi.fn();
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          input_type: "story",
          prompt: "For the tally.",
          pronouns_options: ["she/her", "he/him", "they/them"],
          pronouns_allow_freeform: true,
          background_optional: true,
          description_optional: true,
          autogen_available: true,
        }}
        loading={false}
        onRespond={onRespond}
      />,
    );
    expect(screen.getByTestId("story-panel")).toBeInTheDocument();
  });

  it("emits story_autogen when autogen button clicked", () => {
    const onRespond = vi.fn();
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          input_type: "story",
          prompt: "...",
          pronouns_options: ["she/her"],
          pronouns_allow_freeform: false,
          background_optional: true,
          description_optional: true,
          autogen_available: true,
        }}
        loading={false}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByTestId("story-autogen"));
    expect(onRespond).toHaveBeenCalledWith({ phase: "story_autogen" });
  });

  it("emits story_confirm with pronouns + textareas", () => {
    const onRespond = vi.fn();
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          input_type: "story",
          prompt: "...",
          pronouns_options: ["they/them"],
          pronouns_allow_freeform: false,
          background_optional: true,
          description_optional: true,
          autogen_available: false,
        }}
        loading={false}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByTestId("story-pronoun-they/them"));
    fireEvent.change(screen.getByTestId("story-background"), {
      target: { value: "Former ratcatcher." },
    });
    fireEvent.click(screen.getByTestId("story-confirm"));
    expect(onRespond).toHaveBeenCalledWith({
      phase: "story_confirm",
      pronouns: "they/them",
      background: "Former ratcatcher.",
      description: "",
    });
  });
});

describe("CharacterCreation: Pencil removal", () => {
  it("does not render any review-edit Pencil button", () => {
    render(
      <CharacterCreation
        scene={{
          phase: "confirmation",
          character_preview: { Race: "Human", Class: "Fighter" },
          message: "Looks good?",
        }}
        loading={false}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("review-edit-Race")).not.toBeInTheDocument();
    expect(screen.queryByTestId("review-edit-Class")).not.toBeInTheDocument();
  });
});
