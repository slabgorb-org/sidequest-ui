/**
 * Story 82-2 / AC1 — narrator Verbosity + Vocabulary player controls
 * (component contract).
 *
 * ADR-049 lets players tune the narrator on two axes — verbosity (how much it
 * says) and vocabulary (how ornate the diction is). The prompt plumbing already
 * fires server-side, and `SessionEventPayload` already carries
 * `narrator_verbosity` / `narrator_vocabulary` on the CONNECT wire. What is
 * MISSING is the player control: there is no `VerbositySlider` / `VocabularySlider`
 * in the UI today, so the choice can never be made or transmitted.
 *
 * RED: `@/components/VerbositySlider` and `@/components/VocabularySlider` do not
 * exist yet — this whole suite fails to resolve its imports until Dev creates the
 * components.
 *
 * Test-design contract (chosen by TEA — see Design Deviations in session):
 *   - `@/components/VerbositySlider` exports `VerbositySlider`
 *       props: { value: NarratorVerbosity; onChange: (v: NarratorVerbosity) => void }
 *       container testid: `verbosity-slider`
 *       one option per value, testid `verbosity-option-{value}` (concise/standard/verbose)
 *       the option matching `value` is marked current (aria-checked / aria-pressed "true")
 *       activating a non-current option fires onChange(thatValue)
 *   - `@/components/VocabularySlider` exports `VocabularySlider`
 *       props: { value: NarratorVocabulary; onChange: (v: NarratorVocabulary) => void }
 *       container testid: `vocabulary-slider`
 *       one option per value, testid `vocabulary-option-{value}` (accessible/literary/epic)
 *
 * Scope: this suite proves the controls EXIST and EMIT the player's choice (the
 * "controls exist and transmit" half of AC1). The choice's onward journey —
 * CONNECT payload -> server TurnContext -> rendered prompt section — is proven by
 * the server-side wiring test `tests/server/test_verbosity_vocabulary_turn_context_wiring.py`.
 * The App-level plumbing that folds these values into the outbound CONNECT payload
 * is a Dev integration step (see TEA deviation re: the AC1/AC4 scope split).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerbositySlider } from "@/components/VerbositySlider";
import { VocabularySlider } from "@/components/VocabularySlider";
import type { NarratorVerbosity, NarratorVocabulary } from "@/types/protocol";

const VERBOSITY_VALUES: NarratorVerbosity[] = ["concise", "standard", "verbose"];
const VOCABULARY_VALUES: NarratorVocabulary[] = ["accessible", "literary", "epic"];

describe("VerbositySlider", () => {
  it("renders one option per verbosity value", () => {
    render(<VerbositySlider value="standard" onChange={vi.fn()} />);
    expect(screen.getByTestId("verbosity-slider")).toBeInTheDocument();
    for (const v of VERBOSITY_VALUES) {
      expect(screen.getByTestId(`verbosity-option-${v}`)).toBeInTheDocument();
    }
  });

  it("marks the current value as selected", () => {
    render(<VerbositySlider value="verbose" onChange={vi.fn()} />);
    const current = screen.getByTestId("verbosity-option-verbose");
    // Accept either the radio (aria-checked) or toggle (aria-pressed) idiom.
    const checked = current.getAttribute("aria-checked") ?? current.getAttribute("aria-pressed");
    expect(checked).toBe("true");
  });

  it("fires onChange with the chosen value when a different option is activated", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<VerbositySlider value="standard" onChange={onChange} />);

    await user.click(screen.getByTestId("verbosity-option-concise"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("concise");
  });
});

describe("VocabularySlider", () => {
  it("renders one option per vocabulary value", () => {
    render(<VocabularySlider value="literary" onChange={vi.fn()} />);
    expect(screen.getByTestId("vocabulary-slider")).toBeInTheDocument();
    for (const v of VOCABULARY_VALUES) {
      expect(screen.getByTestId(`vocabulary-option-${v}`)).toBeInTheDocument();
    }
  });

  it("marks the current value as selected", () => {
    render(<VocabularySlider value="accessible" onChange={vi.fn()} />);
    const current = screen.getByTestId("vocabulary-option-accessible");
    const checked = current.getAttribute("aria-checked") ?? current.getAttribute("aria-pressed");
    expect(checked).toBe("true");
  });

  it("fires onChange with the chosen value when a different option is activated", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<VocabularySlider value="literary" onChange={onChange} />);

    await user.click(screen.getByTestId("vocabulary-option-epic"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("epic");
  });
});
