import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CharacterCreation, type CreationScene } from "../CharacterCreation";

/**
 * Story 121-8 RED — Fate chargen UI renderers (ADR-144 F4a3, design §7).
 *
 * Three new server-driven `input_type`s, each rendered from the wire payload
 * 121-8 adds to CharacterCreationPayload (snake_case mirror of the server):
 *   - fate_aspects        → HC + Trouble + N free editable slots, pre-filled
 *   - fate_skill_pyramid  → allocation widget + ladder labels + live legality
 *   - fate_stunts         → catalog picker + refresh readout
 *
 * Pinned contract — playgroup rubric (mirrors the bones renderer, 103-3):
 *  - Sebastien/Jade (mechanics-first): the ladder, the rung counts, the refresh
 *    math are ON SCREEN, not narrated away.
 *  - Alex (no time pressure): nothing auto-commits; an explicit per-step confirm
 *    (data-testid `fate-{step}-confirm`) sends the response.
 *  - Server is the validation authority (No Silent Fallbacks): the UI MIRRORS
 *    `fate_legal`/`fate_violations`, it does not adjudicate.
 *
 * Structural ruleset gate (§7, lines 270-272): the renderer keys off `input_type`
 * ONLY — there is NO `ruleset==='fate'` conditional. No `ruleset` prop is passed
 * here; the fate surfaces still render purely from the scene's input_type, and a
 * d20 scene never co-renders a fate surface (paired negative).
 *
 * Wire submission phases (mirrors bones_confirm / arrange_confirm):
 *   fate_aspects_confirm  { phase, fate_high_concept, fate_trouble, fate_free_aspects }
 *   fate_pyramid_confirm  { phase, fate_allocation }
 *   fate_stunts_confirm   { phase, fate_selected_stunts }
 */

const HIGH_CONCEPT = "Hard-Boiled Private Eye";
const TROUBLE = "Can't Walk Away From a Dame in Trouble";

function aspectsScene(overrides: Partial<CreationScene> = {}) {
  return {
    phase: "scene",
    input_type: "fate_aspects",
    prompt: "Who are you, gumshoe?",
    fate_aspect_slots: [
      { kind: "high_concept", label: "High Concept", value: HIGH_CONCEPT, required: true, suggestion: HIGH_CONCEPT },
      { kind: "trouble", label: "Trouble", value: TROUBLE, required: true, suggestion: TROUBLE },
      { kind: "character", label: "Aspect", value: "", required: false, suggestion: "" },
      { kind: "character", label: "Aspect", value: "", required: false, suggestion: "" },
      { kind: "character", label: "Aspect", value: "", required: false, suggestion: "" },
    ],
    ...overrides,
  };
}

function pyramidScene(overrides: Partial<CreationScene> = {}) {
  return {
    phase: "scene",
    input_type: "fate_skill_pyramid",
    prompt: "Stack the deck.",
    fate_available_skills: ["Investigate", "Shoot", "Contacts", "Notice", "Will"],
    fate_pyramid: [1, 2, 3, 4],
    fate_apex_rating: 4,
    fate_current_allocation: { Investigate: 4, Shoot: 3, Contacts: 3 },
    fate_ladder_labels: { 4: "Great", 3: "Good", 2: "Fair", 1: "Average" },
    fate_legal: false,
    fate_violations: ["Pyramid incomplete: rung +1 needs 4 skills, has 0"],
    ...overrides,
  };
}

function stuntsScene(overrides: Partial<CreationScene> = {}) {
  return {
    phase: "scene",
    input_type: "fate_stunts",
    prompt: "Pick your edges.",
    fate_available_stunts: [
      { name: "Gun Nut", description: "+2 to attack with firearms in a prepared position." },
      { name: "Quick on the Draw", description: "Use Notice instead of a skill for initiative." },
      { name: "Streetwise", description: "+2 to Contacts in the bad part of town." },
    ],
    fate_selected_stunts: [],
    fate_free_stunts: 3,
    fate_base_refresh: 3,
    fate_current_refresh: 3,
    ...overrides,
  };
}

function renderScene(scene: CreationScene, onRespond = vi.fn()) {
  render(<CharacterCreation scene={scene} loading={false} onRespond={onRespond} />);
  return onRespond;
}

// ---------------------------------------------------------------------------
// fate_aspects
// ---------------------------------------------------------------------------

describe("CharacterCreation: Fate aspects (121-8)", () => {
  it("renders an editable input per aspect slot, pre-filled from the seed", () => {
    renderScene(aspectsScene());
    const hc = screen.getByTestId("fate-aspect-high_concept") as HTMLInputElement;
    const trouble = screen.getByTestId("fate-aspect-trouble") as HTMLInputElement;
    expect(hc).toHaveValue(HIGH_CONCEPT);
    expect(trouble).toHaveValue(TROUBLE);
    // Three free aspect slots in addition to the mandatory pair.
    expect(screen.getAllByTestId(/^fate-aspect-free-/)).toHaveLength(3);
  });

  it("does not auto-commit; the explicit confirm sends the edited aspect texts", () => {
    const onRespond = renderScene(aspectsScene());
    expect(onRespond).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("fate-aspect-free-0"), {
      target: { value: "A Card With No Name On It" },
    });
    fireEvent.click(screen.getByTestId("fate-aspects-confirm"));
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "fate_aspects_confirm",
        fate_high_concept: HIGH_CONCEPT,
        fate_trouble: TROUBLE,
        fate_free_aspects: ["A Card With No Name On It"],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// fate_skill_pyramid
// ---------------------------------------------------------------------------

describe("CharacterCreation: Fate skill pyramid (121-8)", () => {
  it("shows the ladder rung labels (the math is on screen)", () => {
    renderScene(pyramidScene());
    for (const label of ["Great", "Good", "Fair", "Average"]) {
      expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    }
  });

  it("shows per-rung budgets from fate_pyramid (placed/total)", () => {
    // pyramid [1,2,3,4] @ apex 4; allocation {Investigate:4, Shoot:3, Contacts:3}.
    renderScene(pyramidScene());
    expect(screen.getByTestId("fate-rung-4")).toHaveTextContent("1/1"); // Great: 1 placed / 1 budget
    expect(screen.getByTestId("fate-rung-3")).toHaveTextContent("2/2"); // Good: 2 placed / 2 budget
    expect(screen.getByTestId("fate-rung-1")).toHaveTextContent("0/4"); // Average: 0 placed / 4 budget
  });

  it("mirrors server legality without adjudicating — shows the violation text", () => {
    renderScene(pyramidScene());
    expect(screen.getByTestId("fate-pyramid-legality")).toHaveTextContent(/incomplete|illegal|rung/i);
  });

  it("drops the stale server verdict once the player edits the allocation (playtest [FATE/UX-LOW])", () => {
    // The server's `fate_violations` describe the INITIAL allocation; they are
    // not re-fetched per change. Showing that frozen red against a pyramid the
    // player has since filled is the bug. After an edit the panel must stop
    // asserting the stale verdict and defer to the server (which validates on
    // Confirm) — WITHOUT computing legality client-side (it does not adjudicate).
    renderScene(pyramidScene());
    const legality = screen.getByTestId("fate-pyramid-legality");
    expect(legality).toHaveTextContent(/incomplete|illegal|rung/i); // initial: server verdict

    // Player fills the remaining rungs.
    fireEvent.change(screen.getByTestId("fate-skill-Notice"), { target: { value: "2" } });

    // The stale "rung … has 0" red is gone; a neutral defer-to-Confirm prompt shows.
    expect(legality).not.toHaveTextContent(/has 0/i);
    expect(legality).toHaveTextContent(/Confirm to validate/i);
    expect(legality.className).not.toMatch(/text-destructive/);
  });

  it("confirm sends the current allocation as fate_pyramid_confirm", () => {
    const onRespond = renderScene(
      pyramidScene({
        fate_current_allocation: { Investigate: 4, Shoot: 3, Contacts: 3 },
        fate_legal: true,
        fate_violations: [],
      }),
    );
    fireEvent.click(screen.getByTestId("fate-pyramid-confirm"));
    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "fate_pyramid_confirm",
        fate_allocation: { Investigate: 4, Shoot: 3, Contacts: 3 },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// fate_stunts
// ---------------------------------------------------------------------------

describe("CharacterCreation: Fate stunts (121-8)", () => {
  it("renders the stunt catalog with names and the refresh readout", () => {
    renderScene(stuntsScene());
    expect(screen.getByText("Gun Nut")).toBeInTheDocument();
    expect(screen.getByText("Quick on the Draw")).toBeInTheDocument();
    expect(screen.getByTestId("fate-refresh")).toHaveTextContent("3");
  });

  it("confirm sends the selected stunt names as fate_stunts_confirm", () => {
    const onRespond = renderScene(stuntsScene());
    fireEvent.click(screen.getByTestId("fate-stunt-0")); // select "Gun Nut"
    fireEvent.click(screen.getByTestId("fate-stunts-confirm"));
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "fate_stunts_confirm",
        fate_selected_stunts: ["Gun Nut"],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Structural ruleset gate / paired negative — surfaces never co-render
// ---------------------------------------------------------------------------

describe("CharacterCreation: structural ruleset gate (121-8)", () => {
  it("a fate scene renders the fate surface and NOT the d20 bones surface", () => {
    renderScene(aspectsScene());
    expect(screen.getByTestId("fate-aspects-confirm")).toBeInTheDocument();
    expect(screen.queryByTestId("bones-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bones-budget")).not.toBeInTheDocument();
  });

  it("a d20 bones scene never co-renders a fate surface", () => {
    renderScene({
      phase: "scene",
      input_type: "roll_the_bones",
      prompt: "The bones lie where they fall.",
      rolled_stats: [{ name: "STR", value: 9 }],
      reroll_budget_remaining: 2,
    });
    expect(screen.queryByTestId("fate-aspects-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fate-pyramid-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fate-stunts-confirm")).not.toBeInTheDocument();
  });
});
