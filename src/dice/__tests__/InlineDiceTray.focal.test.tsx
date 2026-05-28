/**
 * Story 69-1 (epic 69 — Gameboard & dice UX polish): pull the 3D dice
 * camera/scale in so a roll reads as a legible focal moment (ADR-075), and
 * audit that the inline tray is fed by *real server rolls* (ADR-074) — the
 * spectator die is reproduced from the server seed/throw_params, never a
 * client RNG, and the displayed total/faces are the server's verbatim.
 *
 * AC1 (camera/scale pull-in) is RED: the current frame is a ~180px box at
 * camera y=2.4 / fov=42. These tests demand a larger frame AND a tighter
 * camera while *preserving* the calibrated straight-down (top-down) view
 * (Playtest 2026-04-24: oblique cameras made the up-face ambiguous).
 *
 * AC2 (wiring audit) is a passing characterization: it locks in that the
 * tray is already server-authoritative so a future change can't silently
 * fake a roll client-side.
 *
 * Wiring note: InlineDiceTray is consumed by ConfrontationOverlay. The
 * production-path forwarding test lives in InlineDiceTray.test.tsx; this
 * file drives the component directly plus spies the dice-lib seam.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the camera prop handed to the R3F <Canvas> (the real mock in the
// sibling suite discards all props, so camera framing was previously
// un-assertable). vi.hoisted so the holder exists before the hoisted mock.
const r3f = vi.hoisted(() => ({
  camera: null as null | {
    position: [number, number, number];
    rotation?: [number, number, number];
    up?: [number, number, number];
    fov: number;
  },
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: ({
    children,
    camera,
  }: {
    children: React.ReactNode;
    camera: typeof r3f.camera;
  }) => {
    r3f.camera = camera;
    return <div data-testid="r3f-canvas">{children}</div>;
  },
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
  useLoader: () => ({ wrapS: 0, wrapT: 0, clone() { return { ...this }; } }),
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

// Spy the dice-lib seed-replay seam so AC2 can prove the spectator die is
// reproduced from the server payload, not a local RNG.
const diceLib = vi.hoisted(() => ({
  replay: vi.fn(() => ({
    position: [0, 0, 0],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    rotation: [0, 0, 0],
  })),
}));

vi.mock("@local/dice-lib", () => ({
  DiceScene: () => null,
  D20_RADIUS: 0.36,
  DEFAULT_DICE_THEME: { dieColor: "#e8e0d0", labelColor: "#1a1a1a" },
  replayThrowParams: diceLib.replay,
}));

import { InlineDiceTray } from "../InlineDiceTray";
import type { DiceRequestPayload, DiceResultPayload } from "@/types/payloads";

// Documented pre-69-1 baseline. The pull-in must improve on both.
const BASELINE_FRAME_PX = 180;
const BASELINE_CAMERA_Y = 2.4;
const BASELINE_FOV = 42;

const REQUEST: DiceRequestPayload = {
  request_id: "req-1",
  rolling_player_id: "p1",
  character_name: "Mira",
  dice: [{ sides: "d20", count: 1 } as unknown as DiceRequestPayload["dice"][number]],
  modifier: 2,
  stat: "GRIT",
  difficulty: 12,
  context: "Argue the Ledger — GRIT check",
};

const RESULT: DiceResultPayload = {
  request_id: "req-1",
  rolling_player_id: "p1",
  character_name: "Mira",
  rolls: [
    {
      spec: { sides: "d20", count: 1 } as unknown as DiceResultPayload["rolls"][number]["spec"],
      faces: [12],
    },
  ],
  modifier: 2,
  total: 14,
  difficulty: 12,
  outcome: "Success",
  seed: 42,
  throw_params: {
    velocity: [1, 2, 3],
    angular: [4, 5, 6],
    position: [0.5, 0.5],
  },
};

beforeEach(() => {
  r3f.camera = null;
  diceLib.replay.mockClear();
});

describe("InlineDiceTray — focal-moment camera/scale pull-in (AC1, story 69-1)", () => {
  it("renders the dice frame larger than the ~180px baseline so the roll is a focal moment", () => {
    // RED: the frame is currently an unlabelled 180px box. Dev must tag the
    // frame (data-testid="dice-frame") and scale it up for legibility.
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={RESULT}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    const frame = screen.getByTestId("dice-frame");
    const heightPx = parseInt(frame.style.height || "0", 10);
    expect(heightPx).toBeGreaterThan(BASELINE_FRAME_PX);
  });

  it("pulls the camera in tighter than the y=2.4 / fov=42 baseline", () => {
    // RED: pulling in means the die fills more of the frame — a closer
    // camera (smaller y) and/or a narrower lens (smaller fov). It may be no
    // looser than baseline on either axis, and strictly tighter on at least
    // one. Current config sits exactly at baseline on both → fails.
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={RESULT}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    expect(r3f.camera).not.toBeNull();
    const cam = r3f.camera!;
    const cameraY = cam.position[1];
    const fov = cam.fov;
    expect(cameraY).toBeLessThanOrEqual(BASELINE_CAMERA_Y);
    expect(fov).toBeLessThanOrEqual(BASELINE_FOV);
    expect(cameraY < BASELINE_CAMERA_Y || fov < BASELINE_FOV).toBe(true);
  });

  it("keeps the camera straight-down (top-down calibration preserved, no oblique angle)", () => {
    // GUARDRAIL: the pull-in must not be achieved by tilting the camera —
    // an oblique view makes the settled up-face ambiguous (Playtest
    // 2026-04-24). The camera must stay directly over the tray.
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={RESULT}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    expect(r3f.camera).not.toBeNull();
    const cam = r3f.camera!;
    // Directly overhead: no horizontal offset on either ground axis.
    expect(cam.position[0]).toBe(0);
    expect(cam.position[2]).toBe(0);
    // And looking straight down, not angled.
    expect(cam.rotation?.[0]).toBeCloseTo(-Math.PI / 2, 5);
  });
});

describe("InlineDiceTray — server-authoritative roll wiring audit (AC2, story 69-1)", () => {
  it("reproduces the spectator die from the server seed + throw_params, never a client RNG", () => {
    // A spectator (playerId != rolling_player_id) must see the SAME roll the
    // server resolved. That can only be faithful if the scene is rebuilt from
    // the server's seed and throw_params via replayThrowParams. If a future
    // change swapped in randomThrowParams() for spectators, this fails.
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={RESULT}
        playerId="p2"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    expect(diceLib.replay).toHaveBeenCalledTimes(1);
    expect(diceLib.replay).toHaveBeenCalledWith(RESULT.throw_params, RESULT.seed, 0.36);
  });

  it("displays the server total and faces verbatim, not a client-computed value", () => {
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={RESULT}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    // The result readout shows the server total (14) vs the server DC (12).
    const result = screen.getByTestId("dice-result");
    expect(result).toHaveTextContent("14");
    expect(result).toHaveTextContent("12");
    // The accessible announcement carries the server face(s) verbatim.
    expect(screen.getByRole("status")).toHaveTextContent("12"); // faces[0]
    expect(screen.getByRole("status")).toHaveTextContent("Mira rolled 14");
  });

  it("does not fabricate a result while a request is pending with no server result", () => {
    // No DiceResult yet → nothing client-side may invent a face/total.
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={null}
        playerId="p2"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    expect(screen.queryByTestId("dice-result")).not.toBeInTheDocument();
    expect(diceLib.replay).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
