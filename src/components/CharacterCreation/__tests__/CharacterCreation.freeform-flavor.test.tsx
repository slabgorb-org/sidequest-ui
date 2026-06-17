import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterCreation } from "../CharacterCreation";

/**
 * Playtest 2026-06-17 [UX]: the chargen free-text box ("Or describe it in your own
 * words…") sits beside the mechanical choices on a funnel step and reads as a
 * co-equal input that authors your character. It does NOT — free-text is additive
 * narrative color (it shapes prose via background/origin_label, never a Fate aspect,
 * an inventory item, or a skill). Keith's call (2026-06-17): label it as optional
 * flavor that won't change the sheet — NOT wire a derivation. So when the box is an
 * "or" alternative to real choices, it must carry an honest flavor caption and a
 * softened placeholder. A pure freeform / name step (the box IS the answer) gets no
 * such caption — there it does not over-claim.
 */

const FLAVOR_NOTE = /colors the story, not your sheet/i;

describe("CharacterCreation — free-text box flavor honesty", () => {
  it("labels the free-text box as flavor when it is an OR-alternative to choices", () => {
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          scene_index: 1,
          total_scenes: 5,
          input_type: "choice",
          message: "What did you bring with you?",
          choices: [
            { label: "A pocket watch", description: "It stopped at 3:07." },
            { label: "A folded map", description: "Worn soft at the creases." },
          ],
          allows_freeform: true,
        }}
        loading={false}
        onRespond={() => {}}
      />,
    );

    // The honest caption is present...
    expect(screen.getByTestId("freeform-flavor-note")).toHaveTextContent(
      FLAVOR_NOTE,
    );
    // ...and the over-claiming "describe it in your own words" placeholder is gone,
    // replaced by a softened, additive prompt.
    expect(
      screen.queryByPlaceholderText("Or describe it in your own words..."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/add a detail in your own words/i),
    ).toBeInTheDocument();
  });

  it("does NOT add the flavor caption on a pure freeform step (the box IS the answer)", () => {
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          scene_index: 1,
          total_scenes: 5,
          input_type: "freeform",
          message: "Where do you come from?",
        }}
        loading={false}
        onRespond={() => {}}
      />,
    );

    expect(screen.queryByTestId("freeform-flavor-note")).not.toBeInTheDocument();
    // The input still renders — a freeform step needs its box.
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("does NOT add the flavor caption on a name-entry step", () => {
    render(
      <CharacterCreation
        scene={{
          phase: "scene",
          scene_index: 1,
          total_scenes: 5,
          input_type: "name",
          message: "What is your name?",
        }}
        loading={false}
        onRespond={() => {}}
      />,
    );

    expect(screen.queryByTestId("freeform-flavor-note")).not.toBeInTheDocument();
  });
});
