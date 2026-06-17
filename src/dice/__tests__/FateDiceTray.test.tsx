/**
 * RED tests for Story 118-3 (ADR-144 F3c) — the Fate 4dF dice surface.
 *
 * Option B (resolved by Keith 2026-06-15): a real 3D Fudge die, not a flat
 * readout. The tray renders FOUR `dF` dice and the legible result the player
 * reads regardless of the 3D flourish (the legibility mandate, Sebastien/Jade):
 * the four Fudge faces, the shift total, the ladder rating, the outcome tier,
 * and a succeed-with-style highlight.
 *
 * The surface is fate-ruleset-gated: it must NEVER co-render with the WN/native
 * ConfrontationOverlay, so a non-fate ruleset renders nothing at all.
 *
 * FAIL today: `../FateDiceTray` does not exist. R3F/drei/dice-lib are mocked
 * exactly as InlineDiceTray.test.tsx mocks them (no WebGL in jsdom); the
 * dice-lib mock captures the props FateDiceTray hands DiceScene.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// R3F + drei mocks — no WebGL in jsdom.
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

// Capture the props FateDiceTray passes DiceScene (kind / count) via a hoisted ref.
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
}));

import { FateDiceTray } from "../FateDiceTray";
import type { FateRollPayload } from "@/types/payloads";

// Story 125-4 (ADR-144 F3g follow-up): FATE_ROLL now carries the dice-animation
// replay fields throw_params + seed (mirroring DICE_RESULT) so FateDiceTray can
// animate the dice instead of rendering the idle pickup row (throwParams=null).
// Distinct gesture + seed per fixture so the re-throw assertion below is real.
const SUCCEED: FateRollPayload = {
  dice: [1, 1, 0, -1],
  roll_total: 1,
  ladder_total: 4,
  ladder_name: "Great",
  opposition: 2,
  shifts: 2,
  tier: "Succeed",
  succeeded_with_style: false,
  throw_params: { velocity: [1.5, 3, -0.5], angular: [2, -1, 0.5], position: [0.4, 0.6] },
  seed: 1001,
};

const STYLE: FateRollPayload = {
  dice: [1, 1, 1, 0],
  roll_total: 3,
  ladder_total: 6,
  ladder_name: "Fantastic",
  opposition: 3,
  shifts: 3,
  tier: "SucceedWithStyle",
  succeeded_with_style: true,
  throw_params: { velocity: [-2, 1, 3], angular: [-1, 2, -0.5], position: [0.7, 0.3] },
  seed: 2002,
};

describe("FateDiceTray", () => {
  // -- AC-U1: four dF dice on the table -----------------------------------

  it("renders four dF dice (kind='dF', count=4) through DiceScene", () => {
    render(<FateDiceTray roll={SUCCEED} ruleset="fate" genreSlug="pulp_noir" />);
    expect(sceneProps.current).not.toBeNull();
    expect(sceneProps.current!.kind).toBe("dF");
    expect(sceneProps.current!.count).toBe(4);
  });

  // -- AC-U2: the legible readout (shift / ladder / tier) -------------------

  it("shows the shift total, ladder rating, and outcome tier", () => {
    render(<FateDiceTray roll={SUCCEED} ruleset="fate" genreSlug="pulp_noir" />);
    expect(screen.getByTestId("fate-roll-shift")).toHaveTextContent("2");
    expect(screen.getByTestId("fate-roll-ladder")).toHaveTextContent("Great");
    expect(screen.getByTestId("fate-roll-tier")).toHaveTextContent(/Succeed/i);
  });

  it("highlights succeed-with-style only when the roll earned it", () => {
    const { rerender } = render(
      <FateDiceTray roll={SUCCEED} ruleset="fate" genreSlug="pulp_noir" />,
    );
    expect(screen.queryByTestId("fate-roll-style")).toBeNull();

    rerender(<FateDiceTray roll={STYLE} ruleset="fate" genreSlug="pulp_noir" />);
    expect(screen.getByTestId("fate-roll-style")).toBeInTheDocument();
  });

  // -- AC-U3: the fate-ruleset gate (never co-render with the WN overlay) ---

  it("renders nothing when the ruleset is not fate (no co-render with the WN/native overlay)", () => {
    const { container } = render(
      <FateDiceTray roll={SUCCEED} ruleset="native" genreSlug="caverns_and_claudes" />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("dice-scene")).toBeNull();
  });

  // -- AC-U4 (Story 125-4): the dice animate the roll, not the idle row --------

  it("passes the roll's throw gesture to DiceScene instead of the idle (null) render", () => {
    // Was hardcoded `throwParams={null}` → the idle pickup row. With the roll now
    // carrying throw_params + seed, FateDiceTray must hand DiceScene a real gesture
    // so the dice tumble (the legibility mandate — show what was rolled).
    render(<FateDiceTray roll={SUCCEED} ruleset="fate" genreSlug="pulp_noir" />);
    expect(sceneProps.current).not.toBeNull();
    expect(sceneProps.current!.throwParams).not.toBeNull();
    expect(typeof sceneProps.current!.throwParams).toBe("object");
  });

  it("derives throwParams + rollKey from the payload — a new roll re-throws", () => {
    const { rerender } = render(
      <FateDiceTray roll={SUCCEED} ruleset="fate" genreSlug="pulp_noir" />,
    );
    const firstThrow = JSON.stringify(sceneProps.current!.throwParams);
    const firstKey = sceneProps.current!.rollKey;

    rerender(<FateDiceTray roll={STYLE} ruleset="fate" genreSlug="pulp_noir" />);
    const secondThrow = JSON.stringify(sceneProps.current!.throwParams);
    const secondKey = sceneProps.current!.rollKey;

    // A different roll (different throw_params + seed) must produce a different
    // gesture AND a new rollKey, so DiceScene re-mounts and re-throws. The pre-125-4
    // surface hardcoded `rollKey={0}`, which would pin both to a constant.
    expect(secondThrow).not.toBe(firstThrow);
    expect(secondKey).not.toBe(firstKey);
  });
});
