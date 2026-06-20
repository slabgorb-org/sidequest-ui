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
import { act, fireEvent, render, screen } from "@testing-library/react";
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
// Capture the props the thrower-mode FateDiceTray hands DiceScene so a test can
// drive the dF throw gesture + settle (ADR-148 / Story 126-7). The most-recently
// mounted DiceScene wins — in thrower mode that is the interactive tray.
const { sceneProps } = vi.hoisted(() => ({
  sceneProps: { current: null as null | Record<string, unknown> },
}));
vi.mock("@local/dice-lib", () => ({
  DiceScene: (props: Record<string, unknown>) => {
    sceneProps.current = props;
    return <div data-testid="dice-scene" />;
  },
  D6_RADIUS: 0.36,
  DEFAULT_DICE_THEME: { dieColor: "#4a1a3a", labelColor: "#d4af37" },
  // FateDiceTray replays the roll via dice-lib's converter (Story 125-4).
  replayThrowParams: () => ({
    position: [0, 0.86, 0],
    rotation: [0, 0, 0],
    linearVelocity: [0, 4, -1],
    angularVelocity: [0.5, 0.5, 0.5],
  }),
}));

// Scene-space ThrowParams as PhysicsDie reports them on settle.
const SCENE_PARAMS = {
  linearVelocity: [0, 4, -1],
  angularVelocity: [0.5, 0.5, 0.5],
  position: [0, 0.36, 0],
};

/** Drive the armed dF thrower to settle on `faces`, returning what FATE_THROW the
 *  surface emitted (the gesture + settle are the physics-is-the-roll path). */
function throwDice(faces: number[]) {
  act(() => {
    (sceneProps.current!.onThrow as (p: unknown) => void)(SCENE_PARAMS);
    (sceneProps.current!.onAllSettle as (f: number[]) => void)(faces);
  });
}

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
  throw_params: { velocity: [1, 2, -0.5], angular: [0.5, 0.5, 0.5], position: [0.5, 0.5] },
  seed: 4242,
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
  const onFateThrow = vi.fn();
  const utils = render(
    <FateConflictSurface
      fateState={fateState()}
      fateRoll={ROLL}
      ruleset="fate"
      actorName="Sam Spadework"
      onFateAction={onFateAction}
      onFateThrow={onFateThrow}
      {...props}
    />,
  );
  return { ...utils, onFateAction, onFateThrow };
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

describe("FateConflictSurface — a roll verb mounts the dF thrower (ADR-148 / Story 126-7)", () => {
  // The proactive roll verbs are physics-is-the-roll: clicking one ARMS the dF
  // thrower and DEFERS the send until the dice settle, then emits FATE_THROW with
  // the four settled faces (NOT a synchronous FATE_ACTION). The non-roll verbs
  // (concede / compel_*) stay on FATE_ACTION (asserted in the .compel suite).
  it("arms the thrower instead of dispatching FATE_ACTION synchronously", () => {
    const { onFateAction } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-action-overcome"));
    expect(screen.getByTestId("fate-throw-armed")).toBeInTheDocument();
    // No synchronous FATE_ACTION — the roll is sent only after the throw settles.
    expect(onFateAction).not.toHaveBeenCalled();
  });

  it("submits FATE_THROW with the settled faces when the dice land", () => {
    const { onFateThrow } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-action-overcome"));
    throwDice([1, 0, -1, 1]);
    expect(onFateThrow).toHaveBeenCalledTimes(1);
    expect(onFateThrow).toHaveBeenCalledWith(
      expect.objectContaining({ action: "overcome", face: [1, 0, -1, 1] }),
    );
    expect(onFateThrow.mock.calls[0][0].throw_params).toBeTruthy();
  });

  it("carries the typed flourish as player_action through the throw", () => {
    const { onFateThrow } = renderSurface();
    fireEvent.change(screen.getByTestId("fate-freeform-input"), {
      target: { value: "I swing from the chandelier and fire" },
    });
    fireEvent.click(screen.getByTestId("fate-action-attack"));
    throwDice([1, 1, 0, -1]);
    expect(onFateThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "attack",
        player_action: "I swing from the chandelier and fire",
      }),
    );
  });

  it("submits no rider when nothing is typed", () => {
    const { onFateThrow } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-action-overcome"));
    throwDice([0, 0, 0, 0]);
    const call = onFateThrow.mock.calls[0]?.[0];
    expect(call).toMatchObject({ action: "overcome" });
    expect(call?.player_action ?? "").toBe("");
  });
});

describe("FateConflictSurface — the attack names an opponent (rework: Reviewer HIGH #1)", () => {
  // The server's _resolve_attack HARD-raises "an attack must name a target" when
  // commit.target is None (fate_conflict.py, No Silent Fallbacks). An Attack throw
  // that carries no target therefore ALWAYS errors at exchange time. The attack
  // MUST carry an opponent-side participant as its target (now on the FATE_THROW).
  it("submits an opponent-side participant as the target when Attack is thrown", () => {
    const { onFateThrow } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-action-attack"));
    throwDice([1, 1, 0, -1]);
    expect(onFateThrow).toHaveBeenCalledWith(
      expect.objectContaining({ action: "attack", target: "The Fat Man" }),
    );
  });

  it("never targets a player-side participant (the target is the Other, not the self)", () => {
    const { onFateThrow } = renderSurface();
    fireEvent.click(screen.getByTestId("fate-action-attack"));
    throwDice([1, 1, 0, -1]);
    const call = onFateThrow.mock.calls[0]?.[0];
    expect(call?.target).toBe("The Fat Man");
    expect(call?.target).not.toBe("Sam Spadework");
  });

  it("still carries the freeform rider alongside the target", () => {
    const { onFateThrow } = renderSurface();
    fireEvent.change(screen.getByTestId("fate-freeform-input"), {
      target: { value: "I swing from the chandelier and fire" },
    });
    fireEvent.click(screen.getByTestId("fate-action-attack"));
    throwDice([1, 1, 0, -1]);
    expect(onFateThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "attack",
        target: "The Fat Man",
        player_action: "I swing from the chandelier and fire",
      }),
    );
  });
});

describe("FateConflictSurface — mechanics-first legibility (sq-playtest 2026-06-19)", () => {
  // The surface shipped with bare unstyled controls, no Fate-point counter, no
  // win/progress feedback, and Attack visually identical to the give-up Concede.
  // These cover the UI-tier legibility fixes (the win/opponent-track meter needs a
  // server projection and is a separate follow-up).

  it("shows the live Fate-point count so the Invoke economy is legible", () => {
    renderSurface({ fateState: fateState({ heroFatePoints: 3 }) });
    expect(screen.getByTestId("fate-conflict-fate-points")).toHaveTextContent("3");
  });

  it("renders the local PC's stress track (own absorption mid-exchange)", () => {
    renderSurface();
    // The fixture seeds one physical stress box (value 1); the empty mental track is omitted.
    const boxes = screen.getAllByTestId("fate-conflict-stress-box");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAttribute("data-checked", "false");
    expect(boxes[0]).toHaveTextContent("1");
  });

  it("renders the local PC's consequence slots", () => {
    renderSurface();
    const cons = screen.getAllByTestId("fate-conflict-consequence");
    expect(cons).toHaveLength(1);
    expect(cons[0]).toHaveAttribute("data-filled", "false");
    expect(cons[0]).toHaveTextContent(/mild/i);
  });

  it("weights Attack as the primary action and Concede as quiet (never identical)", () => {
    renderSurface();
    // Attack carries the primary fill; Concede must NOT, so the give-up control can
    // never be mistaken for the primary action (the reported affordance bug).
    expect(screen.getByTestId("fate-action-attack").className).toContain("bg-primary");
    expect(screen.getByTestId("fate-action-concede").className).not.toContain("bg-primary");
  });
});

describe("FateConflictSurface — Contest action gating (spec 2026-06-17 §2, sq-playtest 150-6)", () => {
  // A Contest (is_contest) has no stress/consequences; the server rejects an Attack
  // in one loudly (fate_dispatch_error). The surface must NOT offer Attack — offering
  // it wastes the player's 4dF throw and surfaces only a red error toast.
  function contestState(): FateStatePayload {
    const s = fateState();
    return { ...s, conflict: { ...s.conflict!, is_contest: true } };
  }

  it("hides Attack in a Contest, keeping Overcome + Create Advantage + Concede", () => {
    renderSurface({ fateState: contestState() });
    expect(screen.queryByTestId("fate-action-attack")).not.toBeInTheDocument();
    expect(screen.getByTestId("fate-action-overcome")).toBeInTheDocument();
    expect(screen.getByTestId("fate-action-create_advantage")).toBeInTheDocument();
    expect(screen.getByTestId("fate-action-concede")).toBeInTheDocument();
  });

  it("still offers Attack in a Conflict (is_contest absent/false)", () => {
    renderSurface(); // the default fixture is a Conflict
    expect(screen.getByTestId("fate-action-attack")).toBeInTheDocument();
  });
});
