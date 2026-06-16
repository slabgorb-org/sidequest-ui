/**
 * Story 118-5 (ADR-144 F3e) — the compel accept/refuse control (RED).
 *
 * The player surface for the compel round-trip. When the server surfaces a
 * pending compel on the active conflict (FATE_STATE.conflict.pending_compels),
 * the FateConflictSurface offers an Accept and a Refuse control per compel:
 *   - Accept -> onFateAction({ action: "compel_accept", aspect_text })  (+1 FP)
 *   - Refuse -> onFateAction({ action: "compel_refuse", aspect_text })  (-1 FP)
 * The ±1 fate-point delta is shown inline (the mechanics-first legibility
 * mandate — Sebastien/Jade read the math in the PLAYER UI, ADR-144 epic 118).
 *
 * The control inherits the surface's ruleset=='fate' + active-conflict gate, so
 * it can never co-render with the WN/native ConfrontationOverlay (the epic's
 * required paired negative). No pending compel -> no control.
 *
 * FAIL today: FateConflictSurface renders no compel control, FateActionVerb has
 * no compel members, and FateConflictEntry has no pending_compels field.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  FateConflictEntry,
  FateRollPayload,
  FateStatePayload,
} from "@/types/payloads";
import { FateConflictSurface } from "../FateConflictSurface";

// `pending_compels` is the field this story adds to FateConflictEntry. Typed as an
// intersection so the fixture is honest in RED (the base type lacks it) and stays
// correct once Dev lands the field in GREEN — no `as any`. `offered_delta` is the
// server-sent SRD accept reward (+1) the Accept control renders.
type PendingCompel = { aspect: string; target: string; reason: string; offered_delta: number };
type ConflictWithCompels = FateConflictEntry & { pending_compels: PendingCompel[] };

const NO_ROLL: FateRollPayload | null = null;

function fateState(compels: PendingCompel[]): FateStatePayload {
  const conflict: ConflictWithCompels = {
    active: true,
    participants: [
      { name: "Sam Spadework", side: "player" },
      { name: "The Fat Man", side: "opponent" },
    ],
    pending_compels: compels,
  };
  return {
    characters: [
      {
        name: "Sam Spadework",
        fate_points: 2,
        refresh: 3,
        skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
        aspects: [{ text: "Cornered Rat", kind: "trouble", free_invokes: 0 }],
        stress: { physical: [{ value: 1, checked: false }], mental: [] },
        consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
      },
    ],
    scene_aspects: [],
    conflict,
  };
}

const COMPEL: PendingCompel = {
  aspect: "Cornered Rat",
  target: "Sam Spadework",
  reason: "The exits are blocked — panic costs you the initiative",
  offered_delta: 1,
};

function renderSurface(
  props: Partial<React.ComponentProps<typeof FateConflictSurface>> = {},
) {
  const onFateAction = vi.fn();
  const utils = render(
    <FateConflictSurface
      fateState={fateState([COMPEL])}
      fateRoll={NO_ROLL}
      ruleset="fate"
      actorName="Sam Spadework"
      onFateAction={onFateAction}
      {...props}
    />,
  );
  return { ...utils, onFateAction };
}

describe("FateConflictSurface — the compel accept/refuse control", () => {
  it("renders an Accept and a Refuse control when a compel is pending", () => {
    renderSurface();
    expect(screen.getByTestId("fate-compel-accept-Cornered Rat")).toBeInTheDocument();
    expect(screen.getByTestId("fate-compel-refuse-Cornered Rat")).toBeInTheDocument();
  });

  it("shows the offered complication so the player knows what they're agreeing to", () => {
    renderSurface();
    expect(screen.getByText(/the exits are blocked/i)).toBeInTheDocument();
  });

  it("Accept dispatches compel_accept naming the compelled aspect", () => {
    const { onFateAction } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-compel-accept-Cornered Rat"));
    expect(onFateAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "compel_accept", aspect_text: "Cornered Rat" }),
    );
  });

  it("Refuse dispatches compel_refuse naming the compelled aspect", () => {
    const { onFateAction } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-compel-refuse-Cornered Rat"));
    expect(onFateAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "compel_refuse", aspect_text: "Cornered Rat" }),
    );
  });

  it("shows the +1 / -1 fate-point delta inline (mechanics-first legibility)", () => {
    renderSurface();
    // Accept earns a point, refuse pays one — the math is on the controls, not hidden.
    expect(screen.getByTestId("fate-compel-accept-Cornered Rat")).toHaveTextContent(/\+1/);
    expect(screen.getByTestId("fate-compel-refuse-Cornered Rat")).toHaveTextContent(/[-−]1/);
  });

  it("renders one Accept/Refuse pair per pending compel (keyed by aspect, not index)", () => {
    const second: PendingCompel = {
      aspect: "Last Honest Cop",
      target: "Sam Spadework",
      reason: "Internal Affairs wants your badge",
      offered_delta: 1,
    };
    renderSurface({ fateState: fateState([COMPEL, second]) });
    expect(screen.getAllByTestId(/^fate-compel-accept-/)).toHaveLength(2);
    expect(screen.getAllByTestId(/^fate-compel-refuse-/)).toHaveLength(2);
    expect(screen.getByTestId("fate-compel-accept-Last Honest Cop")).toBeInTheDocument();
  });

  it("renders NO compel control when there are no pending compels", () => {
    renderSurface({ fateState: fateState([]) });
    expect(screen.queryAllByTestId(/^fate-compel-accept-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^fate-compel-refuse-/)).toHaveLength(0);
  });

  it("renders no compel control on a non-Fate ruleset (never co-renders with the WN/native overlay)", () => {
    const { container } = renderSurface({ ruleset: "native" });
    // The whole surface is ruleset-gated; the compel control cannot leak onto a WN/native pack.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryAllByTestId(/^fate-compel-accept-/)).toHaveLength(0);
  });

  it("disables the compel controls while a sealed round is resolving (submit-and-wait barrier)", () => {
    renderSurface({ sealedWaiting: true });
    expect(screen.getByTestId("fate-compel-accept-Cornered Rat")).toBeDisabled();
    expect(screen.getByTestId("fate-compel-refuse-Cornered Rat")).toBeDisabled();
  });
});
