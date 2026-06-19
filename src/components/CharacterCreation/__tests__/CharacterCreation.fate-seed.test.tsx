import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CharacterCreation, type CreationScene } from "../CharacterCreation";

/**
 * Story 126-24 — narrative chargen seeds the Fate pyramid + aspects as EDITABLE
 * DEFAULTS. The SERVER does the seeding (builder.py present-time seed from the
 * accumulated narrative hints via the genre seed table); the UI seam already
 * renders `fate_current_allocation` (pyramid) and slot `value` (aspects).
 *
 * These are WIRING GUARDS (AC7: "UI renders the seed with no code change OR the
 * minimal change is wired and tested — wiring test, not source-grep"): they prove a
 * SEEDED payload renders as a pre-ranked, editable sheet — no blank sheet — and that
 * the no-silent-default invariant survives for High Concept / Trouble. They should be
 * GREEN today (the seam exists); if a renderer change is needed they pin the contract.
 */

const DEFAULT_HC = "Disbarred Lawyer Working the Other Side of the Law";
const DEFAULT_TROUBLE = "I Can't Leave a Loose Thread Alone";

// A COMPLETE, legal seeded allocation for pyramid [1,2,3,4] @ apex 4 — what the
// server now sends after seeding from a "Detective" narrative hint.
const SEEDED_ALLOCATION = {
  Investigate: 4,
  Contacts: 3,
  Notice: 3,
  Deceive: 2,
  Shoot: 2,
  Rapport: 2,
  Will: 1,
  Stealth: 1,
  Fight: 1,
  Provoke: 1,
};

function seededPyramidScene(overrides: Partial<CreationScene> = {}) {
  return {
    phase: "scene",
    input_type: "fate_skill_pyramid",
    prompt: "Rank 'em honest.",
    fate_available_skills: Object.keys(SEEDED_ALLOCATION),
    fate_pyramid: [1, 2, 3, 4],
    fate_apex_rating: 4,
    fate_current_allocation: { ...SEEDED_ALLOCATION },
    fate_ladder_labels: { 4: "Great", 3: "Good", 2: "Fair", 1: "Average" },
    fate_legal: true,
    fate_violations: [],
    ...overrides,
  };
}

function seededAspectsScene(overrides: Partial<CreationScene> = {}) {
  return {
    phase: "scene",
    input_type: "fate_aspects",
    prompt: "Who are you, gumshoe?",
    fate_aspect_slots: [
      // HC/Trouble: NO value (placeholder only) — no-silent-default invariant.
      { kind: "high_concept", label: "High Concept", value: "", required: true, suggestion: DEFAULT_HC },
      { kind: "trouble", label: "Trouble", value: "", required: true, suggestion: DEFAULT_TROUBLE },
      // Free aspect: SEEDED value (editable pre-fill from the narrative hint).
      { kind: "character", label: "Aspect", value: "I Find Things Out", required: false, suggestion: "" },
      { kind: "character", label: "Aspect", value: "", required: false, suggestion: "" },
      { kind: "character", label: "Aspect", value: "", required: false, suggestion: "" },
    ],
    ...overrides,
  };
}

function renderScene(scene: CreationScene, onRespond = vi.fn()) {
  render(<CharacterCreation scene={scene} loading={false} onRespond={onRespond} />);
  return onRespond;
}

describe("CharacterCreation: Fate narrative-chargen seed (126-24)", () => {
  it("renders a fully seeded pyramid — every rung at budget, no blank sheet", () => {
    renderScene(seededPyramidScene());
    expect(screen.getByTestId("fate-rung-4")).toHaveTextContent("1/1");
    expect(screen.getByTestId("fate-rung-3")).toHaveTextContent("2/2");
    expect(screen.getByTestId("fate-rung-2")).toHaveTextContent("3/3");
    expect(screen.getByTestId("fate-rung-1")).toHaveTextContent("4/4");
  });

  it("the seeded allocation is the editable default — confirm sends it as-is", () => {
    const onRespond = renderScene(seededPyramidScene());
    fireEvent.click(screen.getByTestId("fate-pyramid-confirm"));
    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "fate_pyramid_confirm",
        fate_allocation: { ...SEEDED_ALLOCATION },
      }),
    );
  });

  it("a player can override a seeded rank — the override wins", () => {
    const onRespond = renderScene(seededPyramidScene());
    // Investigate seeded at Great(4); the player demotes it to Average(1).
    const investigate = screen.getByTestId("fate-skill-Investigate") as HTMLSelectElement;
    expect(investigate).toHaveValue("4");
    fireEvent.change(investigate, { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("fate-pyramid-confirm"));
    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "fate_pyramid_confirm",
        fate_allocation: expect.objectContaining({ Investigate: 1 }),
      }),
    );
  });

  it("renders a seeded free aspect as an editable pre-fill", () => {
    renderScene(seededAspectsScene());
    expect(screen.getByTestId("fate-aspect-free-0")).toHaveValue("I Find Things Out");
  });

  it("keeps High Concept / Trouble placeholder-only even when free aspects are seeded", () => {
    // AC5 / no-silent-default: the seed never pre-fills HC/Trouble VALUE, so a player
    // who clicks Confirm still ships empty HC/Trouble and the server re-prompts loud.
    renderScene(seededAspectsScene());
    const hc = screen.getByTestId("fate-aspect-high_concept") as HTMLInputElement;
    const trouble = screen.getByTestId("fate-aspect-trouble") as HTMLInputElement;
    expect(hc).toHaveValue("");
    expect(trouble).toHaveValue("");
    expect(hc).toHaveAttribute("placeholder", DEFAULT_HC);
    expect(trouble).toHaveAttribute("placeholder", DEFAULT_TROUBLE);
  });
});
