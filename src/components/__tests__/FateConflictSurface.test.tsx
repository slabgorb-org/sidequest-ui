/**
 * Story 118-6 (ADR-144 F3f) — the Fate conflict surface (RED).
 *
 * The Fate ANALOG of ConfrontationOverlay: during an active Fate Conflict it
 * shows the live exchange and hosts the player's controls. It reuses the mount
 * PATTERN of ConfrontationOverlay, NOT its dial/beat internals (Fate replaces
 * those, ADR-143), and is ruleset=='fate'-gated so it never co-renders with the
 * WN/native overlay. It composes the FatePanel sheet (118-2) and the FateDiceTray
 * (118-3, built but unmounted) and exposes the proactive-action tiles, the
 * Concede control, and the per-aspect Invoke affordance.
 *
 * The three story-named NEGATIVES live here:
 *   - non-Fate guard (renders nothing on a WN/native ruleset)
 *   - sealed-commit-barrier disable (controls dead while the round resolves)
 *   - invoke disabled at no-free-invoke + 0-fate (the economy is server-authoritative;
 *     the panel reflects FATE_STATE and must not offer an invoke the player can't pay for)
 *
 * Plus the freeform-text-rides-the-tile dispatch: typed flourish + clicked verb
 * → onFateAction carries FateActionPayload.player_action (the narrator-color rider).
 *
 * FAIL today: `../FateConflictSurface` does not exist. R3F / drei / dice-lib are
 * mocked exactly as FateDiceTray.test.tsx mocks them (no WebGL in jsdom).
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FateStatePayload, FateRollPayload } from "@/types/payloads";

// R3F + drei + dice-lib mocks (the FateDiceTray the surface mounts needs them).
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@local/dice-lib", () => ({
  DiceScene: () => <div data-testid="dice-scene" />,
  D6_RADIUS: 0.36,
  DEFAULT_DICE_THEME: { dieColor: "#4a1a3a", labelColor: "#d4af37" },
}));

import { FateConflictSurface } from "../FateConflictSurface";

const ROLL: FateRollPayload = {
  dice: [1, 1, 0, -1],
  roll_total: 1,
  ladder_total: 4,
  ladder_name: "Great",
  opposition: 2,
  shifts: 2,
  tier: "Succeed",
  succeeded_with_style: false,
};

/** A Fate state with an ACTIVE conflict. `heroFatePoints` / `heroFreeInvokes`
 *  tune the local PC's invoke economy for the disabled-affordance negative. */
function fateState(opts: {
  heroFatePoints?: number;
  heroFreeInvokes?: number;
} = {}): FateStatePayload {
  const { heroFatePoints = 3, heroFreeInvokes = 0 } = opts;
  return {
    characters: [
      {
        name: "Sam Spadework",
        fate_points: heroFatePoints,
        refresh: 3,
        skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
        aspects: [
          { text: "Cornered Rat", kind: "trouble", free_invokes: heroFreeInvokes },
        ],
        stress: { physical: [{ value: 1, checked: false }], mental: [] },
        consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
      },
    ],
    scene_aspects: [],
    conflict: {
      active: true,
      participants: [
        { name: "Sam Spadework", side: "player" },
        { name: "The Fat Man", side: "opponent" },
      ],
    },
  };
}

function renderSurface(props: Partial<React.ComponentProps<typeof FateConflictSurface>> = {}) {
  const onFateAction = vi.fn();
  const utils = render(
    <FateConflictSurface
      fateState={fateState()}
      fateRoll={ROLL}
      ruleset="fate"
      actorName="Sam Spadework"
      onFateAction={onFateAction}
      {...props}
    />,
  );
  return { ...utils, onFateAction };
}

describe("FateConflictSurface — the live exchange", () => {
  it("renders the conflict participants by side, in seating (turn) order", () => {
    renderSurface();
    const sam = screen.getByTestId("fate-conflict-participant-Sam Spadework");
    const fatMan = screen.getByTestId("fate-conflict-participant-The Fat Man");
    expect(sam).toBeInTheDocument();
    expect(fatMan).toBeInTheDocument();
    expect(sam).toHaveAttribute("data-side", "player");
    expect(fatMan).toHaveAttribute("data-side", "opponent");
    // Seating order is turn order: Sam precedes the Fat Man in the DOM.
    expect(sam.compareDocumentPosition(fatMan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("mounts the FateDiceTray with the latest 4dF roll", () => {
    renderSurface();
    // The tray's legible readout (its own AC) proves the roll reached the surface.
    expect(screen.getByTestId("fate-roll-tier")).toHaveTextContent(/Succeed/i);
  });

  it("offers the three proactive-action tiles and a Concede control", () => {
    renderSurface();
    expect(screen.getByTestId("fate-action-overcome")).toBeInTheDocument();
    expect(screen.getByTestId("fate-action-create_advantage")).toBeInTheDocument();
    expect(screen.getByTestId("fate-action-attack")).toBeInTheDocument();
    expect(screen.getByTestId("fate-action-concede")).toBeInTheDocument();
  });
});

describe("FateConflictSurface — the ruleset gate (never co-renders with ConfrontationOverlay)", () => {
  it("renders nothing on a non-Fate ruleset", () => {
    const { container } = renderSurface({ ruleset: "native" });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no active conflict", () => {
    const noConflict = { ...fateState(), conflict: null };
    const { container } = renderSurface({ fateState: noConflict });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FateConflictSurface — the invoke affordance economy (server-authoritative)", () => {
  it("DISABLES an aspect's Invoke when the actor has no free invoke AND zero fate points", () => {
    // The story's named negative: the panel reflects FATE_STATE and must never
    // offer an invoke the player cannot pay for (no optimistic affordance).
    renderSurface({ fateState: fateState({ heroFatePoints: 0, heroFreeInvokes: 0 }) });
    expect(screen.getByTestId("fate-invoke-Cornered Rat")).toBeDisabled();
  });

  it("ENABLES the Invoke when a free invocation is available (even at zero fate points)", () => {
    renderSurface({ fateState: fateState({ heroFatePoints: 0, heroFreeInvokes: 1 }) });
    expect(screen.getByTestId("fate-invoke-Cornered Rat")).toBeEnabled();
  });

  it("ENABLES the Invoke when the actor can pay a fate point", () => {
    renderSurface({ fateState: fateState({ heroFatePoints: 2, heroFreeInvokes: 0 }) });
    expect(screen.getByTestId("fate-invoke-Cornered Rat")).toBeEnabled();
  });
});

describe("FateConflictSurface — the sealed-commit barrier", () => {
  it("disables the proactive tiles and Concede while the round is resolving", () => {
    renderSurface({ sealedWaiting: true });
    expect(screen.getByTestId("fate-action-attack")).toBeDisabled();
    expect(screen.getByTestId("fate-action-create_advantage")).toBeDisabled();
    expect(screen.getByTestId("fate-action-concede")).toBeDisabled();
  });
});

describe("FateConflictSurface — freeform text rides the tile", () => {
  it("carries the typed flourish as player_action when a verb tile is clicked", () => {
    const { onFateAction } = renderSurface();
    const input = screen.getByTestId("fate-freeform-input");
    fireEvent.change(input, { target: { value: "I swing from the chandelier and fire" } });
    fireEvent.click(screen.getByTestId("fate-action-attack"));
    expect(onFateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "attack",
        player_action: "I swing from the chandelier and fire",
      }),
    );
  });

  it("dispatches a bare action (no rider) when nothing is typed", () => {
    const { onFateAction } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-action-overcome"));
    const call = onFateAction.mock.calls[0]?.[0];
    expect(call).toMatchObject({ action: "overcome" });
    expect(call?.player_action ?? "").toBe("");
  });
});

describe("FateConflictSurface — the attack names an opponent (rework: Reviewer HIGH #1)", () => {
  // The server's _resolve_attack HARD-raises "an attack must name a target" when
  // commit.target is None (fate_conflict.py:500, No Silent Fallbacks). An Attack tile
  // that dispatches no target therefore ALWAYS errors at exchange time — the core verb
  // of a *conflict* surface can never land. The attack MUST carry an opponent-side
  // participant as its target.
  it("dispatches an opponent-side participant as the target when Attack is clicked", () => {
    const { onFateAction } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-action-attack"));
    expect(onFateAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "attack", target: "The Fat Man" }),
    );
  });

  it("never targets a player-side participant (the target is the Other, not the self)", () => {
    // Guard: the chosen target must come from the opponent side, never the acting PC
    // or an ally. With Sam (player) vs The Fat Man (opponent), the only legal attack
    // target is The Fat Man.
    const { onFateAction } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-action-attack"));
    const call = onFateAction.mock.calls[0]?.[0];
    expect(call?.target).toBe("The Fat Man");
    expect(call?.target).not.toBe("Sam Spadework");
  });

  it("still carries the freeform rider alongside the target", () => {
    // The target fix must not drop the freeform-rides-the-tile behavior: an attack
    // carries BOTH the opponent target AND the player_action flourish.
    const { onFateAction } = renderSurface();
    fireEvent.change(screen.getByTestId("fate-freeform-input"), {
      target: { value: "I swing from the chandelier and fire" },
    });
    fireEvent.click(screen.getByTestId("fate-action-attack"));
    expect(onFateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "attack",
        target: "The Fat Man",
        player_action: "I swing from the chandelier and fire",
      }),
    );
  });
});
