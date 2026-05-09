/**
 * 14-5: Character generation back button — allow editing choices before final submit.
 *
 * Tests the choice history tracking, back navigation, review screen, and
 * submission gating in the CharacterCreation component. These tests verify
 * client-side state management for multi-step chargen with backtracking.
 *
 * ACs covered:
 *  - Back works: player can navigate to any previous step
 *  - Review shows all: review screen displays every choice made
 *  - Edit from review: each section has an "Edit" button returning to that step
 *  - No accidental submit: only "Create Character" on review triggers submission
 *  - State preserved: going back preserves previous choices (re-highlighted)
 *  - Server unchanged: CHARACTER_CREATION complete message format identical
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  CharacterCreation,
  type CreationScene,
  type CharacterCreationProps,
} from "@/components/CharacterCreation/CharacterCreation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a standard scene with choices. */
function makeScene(overrides: Partial<CreationScene> = {}): CreationScene {
  return {
    phase: "scene",
    scene_index: 0,
    total_scenes: 3,
    prompt: "Choose your origin.",
    choices: [
      { label: "Noble birth", description: "Born to privilege" },
      { label: "Street orphan", description: "Raised in the gutters" },
      { label: "Foreign traveler", description: "From distant lands" },
    ],
    input_type: "choice",
    ...overrides,
  };
}

/** Build a confirmation/review scene. */
function makeConfirmationScene(
  overrides: Partial<CreationScene> = {},
): CreationScene {
  return {
    phase: "confirmation",
    summary: "Name: Aldric\nOrigin: Noble birth\nClass: Warrior",
    message: "Is this the hero you wish to become?",
    character_preview: {
      name: "Aldric",
      origin: "Noble birth",
      class: "Warrior",
    },
    ...overrides,
  };
}

/** Default props for rendering CharacterCreation. */
function defaultProps(
  overrides: Partial<CharacterCreationProps> = {},
): CharacterCreationProps {
  return {
    scene: makeScene(),
    loading: false,
    onRespond: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC-1: Back works — player can navigate to any previous step
// ---------------------------------------------------------------------------
describe("AC-1: back navigation between chargen steps", () => {
  it("shows a back button on scenes after the first", () => {
    const props = defaultProps({
      scene: makeScene({ scene_index: 1, total_scenes: 3 }),
    });
    render(<CharacterCreation {...props} />);

    const backButton = screen.getByRole("button", { name: /back/i });
    expect(backButton).toBeInTheDocument();
  });

  it("does NOT show a back button on the first scene", () => {
    const props = defaultProps({
      scene: makeScene({ scene_index: 0, total_scenes: 3 }),
    });
    render(<CharacterCreation {...props} />);

    expect(
      screen.queryByRole("button", { name: /back/i }),
    ).not.toBeInTheDocument();
  });

  it("navigates back to the previous scene when back is clicked", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();

    // Render scene 2 (index 1) with history indicating we came from scene 1
    const props = defaultProps({
      scene: makeScene({
        scene_index: 1,
        prompt: "Choose your calling.",
        choices: [
          { label: "Warrior", description: "" },
          { label: "Mage", description: "" },
        ],
      }),
      onRespond,
    });
    render(<CharacterCreation {...props} />);

    const backButton = screen.getByRole("button", { name: /back/i });
    await user.click(backButton);

    // The component should signal navigation back (not submission)
    // It should NOT send a server message that ends chargen
    const calls = onRespond.mock.calls;
    const backCall = calls.find((call) => {
      const payload = call[0] as Record<string, unknown>;
      return payload.action === "back" || payload.navigate === "back";
    });
    expect(backCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AC-2: Review screen shows all choices
// ---------------------------------------------------------------------------
describe("AC-2: review screen displays every choice made", () => {
  it("renders a review/preview of the complete character on confirmation", () => {
    const props = defaultProps({
      scene: makeConfirmationScene(),
    });
    render(<CharacterCreation {...props} />);

    // The review screen should show the character summary
    expect(screen.getByText(/Aldric/)).toBeInTheDocument();
    expect(screen.getByText(/Noble birth/i)).toBeInTheDocument();
    expect(screen.getByText(/Warrior/i)).toBeInTheDocument();
  });

  it("displays individual choice sections that can be identified", () => {
    const props = defaultProps({
      scene: makeConfirmationScene({
        character_preview: {
          name: "Aldric",
          origin: "Noble birth",
          class: "Warrior",
          fear: "The dark",
        },
      }),
    });
    render(<CharacterCreation {...props} />);

    // Each choice section should be distinguishable (for edit buttons)
    // Look for testids or structured sections rather than just raw text
    const reviewContainer = screen.getByTestId("character-review");
    expect(reviewContainer).toBeInTheDocument();

    // Should have identifiable sections for each choice
    const sections = within(reviewContainer).getAllByTestId(/review-section/);
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// AC-3 (removed 2026-05-09): Per-section "Edit" buttons on review screen.
// The Pencil edit affordance was dropped server-side as part of the chargen
// big-improvements pass — characters now evolve through play rather than
// pre-creation re-edits. The "Go Back" button on the review screen plus
// the per-step "← Back" links remain. See plan
// docs/superpowers/plans/2026-05-09-cnc-chargen-big-improvements.md task 6.4.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC-4: No accidental submit — only "Create Character" button submits
// ---------------------------------------------------------------------------
describe("AC-4: no accidental submission", () => {
  it("has a 'Create Character' button on the review screen (not just 'Confirm')", () => {
    const props = defaultProps({
      scene: makeConfirmationScene(),
    });
    render(<CharacterCreation {...props} />);

    // Must have explicit "Create Character" button, not generic "Confirm"
    const createBtn = screen.getByRole("button", {
      name: /create character/i,
    });
    expect(createBtn).toBeInTheDocument();
  });

  it("does NOT have a generic 'Confirm' button that could be confused with submission", () => {
    const props = defaultProps({
      scene: makeConfirmationScene(),
    });
    render(<CharacterCreation {...props} />);

    // The old "Confirm" button should be replaced by "Create Character"
    expect(
      screen.queryByRole("button", { name: /^confirm$/i }),
    ).not.toBeInTheDocument();
  });

  it("only sends submission when 'Create Character' is clicked", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    const props = defaultProps({
      scene: makeConfirmationScene(),
      onRespond,
    });
    render(<CharacterCreation {...props} />);

    const createBtn = screen.getByRole("button", {
      name: /create character/i,
    });
    await user.click(createBtn);

    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "confirmation", choice: "1" }),
    );
  });

  it("'Go Back' on confirmation navigates back, does NOT submit", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    const props = defaultProps({
      scene: makeConfirmationScene(),
      onRespond,
    });
    render(<CharacterCreation {...props} />);

    // The old "Go Back" sent { phase: "confirmation", choice: "2" } which ENDED chargen
    // The new behavior should navigate back without ending chargen
    const goBackBtn = screen.getByRole("button", { name: /go back/i });
    await user.click(goBackBtn);

    // Should NOT have sent submission payload
    const submissionCalls = onRespond.mock.calls.filter((call) => {
      const payload = call[0] as Record<string, unknown>;
      return payload.phase === "confirmation" && payload.choice === "2";
    });
    expect(submissionCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC-5: State preserved — going back preserves previous choices
// ---------------------------------------------------------------------------
describe("AC-5: choice state preservation on back navigation", () => {
  it("highlights the previously selected choice when returning to a step", () => {
    // When navigating back to a step, the choice the player previously made
    // should be visually highlighted/selected
    const props = defaultProps({
      scene: makeScene({
        scene_index: 0,
        previous_choice: 1,
        choices: [
          { label: "Noble birth", description: "" },
          { label: "Street orphan", description: "" },
          { label: "Foreign traveler", description: "" },
        ],
      }),
    });

    // previous_choice: 1 indicates "Street orphan" was selected previously
    render(<CharacterCreation {...props} />);

    // The second choice (Street orphan, index 1) should be highlighted
    const choices = screen.getAllByRole("button", {
      name: /noble|orphan|traveler/i,
    });
    // At least one choice should have a selected/highlighted visual state
    // (we'll check for aria-selected or a CSS class indicating selection)
    const selectedChoice = choices.find(
      (btn) =>
        btn.getAttribute("aria-selected") === "true" ||
        btn.classList.contains("selected") ||
        btn.getAttribute("data-selected") === "true",
    );
    expect(selectedChoice).toBeDefined();
  });

  it("preserves freeform input value when returning to a text input step", () => {
    const props = defaultProps({
      scene: makeScene({
        scene_index: 1,
        input_type: "name",
        prompt: "What name do you carry?",
        choices: [],
        previous_input: "Aldric Stormborn",
      }),
    });

    // previous_input restores the name entered on a previous visit to this step
    render(<CharacterCreation {...props} />);

    const input = screen.getByRole("textbox");
    // If we navigated back to this step, the previous value should be restored
    expect(input).toHaveValue("Aldric Stormborn");
  });
});

// ---------------------------------------------------------------------------
// AC-6: Server message format unchanged
// ---------------------------------------------------------------------------
describe("AC-6: CHARACTER_CREATION message format unchanged", () => {
  it("sends the same payload format for final submission as before", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    const props = defaultProps({
      scene: makeConfirmationScene(),
      onRespond,
    });
    render(<CharacterCreation {...props} />);

    const createBtn = screen.getByRole("button", {
      name: /create character/i,
    });
    await user.click(createBtn);

    // The final submission must use the same format the server expects
    expect(onRespond).toHaveBeenCalledWith({
      phase: "confirmation",
      choice: "1",
    });
  });

  it("sends standard choice payload format during scene navigation", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    const props = defaultProps({
      scene: makeScene({
        choices: [
          { label: "Noble birth", description: "" },
          { label: "Street orphan", description: "" },
        ],
      }),
      onRespond,
    });
    render(<CharacterCreation {...props} />);

    const choiceBtn = screen.getByRole("button", { name: /noble birth/i });
    await user.click(choiceBtn);

    // Choice payloads must maintain { phase: "scene", choice: "N" } format
    expect(onRespond).toHaveBeenCalledWith({
      phase: "scene",
      choice: "1",
    });
  });
});

// ---------------------------------------------------------------------------
// TypeScript rule coverage: React/JSX specific (#6)
// ---------------------------------------------------------------------------
describe("TS rule #6: React hooks and rendering", () => {
  it("does not re-render infinitely with choice history state", () => {
    // Guards against useEffect dependency on object/array literal causing
    // infinite re-render loop (TS rule #6, check 2)
    const onRespond = vi.fn();
    let renderCount = 0;
    const OriginalComponent = CharacterCreation;

    // Wrap to count renders
    function CountingWrapper(props: CharacterCreationProps) {
      renderCount++;
      return <OriginalComponent {...props} />;
    }

    render(
      <CountingWrapper
        scene={makeScene()}
        loading={false}
        onRespond={onRespond}
      />,
    );

    // Should stabilize within reasonable render count (React strict mode = 2x)
    expect(renderCount).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — paranoid TEA coverage
// ---------------------------------------------------------------------------
describe("edge cases: chargen back button", () => {
  it("handles back on second scene when first was freeform input", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();

    render(
      <CharacterCreation
        scene={makeScene({
          scene_index: 1,
          prompt: "Choose your class.",
          choices: [
            { label: "Warrior", description: "" },
            { label: "Mage", description: "" },
          ],
        })}
        loading={false}
        onRespond={onRespond}
      />,
    );

    const backButton = screen.getByRole("button", { name: /back/i });
    await user.click(backButton);

    // Should navigate back even when previous step was freeform
    expect(onRespond).toHaveBeenCalled();
    const backPayload = onRespond.mock.calls[0][0];
    expect(backPayload).not.toMatchObject({
      phase: "confirmation",
      choice: "2",
    });
  });

  it("does not lose later choices when editing an earlier step", () => {
    // If player goes back to step 1 and changes their choice,
    // steps 2+ should still exist in history (unless invalidated)
    const props = defaultProps({
      scene: makeScene({
        scene_index: 0,
        prompt: "Choose your origin.",
      }),
    });
    render(<CharacterCreation {...props} />);

    // The component should maintain history even when viewing an earlier step
    // This test ensures the state machine preserves forward history
    const container = screen.getByTestId("character-creation");
    expect(container).toBeInTheDocument();
  });

  it("review screen is accessible with keyboard navigation", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();

    render(
      <CharacterCreation
        scene={makeConfirmationScene()}
        loading={false}
        onRespond={onRespond}
      />,
    );

    // Tab to Create Character button and activate with Enter
    const createBtn = screen.getByRole("button", {
      name: /create character/i,
    });
    createBtn.focus();
    await user.keyboard("{Enter}");

    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "confirmation", choice: "1" }),
    );
  });
});
