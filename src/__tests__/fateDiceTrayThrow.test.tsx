/**
 * Story 126-7 (ADR-148): FateDiceTray THROWER mode.
 *
 * A proactive Fate roll verb mounts the tray in thrower mode: the player
 * physically throws 4 dF in DiceScene, and on settle the tray submits the four
 * captured faces as a FATE_THROW payload (physics-is-the-roll — the settled
 * faces ARE the roll, mirroring the d20 DiceOverlay.handleSettle path). Spectator
 * mode (the 125-4 replay-and-snap) is untouched.
 *
 * FAIL today: FateDiceTray has no thrower mode / `onThrow` submit prop — it
 * destructures `roll` unconditionally and replays it. R3F + dice-lib are mocked
 * exactly as the existing FateDiceTray.test.tsx mocks them (no WebGL in jsdom);
 * the dice-lib mock captures the props the tray hands DiceScene so the test can
 * drive the throw gesture and the settle deterministically.
 */
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// R3F mock — no WebGL in jsdom.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
}));

// Capture the props FateDiceTray hands DiceScene so the test can fire the
// scene's throw/settle callbacks (the dF physics-is-the-roll path) by hand.
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
  replayThrowParams: (
    wire: { velocity: number[]; angular: number[]; position: number[] },
    seed: number,
    radius: number,
  ) => ({
    position: [wire.position[0] - 0.5, radius + 0.5, wire.position[1] * 1.6 - 0.8],
    rotation: [seed, seed, seed],
    linearVelocity: [...wire.velocity],
    angularVelocity: [...wire.angular],
  }),
}));

import { FateDiceTray } from "../dice/FateDiceTray";

// A scene-space ThrowParams as PhysicsDie reports it on settle (DiceOverlay
// converts these same three fields to the wire gesture).
const SCENE_PARAMS = {
  linearVelocity: [0, 4, -1],
  angularVelocity: [0.5, 0.5, 0.5],
  position: [0, 0.36, 0],
};

describe("FateDiceTray thrower mode", () => {
  it("submits the 4 settled dF faces via onThrow", () => {
    const onThrow = vi.fn();
    render(
      <FateDiceTray
        mode="thrower"
        action="overcome"
        skill="Athletics"
        requestId="r1"
        target="Goblin"
        onThrow={onThrow}
        ruleset="fate"
        genreSlug="pulp_noir"
      />,
    );

    expect(sceneProps.current).not.toBeNull();
    // Thrower mode hands DiceScene the dF kind and an interactive (non-replay) tray.
    expect(sceneProps.current!.kind).toBe("dF");
    expect(sceneProps.current!.count).toBe(4);

    // Drive the throw gesture, then the settle on 4 dF faces. Fire params on BOTH
    // callbacks so the assertion does not depend on whether the tray captures the
    // gesture from onThrow (pendingLocalParams) or from onAllSettle's 2nd arg.
    act(() => {
      (sceneProps.current!.onThrow as (p: unknown) => void)?.(SCENE_PARAMS);
      (sceneProps.current!.onAllSettle as (f: number[], p?: unknown) => void)(
        [1, 0, -1, 1],
        SCENE_PARAMS,
      );
    });

    expect(onThrow).toHaveBeenCalledTimes(1);
    const [payload] = onThrow.mock.calls[0];
    expect(payload.face).toEqual([1, 0, -1, 1]);
    expect(payload.action).toBe("overcome");
    expect(payload.request_id).toBe("r1");
    // The gesture rides along so spectators can replay the same tumble.
    expect(payload.throw_params).toBeTruthy();
  });
});
