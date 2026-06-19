/**
 * Story 126-17 (ADR-148/149) — the Fate DEFEND tray on the conflict surface (RED).
 *
 * 126-8 shipped the server DEFEND barrier (FATE_DEFEND_REQUEST broadcast +
 * block-and-wait, no auto-roll). This builds the missing UI half: when a
 * FATE_DEFEND_REQUEST targeting the local PC arrives, the conflict surface mounts
 * a defend tray that (a) shows the committed attack READ FROM THE PAYLOAD (118-5
 * anti-drift — no hardcoded mechanical literals), (b) arms the 4dF thrower (REUSE
 * of FateDiceTray thrower mode) so settling emits a FATE_THROW(action='defend')
 * echoing the request_id with the settled faces, and (c) offers a Concede that
 * folds without rolling (126-14 — concede=true, no dice).
 *
 * FAIL today: FateConflictSurface has no `defendRequest` prop and never mounts a
 * defend tray, so the request is dropped and the exchange hangs. R3F / drei /
 * dice-lib are mocked exactly as FateConflictSurface.test.tsx mocks them (no WebGL
 * in jsdom); the dice-lib mock captures the props the thrower hands DiceScene so a
 * test can drive the dF gesture + settle by hand (the 126-7 harness).
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { FateStatePayload, FateDefendRequestPayload } from "@/types/payloads";

// R3F + drei + dice-lib mocks (the defend tray mounts a FateDiceTray).
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
// Capture the props the thrower-mode FateDiceTray hands DiceScene so the test can
// fire the dF throw gesture + settle (the physics-is-the-roll path, Story 126-7).
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
  replayThrowParams: () => ({
    position: [0, 0.86, 0],
    rotation: [0, 0, 0],
    linearVelocity: [0, 4, -1],
    angularVelocity: [0.5, 0.5, 0.5],
  }),
}));

import { FateConflictSurface } from "../FateConflictSurface";

// Scene-space ThrowParams as PhysicsDie reports them on settle.
const SCENE_PARAMS = {
  linearVelocity: [0, 4, -1],
  angularVelocity: [0.5, 0.5, 0.5],
  position: [0, 0.36, 0],
};

const ACTOR = "Sam Spadework";

// A parked DEFEND barrier is still inside an ACTIVE conflict (the round parked on
// the PC's defense) — the surface's existing ruleset+conflict gate must be open.
const inConflict: FateStatePayload = {
  characters: [
    {
      name: ACTOR,
      fate_points: 3,
      refresh: 3,
      skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
      aspects: [{ text: "Hard-boiled detective", kind: "high_concept", free_invokes: 0 }],
      stress: { physical: [{ value: 1, checked: false }], mental: [] },
      consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
    },
  ],
  scene_aspects: [],
  conflict: {
    active: true,
    participants: [
      { name: ACTOR, side: "player" },
      { name: "The Fat Man", side: "opponent" },
    ],
  },
};

const defendAtMe: FateDefendRequestPayload = {
  request_id: "d-7",
  defender: ACTOR,
  attacker: "The Fat Man",
  attack_skill: "Shoot",
  attack_total: 5,
  mental: false,
};

function renderSurface(defendRequest: FateDefendRequestPayload | null) {
  const onFateThrow = vi.fn();
  const onFateAction = vi.fn();
  const utils = render(
    <FateConflictSurface
      fateState={inConflict}
      fateRoll={null}
      ruleset="fate"
      actorName={ACTOR}
      defendRequest={defendRequest}
      onFateAction={onFateAction}
      onFateThrow={onFateThrow}
    />,
  );
  return { ...utils, onFateThrow, onFateAction };
}

describe("FateConflictSurface — DEFEND tray (Story 126-17)", () => {
  it("mounts a defend tray when a FATE_DEFEND_REQUEST targets the local PC", () => {
    renderSurface(defendAtMe);
    expect(screen.queryByTestId("fate-defend-tray")).toBeInTheDocument();
  });

  it("reads attacker / skill / total FROM THE PAYLOAD (118-5 anti-drift)", () => {
    renderSurface(defendAtMe);
    const tray = screen.getByTestId("fate-defend-tray");
    expect(tray).toHaveTextContent("The Fat Man");
    expect(tray).toHaveTextContent("Shoot");
    expect(tray).toHaveTextContent("5");
  });

  it("reflects a DIFFERENT request's values — proves payload-sourced, not a constant", () => {
    const social: FateDefendRequestPayload = {
      request_id: "d-9",
      defender: ACTOR,
      attacker: "Brigid O'Shaughnessy",
      attack_skill: "Rapport",
      attack_total: 7,
      mental: true,
    };
    renderSurface(social);
    const tray = screen.getByTestId("fate-defend-tray");
    expect(tray).toHaveTextContent("Brigid O'Shaughnessy");
    expect(tray).toHaveTextContent("Rapport");
    expect(tray).toHaveTextContent("7");
    // The other fixture's literals must NOT bleed through (anti-drift).
    expect(tray).not.toHaveTextContent("The Fat Man");
  });

  it("does NOT mount a defend tray for a request targeting a DIFFERENT defender (client filters by defender)", () => {
    renderSurface({ ...defendAtMe, request_id: "d-x", defender: "Some Other PC" });
    expect(screen.queryByTestId("fate-defend-tray")).not.toBeInTheDocument();
  });

  it("does NOT mount a defend tray when there is no pending request", () => {
    renderSurface(null);
    expect(screen.queryByTestId("fate-defend-tray")).not.toBeInTheDocument();
  });

  it("does not pre-emptively fire a throw before the player acts", () => {
    const { onFateThrow } = renderSurface(defendAtMe);
    expect(onFateThrow).not.toHaveBeenCalled();
  });

  it("settling the dice emits FATE_THROW(action='defend') echoing request_id with the settled faces, then dismisses", () => {
    const { onFateThrow } = renderSurface(defendAtMe);
    // The armed dF thrower hands DiceScene its callbacks; drive the gesture + settle.
    expect(sceneProps.current).not.toBeNull();
    expect(sceneProps.current!.kind).toBe("dF");
    expect(sceneProps.current!.count).toBe(4);
    act(() => {
      (sceneProps.current!.onThrow as (p: unknown) => void)(SCENE_PARAMS);
      (sceneProps.current!.onAllSettle as (f: number[]) => void)([1, 0, -1, 1]);
    });
    expect(onFateThrow).toHaveBeenCalledTimes(1);
    const [payload] = onFateThrow.mock.calls[0];
    expect(payload.action).toBe("defend");
    expect(payload.request_id).toBe("d-7");
    expect(payload.face).toEqual([1, 0, -1, 1]);
    // A thrown defense is physics-is-the-roll, not a concession.
    expect(payload.concede).toBeFalsy();
    // The request is consumed — the tray dismisses.
    expect(screen.queryByTestId("fate-defend-tray")).not.toBeInTheDocument();
  });

  it("Concede sends a defend throw with the concede signal and NO dice, then dismisses", () => {
    const { onFateThrow } = renderSurface(defendAtMe);
    fireEvent.click(screen.getByTestId("fate-defend-concede"));
    expect(onFateThrow).toHaveBeenCalledTimes(1);
    const [payload] = onFateThrow.mock.calls[0];
    expect(payload.action).toBe("defend");
    expect(payload.request_id).toBe("d-7");
    expect(payload.concede).toBe(true);
    // A concession folds without rolling — it carries NO faces.
    expect(payload.face).toBeUndefined();
    // Consumed — the tray dismisses.
    expect(screen.queryByTestId("fate-defend-tray")).not.toBeInTheDocument();
  });
});
