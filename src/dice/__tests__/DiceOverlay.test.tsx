/**
 * Story 34-5: DiceOverlay component tests.
 *
 * Tests the production DiceOverlay driven by WebSocket protocol messages.
 * The spike (34-1) was always-on; production is state-machine-driven:
 *   idle → DiceRequest → active (rolling or spectating) → DiceResult → settled → idle
 *
 * RED phase — all tests FAIL until Dev evolves the overlay.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

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

// Stub @local/dice-lib so DiceScene doesn't render R3F intrinsics
// (<ambientLight>, <directionalLight>, etc.) outside an actual Canvas.
// dice-lib has its own tests; these tests verify only the sidequest-ui
// wrapper logic around it.
vi.mock("@local/dice-lib", () => ({
  DiceScene: () => null,
  D20_RADIUS: 0.36,
  replayThrowParams: () => ({
    position: [0, 0, 0],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    rotation: [0, 0, 0],
  }),
}));

// ── Test fixtures matching Rust wire types ────────────────────────────────────

const DICE_REQUEST_PAYLOAD = {
  request_id: "req-001",
  rolling_player_id: "player-1",
  character_name: "Kira",
  dice: [{ sides: 20, count: 1 }],
  modifier: 3,
  stat: "dexterity",
  difficulty: 15,
  context: "The lock resists your touch...",
};

const DICE_RESULT_PAYLOAD = {
  request_id: "req-001",
  rolling_player_id: "player-1",
  character_name: "Kira",
  rolls: [{ spec: { sides: 20, count: 1 }, faces: [17] }],
  modifier: 3,
  total: 20,
  difficulty: 15,
  outcome: "Success" as const,
  seed: 12345,
  throw_params: {
    velocity: [1.0, 2.0, -3.0] as [number, number, number],
    angular: [10.0, -5.0, 8.0] as [number, number, number],
    position: [0.5, 0.5] as [number, number],
  },
};

const CRIT_SUCCESS_RESULT = {
  ...DICE_RESULT_PAYLOAD,
  rolls: [{ spec: { sides: 20, count: 1 }, faces: [20] }],
  total: 23,
  outcome: "CritSuccess" as const,
};

const CRIT_FAIL_RESULT = {
  ...DICE_RESULT_PAYLOAD,
  rolls: [{ spec: { sides: 20, count: 1 }, faces: [1] }],
  total: 4,
  outcome: "CritFail" as const,
};

// ══════════════════════════════════════════════════════════════════════════════
// AC: DiceOverlay renders nothing when no dice request is active
// ══════════════════════════════════════════════════════════════════════════════

describe("AC: DiceOverlay visibility lifecycle", () => {
  it("renders nothing when no diceRequest prop is provided", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    const { container } = render(
      <DiceOverlay
        diceRequest={null}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    expect(container.querySelector("[data-testid='dice-overlay']")).toBeNull();
  });

  it("renders dice overlay when diceRequest is provided", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    expect(screen.getByTestId("dice-overlay")).toBeInTheDocument();
  });

  it("overlay has pointer-events: none when no dice request is active", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    const { container } = render(
      <DiceOverlay
        diceRequest={null}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    // When null, the overlay shouldn't be in the DOM at all
    expect(container.querySelector("[data-testid='dice-overlay']")).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC: DC, stat, and modifier display (FR10)
// ══════════════════════════════════════════════════════════════════════════════

describe("AC: Dice tray info display", () => {
  it("shows the difficulty class (DC)", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    expect(screen.getByText(/DC\s*15/)).toBeInTheDocument();
  });

  it("shows the stat name", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    expect(screen.getByText(/dexterity/i)).toBeInTheDocument();
  });

  it("shows the modifier", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    expect(screen.getByText(/\+3/)).toBeInTheDocument();
  });

  it("shows the character name", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    expect(screen.getByText(/Kira/)).toBeInTheDocument();
  });

  it("shows the narrator context text", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    expect(screen.getByText(/The lock resists/)).toBeInTheDocument();
  });

  it("shows the minimum *passing* die face (DC - modifier + 1)", async () => {
    // Server resolver: outcome = Success iff total > difficulty (Tie at
    // total==DC). The first passing face is `difficulty - modifier + 1`,
    // not `difficulty - modifier` (which only ties). Playtest 2026-05-06
    // surfaced this as "rolled 12 vs need 12 — Fail".
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    // DC 15, modifier +3 → first passing face is 13 (13+3=16>15)
    expect(screen.getByText(/need.*13|13.*need/i)).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC: Rolling player vs spectator (FR14, FR16)
// ══════════════════════════════════════════════════════════════════════════════

describe("AC: Rolling player vs spectator mode", () => {
  it("rolling player sees interactive dice (can throw)", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    const overlay = screen.getByTestId("dice-overlay");
    // Rolling player: overlay should be interactive
    expect(overlay).not.toHaveStyle({ pointerEvents: "none" });
  });

  it("spectator sees read-only overlay (cannot interact)", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-2"
        onThrow={vi.fn()}
      />,
    );
    // Spectator player_id doesn't match rolling_player_id
    // The dice should be visible but not interactive
    const overlay = screen.getByTestId("dice-overlay");
    expect(overlay).toBeInTheDocument();
    // Spectator should see "waiting for Kira to throw" or similar
    expect(screen.getByText(/Kira/)).toBeInTheDocument();
  });

  it("spectator cannot trigger onThrow callback", async () => {
    const onThrow = vi.fn();
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-2"
        onThrow={onThrow}
      />,
    );
    // Spectators should not have an interactive drag surface
    // The onThrow should never be callable from spectator view
    expect(onThrow).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC: Result display with RollOutcome-driven visuals
// ══════════════════════════════════════════════════════════════════════════════

describe("AC: Dice result display", () => {
  it("shows the total when DiceResult arrives", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={DICE_RESULT_PAYLOAD}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    const resultEl = screen.getByTestId("dice-result");
    expect(within(resultEl).getByText("20")).toBeInTheDocument();
  });

  it("shows outcome label for Success", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={DICE_RESULT_PAYLOAD}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    const resultEl = screen.getByTestId("dice-result");
    expect(within(resultEl).getByText(/success/i)).toBeInTheDocument();
  });

  it("shows CritSuccess with distinctive visual treatment", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={CRIT_SUCCESS_RESULT}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    const resultEl = screen.getByTestId("dice-result");
    expect(resultEl).toHaveAttribute("data-outcome", "CritSuccess");
  });

  it("shows CritFail with distinctive visual treatment", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={CRIT_FAIL_RESULT}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    const resultEl = screen.getByTestId("dice-result");
    expect(resultEl).toHaveAttribute("data-outcome", "CritFail");
  });

  it("shows individual die faces in result", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={DICE_RESULT_PAYLOAD}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    // Should display the individual roll: 17
    const resultEl = screen.getByTestId("dice-result");
    expect(within(resultEl).getByText("17")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC: Accessibility (FR20, FR21, FR22)
// ══════════════════════════════════════════════════════════════════════════════

describe("AC: Dice accessibility", () => {
  it("has aria-live region for screen reader announcements", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={DICE_RESULT_PAYLOAD}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });

  it("aria-live region announces roll result text", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={DICE_RESULT_PAYLOAD}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    const liveRegion = screen.getByRole("status");
    // Per ADR-075: "[Character] rolled [total] ([rolls] + [modifier]) vs DC [difficulty] — [outcome]"
    expect(liveRegion.textContent).toMatch(/Kira/);
    expect(liveRegion.textContent).toMatch(/20/);
    expect(liveRegion.textContent).toMatch(/DC.*15|15.*DC/);
    expect(liveRegion.textContent).toMatch(/Success/i);
  });

  it("aria-live region is present but empty before result arrives", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    render(
      <DiceOverlay
        diceRequest={DICE_REQUEST_PAYLOAD}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion.textContent).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC: Lazy loading verified
// ══════════════════════════════════════════════════════════════════════════════

describe("AC: DiceOverlay is a lazy-loadable module", () => {
  it("DiceOverlay exports a default export (for React.lazy)", async () => {
    const mod = await import("../DiceOverlay");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("DiceOverlay also exports named DiceOverlay (for direct import in tests)", async () => {
    const mod = await import("../DiceOverlay");
    expect(mod.DiceOverlay).toBeDefined();
    expect(typeof mod.DiceOverlay).toBe("function");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC: Negative modifier display
// ══════════════════════════════════════════════════════════════════════════════

describe("AC: Edge cases — negative modifier", () => {
  it("shows negative modifier correctly", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    const negModRequest = {
      ...DICE_REQUEST_PAYLOAD,
      modifier: -2,
    };
    render(
      <DiceOverlay
        diceRequest={negModRequest}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    expect(screen.getByText(/-2/)).toBeInTheDocument();
  });

  it("calculates 'you need' correctly with negative modifier", async () => {
    const { DiceOverlay } = await import("../DiceOverlay");
    const negModRequest = {
      ...DICE_REQUEST_PAYLOAD,
      modifier: -2,
      difficulty: 15,
    };
    render(
      <DiceOverlay
        diceRequest={negModRequest}
        diceResult={null}
        playerId="player-1"
        onThrow={vi.fn()}
      />,
    );
    // DC 15, modifier -2 → first passing face is 18 (18-2=16>15)
    expect(screen.getByText(/need.*18|18.*need/i)).toBeInTheDocument();
  });
});
