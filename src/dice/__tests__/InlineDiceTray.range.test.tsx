/**
 * RED (Story 165-4, plan Task 10): range/cells readout on the resolution card.
 *
 * When 165-3's WN reach/range enforcement resolves a strike it now knows the
 * weapon's range band and the measured distance in cells. Task 9 echoes those
 * onto DiceResultPayload; this surfaces them on the InlineDiceTray result block
 * so a mechanics-first player (Sebastien/Jade) reads "· rifle range · 4 cells"
 * right next to the roll — the math, in the player UI.
 *
 * The annotation is guarded on presence: a check with no range echo (the common
 * case — social rolls, saves) must render the result block unchanged.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// R3F + drei mocks — no WebGL in jsdom (mirrors InlineDiceTray.test.tsx).
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
  useLoader: () => {
    const tex = { wrapS: 0, wrapT: 0, clone() { return { ...this, clone: this.clone }; } };
    return tex;
  },
}));
vi.mock("@react-three/rapier", () => ({
  Physics: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RigidBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CuboidCollider: () => null,
  ConvexHullCollider: () => null,
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@local/dice-lib", () => ({
  DiceScene: () => null,
  D20_RADIUS: 0.36,
  DEFAULT_DICE_THEME: { dieColor: "#e8e0d0", labelColor: "#1a1a1a" },
  replayThrowParams: () => ({
    position: [0, 0, 0],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    rotation: [0, 0, 0],
  }),
}));

import { InlineDiceTray } from "../InlineDiceTray";
import type { DiceResultPayload } from "@/types/payloads";

const RESULT: DiceResultPayload = {
  request_id: "req-1",
  rolling_player_id: "p1",
  character_name: "Rux",
  rolls: [
    {
      spec: { sides: "d20", count: 1 } as unknown as DiceResultPayload["rolls"][number]["spec"],
      faces: [14],
    },
  ],
  modifier: 2,
  total: 16,
  difficulty: 12,
  outcome: "Success",
  seed: 42,
  throw_params: { velocity: [0, 0, 0], angular: [0, 0, 0], position: [0.5, 0.5] },
};

describe("InlineDiceTray — range/cells readout (165-4)", () => {
  it("appends the range band + distance when the result carries the echo", () => {
    const ranged: DiceResultPayload = { ...RESULT, range_band: "rifle", distance_cells: 4 };
    render(
      <InlineDiceTray
        diceRequest={null}
        diceResult={ranged}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="space_opera"
      />,
    );
    const range = screen.getByTestId("dice-result-range");
    expect(range).toHaveTextContent(/rifle/i);
    expect(range).toHaveTextContent("4");
  });

  it("omits the range readout for a plain check with no range echo", () => {
    render(
      <InlineDiceTray
        diceRequest={null}
        diceResult={RESULT}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="space_opera"
      />,
    );
    // The core result block still renders...
    expect(screen.getByTestId("dice-result")).toBeInTheDocument();
    // ...but the additive range annotation must be absent (guarded on presence).
    expect(screen.queryByTestId("dice-result-range")).not.toBeInTheDocument();
  });

  // 165-4 REWORK — Reviewer [TEST] partial-echo gap: the two fields are
  // INDEPENDENT optionals. The server can echo one without the other (e.g. a
  // grid-less strike resolves range_band but has no measured distance). The
  // readout must render whichever is present without inventing the other.
  it("renders the band alone when distance_cells is absent (partial echo)", () => {
    const bandOnly: DiceResultPayload = { ...RESULT, range_band: "pistol" };
    render(
      <InlineDiceTray
        diceRequest={null}
        diceResult={bandOnly}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="space_opera"
      />,
    );
    const range = screen.getByTestId("dice-result-range");
    expect(range).toHaveTextContent(/pistol/i);
    // No distance was measured — the readout must not fabricate a "cells" figure.
    expect(range).not.toHaveTextContent(/cells/i);
  });

  it("renders the distance alone when range_band is absent (partial echo)", () => {
    const distanceOnly: DiceResultPayload = { ...RESULT, distance_cells: 3 };
    render(
      <InlineDiceTray
        diceRequest={null}
        diceResult={distanceOnly}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="space_opera"
      />,
    );
    const range = screen.getByTestId("dice-result-range");
    expect(range).toHaveTextContent("3");
    expect(range).toHaveTextContent(/cells/i);
    // No band resolved — the readout must not invent a "range" label.
    expect(range).not.toHaveTextContent(/range/i);
  });
});
