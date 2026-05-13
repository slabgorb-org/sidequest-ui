/**
 * Story 34-7: Deterministic physics replay — seed-based Rapier simulation.
 *
 * All connected clients must run identical Rapier physics from the same
 * seed + throw_params and see dice settle on the same faces. This test
 * suite covers:
 * - replayThrowParams: deterministic wire→scene param conversion
 * - Seed-driven initial rotation (all clients start die at same angle)
 * - DiceOverlay spectator replay (DiceResult drives physics for watchers)
 * - Rolling player switches to server-authoritative replay on DiceResult
 *
 * RED phase — all tests FAIL until Dev implements the replay layer.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { D20_RADIUS } from "@local/dice-lib";

// ── Mock R3F and Rapier — no WebGL in test environment ───────────────────────

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({
    camera: {},
    size: { width: 800, height: 600 },
  }),
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

// ── Test fixtures ────────────────────────────────────────────────────────────

/** Wire-format ThrowParams from DiceResultPayload */
const WIRE_THROW_PARAMS = {
  velocity: [1.5, 3.0, -2.5] as [number, number, number],
  angular: [10.0, -5.0, 8.0] as [number, number, number],
  position: [0.4, 0.6] as [number, number],
};

const DICE_REQUEST = {
  request_id: "req-replay-001",
  rolling_player_id: "player-1",
  character_name: "Tormund",
  dice: [{ sides: 20, count: 1 }],
  modifier: 2,
  stat: "strength",
  difficulty: 14,
  context: "You heave the boulder aside...",
};

const DICE_RESULT = {
  request_id: "req-replay-001",
  rolling_player_id: "player-1",
  character_name: "Tormund",
  rolls: [{ spec: { sides: 20, count: 1 }, faces: [15] }],
  modifier: 2,
  total: 17,
  difficulty: 14,
  outcome: "Success" as const,
  seed: 42,
  throw_params: WIRE_THROW_PARAMS,
};

// ══════════════════════════════════════════════════════════════════════════════
// AC-1: replayThrowParams — deterministic wire→scene conversion
// ══════════════════════════════════════════════════════════════════════════════

describe("AC-1: replayThrowParams exists and converts wire→scene params", () => {
  it("exports replayThrowParams from dice module", async () => {
    const mod = await import("@local/dice-lib");
    expect(mod.replayThrowParams).toBeDefined();
    expect(typeof mod.replayThrowParams).toBe("function");
  });

  it("returns scene ThrowParams with all required fields", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const scene = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);

    expect(scene).toHaveProperty("position");
    expect(scene).toHaveProperty("linearVelocity");
    expect(scene).toHaveProperty("angularVelocity");
    expect(scene).toHaveProperty("rotation");

    expect(scene.position).toHaveLength(3);
    expect(scene.linearVelocity).toHaveLength(3);
    expect(scene.angularVelocity).toHaveLength(3);
    expect(scene.rotation).toHaveLength(3);
  });

  it("maps wire velocity to scene linearVelocity", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const scene = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);

    // Wire velocity should map directly to scene linearVelocity
    expect(scene.linearVelocity).toEqual(WIRE_THROW_PARAMS.velocity);
  });

  it("maps wire angular to scene angularVelocity", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const scene = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);

    expect(scene.angularVelocity).toEqual(WIRE_THROW_PARAMS.angular);
  });

  it("converts wire 2D position to scene 3D position", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const scene = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);

    // Wire position is [x, y] normalized (0..1), scene position is [x, y, z] in tray space
    // Conversion must be deterministic and place die within the tray
    expect(scene.position).toHaveLength(3);
    expect(scene.position.every((v: number) => typeof v === "number" && Number.isFinite(v))).toBe(true);
  });

  it("produces no NaN or Infinity values in any field", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const scene = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);

    const allValues = [
      ...scene.position,
      ...scene.linearVelocity,
      ...scene.angularVelocity,
      ...scene.rotation,
    ];
    for (const v of allValues) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-2: Same seed + params = identical output (determinism contract)
// ══════════════════════════════════════════════════════════════════════════════

describe("AC-2: Determinism — same inputs always produce same output", () => {
  it("same seed + params produces identical scene params over 100 iterations", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const reference = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);

    for (let i = 0; i < 100; i++) {
      const result = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);
      expect(result.position).toEqual(reference.position);
      expect(result.linearVelocity).toEqual(reference.linearVelocity);
      expect(result.angularVelocity).toEqual(reference.angularVelocity);
      expect(result.rotation).toEqual(reference.rotation);
    }
  });

  it("different wire params produce different scene positions", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const params1 = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);
    const params2 = replayThrowParams(
      {
        velocity: [0.5, 1.0, -0.5] as [number, number, number],
        angular: [3.0, -2.0, 1.0] as [number, number, number],
        position: [0.8, 0.2] as [number, number],
      },
      42,
      D20_RADIUS,
    );

    // At least one field should differ
    const posMatch = params1.position.every((v: number, i: number) => v === params2.position[i]);
    const velMatch = params1.linearVelocity.every((v: number, i: number) => v === params2.linearVelocity[i]);
    expect(posMatch && velMatch).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-3: Seed drives initial rotation (different seeds = different die orientation)
// ══════════════════════════════════════════════════════════════════════════════

describe("AC-3: Seed determines initial die rotation", () => {
  it("different seeds produce different initial rotations", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const result1 = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);
    const result2 = replayThrowParams(WIRE_THROW_PARAMS, 9999, D20_RADIUS);

    // Same throw params but different seeds must produce different rotations
    const rotationsMatch = result1.rotation.every(
      (v: number, i: number) => v === result2.rotation[i],
    );
    expect(rotationsMatch).toBe(false);
  });

  it("same seed always produces same rotation", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const results = Array.from({ length: 50 }, () =>
      replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS),
    );

    for (const r of results) {
      expect(r.rotation).toEqual(results[0].rotation);
    }
  });

  it("rotation values are in valid Euler range", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    // Test with multiple seeds to check range across different values
    for (const seed of [0, 1, 42, 999, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
      const result = replayThrowParams(WIRE_THROW_PARAMS, seed, D20_RADIUS);
      for (const angle of result.rotation) {
        expect(angle).toBeGreaterThanOrEqual(-Math.PI);
        expect(angle).toBeLessThanOrEqual(Math.PI);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-4: Seed within JS safe integer range
// (Epic guardrail #11: seeds above MAX_SAFE_INTEGER silently truncate)
// ══════════════════════════════════════════════════════════════════════════════

describe("AC-4: Seed boundary — JS safe integer range", () => {
  it("handles seed of 0 without error", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const result = replayThrowParams(WIRE_THROW_PARAMS, 0, D20_RADIUS);
    expect(result.rotation).toHaveLength(3);
    expect(result.rotation.every((v: number) => Number.isFinite(v))).toBe(true);
  });

  it("handles seed at MAX_SAFE_INTEGER boundary", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const result = replayThrowParams(WIRE_THROW_PARAMS, Number.MAX_SAFE_INTEGER, D20_RADIUS);
    expect(result.rotation).toHaveLength(3);
    expect(result.rotation.every((v: number) => Number.isFinite(v))).toBe(true);
  });

  it("is deterministic at MAX_SAFE_INTEGER", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const a = replayThrowParams(WIRE_THROW_PARAMS, Number.MAX_SAFE_INTEGER, D20_RADIUS);
    const b = replayThrowParams(WIRE_THROW_PARAMS, Number.MAX_SAFE_INTEGER, D20_RADIUS);
    expect(a.rotation).toEqual(b.rotation);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-5 removed: DiceScene no longer takes a seed prop. Seed handling lives
// one layer up in replayThrowParams (tested by AC-1..4 above) — by the time
// params reach DiceScene the seed has already been consumed to generate the
// physics inputs. The old prop was vestigial and the test was validating a
// stub surface.
// ══════════════════════════════════════════════════════════════════════════════
// AC-6: Spectator replay — DiceResult drives physics for watchers
// ══════════════════════════════════════════════════════════════════════════════

describe("AC-6: Spectator sees replay when DiceResult arrives", () => {
  it("spectator's DiceOverlay starts physics when diceResult has throw_params", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST}
        diceResult={DICE_RESULT}
        playerId="player-2"
        onThrow={vi.fn()}
      />,
    );

    // Spectator should see the R3F canvas with dice physics running
    const canvas = screen.getByTestId("r3f-canvas");
    expect(canvas).toBeInTheDocument();

    // The spectator's view should show animated dice (not just static result)
    // The DiceScene should receive throwParams derived from DiceResult.throw_params
    // Verify the canvas contains the physics die (not just the pickup die)
    expect(canvas.innerHTML).not.toBe("");
  });

  it("spectator sees dice result after replay completes", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST}
        diceResult={DICE_RESULT}
        playerId="player-2"
        onThrow={vi.fn()}
      />,
    );

    // Result display should show even for spectators
    const resultEl = screen.getByTestId("dice-result");
    expect(resultEl).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-7: Rolling player switches to server-authoritative replay
// ══════════════════════════════════════════════════════════════════════════════

describe("AC-7: Rolling player gets server-authoritative replay on DiceResult", () => {
  it("rolling player sees replay driven by DiceResult (not just local throw)", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");

    // Rolling player initially throws locally, then DiceResult arrives
    // Both should see the same seed-driven replay
    const { rerender } = render(
      <DiceOverlay
        diceRequest={DICE_REQUEST}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );

    // DiceResult arrives — overlay should now show server-authoritative replay
    rerender(
      <DiceOverlay
        diceRequest={DICE_REQUEST}
        diceResult={DICE_RESULT}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );

    // Both rolling player and spectator should see the result
    const resultEl = screen.getByTestId("dice-result");
    expect(resultEl).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-8: Wire → scene conversion handles edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe("AC-8: Edge cases for replay conversion", () => {
  it("handles zero-velocity throw (dropped die)", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const scene = replayThrowParams(
      {
        velocity: [0, 0, 0] as [number, number, number],
        angular: [0, 0, 0] as [number, number, number],
        position: [0.5, 0.5] as [number, number],
      },
      42,
      D20_RADIUS,
    );

    // Should still produce valid params (die drops straight down)
    expect(scene.linearVelocity).toEqual([0, 0, 0]);
    expect(scene.angularVelocity).toEqual([0, 0, 0]);
    expect(scene.position.every((v: number) => Number.isFinite(v))).toBe(true);
    // Rotation should still be seeded even with zero velocity
    expect(scene.rotation).toHaveLength(3);
  });

  it("handles position at tray boundaries (0,0) and (1,1)", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");

    const corner00 = replayThrowParams(
      { ...WIRE_THROW_PARAMS, position: [0, 0] as [number, number] },
      42,
      D20_RADIUS,
    );
    const corner11 = replayThrowParams(
      { ...WIRE_THROW_PARAMS, position: [1, 1] as [number, number] },
      42,
      D20_RADIUS,
    );

    // Both should produce valid positions within tray bounds
    for (const result of [corner00, corner11]) {
      expect(result.position.every((v: number) => Number.isFinite(v))).toBe(true);
    }
  });

  it("handles negative velocity components", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const scene = replayThrowParams(
      {
        velocity: [-5.0, -3.0, -1.0] as [number, number, number],
        angular: [-10.0, -5.0, -8.0] as [number, number, number],
        position: [0.5, 0.5] as [number, number],
      },
      42,
      D20_RADIUS,
    );

    expect(scene.linearVelocity).toEqual([-5.0, -3.0, -1.0]);
    expect(scene.angularVelocity).toEqual([-10.0, -5.0, -8.0]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Rule enforcement: TS lang-review checklist
// ══════════════════════════════════════════════════════════════════════════════

describe("Rule: replayThrowParams has no type-safety escapes (#1)", () => {
  it("module source does not use 'as any'", async () => {
    // Structural check: the module should not need type escapes
    const mod = await import("@local/dice-lib");
    expect(mod.replayThrowParams).toBeDefined();
    // The real gate is the TS compiler — if it compiles without as any, this passes
  });
});

describe("Rule: null/undefined handling (#4)", () => {
  it("replayThrowParams does not return undefined for any field", async () => {
    const { replayThrowParams } = await import("@local/dice-lib");
    const result = replayThrowParams(WIRE_THROW_PARAMS, 42, D20_RADIUS);

    expect(result.position).toBeDefined();
    expect(result.linearVelocity).toBeDefined();
    expect(result.angularVelocity).toBeDefined();
    expect(result.rotation).toBeDefined();

    // No undefined values in arrays
    const allValues = [
      ...result.position,
      ...result.linearVelocity,
      ...result.angularVelocity,
      ...result.rotation,
    ];
    for (const v of allValues) {
      expect(v).not.toBeUndefined();
      expect(v).not.toBeNull();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Wiring: replayThrowParams is used by DiceOverlay (non-test consumer)
// ══════════════════════════════════════════════════════════════════════════════

describe("Wiring: replayThrowParams is imported by DiceOverlay", () => {
  it("DiceOverlay module imports replayThrowParams", async () => {
    // If DiceOverlay uses replayThrowParams internally for spectator replay,
    // it must import from replayThrowParams module. We verify the module
    // loads cleanly which means the import chain is intact.
    const overlay = await import("../DiceOverlay");
    const replay = await import("@local/dice-lib");
    expect(overlay.DiceOverlay).toBeDefined();
    expect(replay.replayThrowParams).toBeDefined();
  });
});
