/**
 * Playtest 2026-04-19: Target persistence after roll.
 *
 * Regression coverage for the "target vanishes immediately after roll"
 * bug — the table needs to see both the target and the result together,
 * not either one in isolation and not either one for only 100ms.
 *
 * Wiring note: InlineDiceTray is consumed by ConfrontationOverlay (inline
 * dice tray inside the Confrontation panel). These tests drive it directly.
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

// Stub @local/dice-lib so DiceScene doesn't render R3F intrinsics outside
// a real Canvas. dice-lib has its own tests; this suite verifies only the
// sidequest-ui wrapper logic (target banner, result display, prop flow).
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
import type { DiceRequestPayload, DiceResultPayload } from "@/types/payloads";

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
    velocity: [0, 0, 0],
    angular: [0, 0, 0],
    position: [0.5, 0.5],
  },
};

describe("InlineDiceTray — target persistence (playtest 2026-04-19)", () => {
  it("shows the target DC prominently when a request is active", () => {
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={null}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    const banner = screen.getByTestId("dice-target-banner");
    expect(banner).toBeInTheDocument();
    // DC value (12) is the big number — not the mod-adjusted "need" value.
    expect(banner).toHaveTextContent("12");
    expect(banner).toHaveTextContent(/target/i);
    // Modifier context is still visible for mechanical transparency (Sebastien).
    expect(banner).toHaveTextContent(/GRIT/);
    expect(banner).toHaveTextContent("+2");
  });

  it("keeps the target banner visible while the result is displayed", () => {
    // Critical regression: before this fix, the result rendered alongside
    // nothing, so the table couldn't see "rolled 14 vs target 12".
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={RESULT}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    expect(screen.getByTestId("dice-target-banner")).toBeInTheDocument();
    const result = screen.getByTestId("dice-result");
    expect(result).toHaveTextContent("14"); // rolled total
    expect(result).toHaveTextContent("12"); // vs DC — same target as banner
    expect(result).toHaveTextContent(/Success/);
  });

  it("renders Tie outcome with its own label, not Fail (playtest 2026-05-06)", () => {
    // Server resolver: total == DC → Tie (its own band, not Fail). Before
    // this fix, the UI fell through to "Fail" with red color, conflating
    // "no movement" with "you lost." Sebastien's first read of the dial.
    const tieResult: DiceResultPayload = {
      ...RESULT,
      total: 12,
      outcome: "Tie",
      rolls: [
        {
          spec: { sides: "d20", count: 1 } as unknown as DiceResultPayload["rolls"][number]["spec"],
          faces: [10],
        },
      ],
    };
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={tieResult}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    const result = screen.getByTestId("dice-result");
    expect(result).toHaveAttribute("data-outcome", "Tie");
    expect(result).toHaveTextContent(/Tie/);
    expect(result).not.toHaveTextContent(/Fail/);
  });

  it("displays the minimum *passing* face on the target banner, not the Tie face", () => {
    // Server: outcome = Success iff total > difficulty. With DC=12 and
    // modifier=+2, the smallest passing face is 11 (11+2=13>12), not 10
    // (10+2=12 ties). Display now shows the first passing face.
    render(
      <InlineDiceTray
        diceRequest={REQUEST}
        diceResult={null}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    const banner = screen.getByTestId("dice-target-banner");
    expect(banner).toHaveTextContent(/need 11 on d20/);
  });

  it("hides the target banner when there is no active request", () => {
    render(
      <InlineDiceTray
        diceRequest={null}
        diceResult={null}
        playerId="p1"
        onThrow={vi.fn()}
        genreSlug="heavy_metal"
      />,
    );
    expect(screen.queryByTestId("dice-target-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dice-result")).not.toBeInTheDocument();
  });
});

describe("InlineDiceTray — wiring (consumed by ConfrontationOverlay)", () => {
  it("ConfrontationOverlay forwards dice props into InlineDiceTray", async () => {
    // Wiring test per CLAUDE.md: proves the tray is reachable from production
    // code paths, not just unit-testable in isolation.
    const { ConfrontationOverlay } = await import("../../components/ConfrontationOverlay");
    render(
      <ConfrontationOverlay
        data={{
          type: "negotiation",
          label: "Cold Negotiation",
          category: "social",
          actors: [{ name: "Mira", role: "player" }],
          player_metric: {
            name: "leverage",
            current: 4,
            starting: 0,
            threshold: 10,
          },
          opponent_metric: {
            name: "leverage",
            current: 2,
            starting: 0,
            threshold: 10,
          },
          beats: [],
          secondary_stats: null,
          genre_slug: "heavy_metal",
          mood: "tension",
        }}
        diceRequest={REQUEST}
        diceResult={RESULT}
        playerId="p1"
        onDiceThrow={vi.fn()}
      />,
    );
    expect(screen.getByTestId("inline-dice-tray")).toBeInTheDocument();
    expect(screen.getByTestId("dice-target-banner")).toHaveTextContent("12");
    expect(screen.getByTestId("dice-result")).toHaveTextContent("14");
  });
});
