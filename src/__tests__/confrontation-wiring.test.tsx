import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

// R3F + drei mocks — ConfrontationOverlay renders InlineDiceTray → DiceScene which calls useLoader.
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

import { ConfrontationOverlay, type ConfrontationData } from "@/components/ConfrontationOverlay";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const STANDOFF_DATA: ConfrontationData = {
  type: "standoff",
  label: "High Noon Standoff",
  category: "confrontation",
  actors: [
    { name: "The Stranger", role: "duelist", portrait_url: "/portraits/stranger.png" },
    { name: "Black Bart", role: "duelist", portrait_url: "/portraits/bart.png" },
  ],
  player_metric: {
    name: "tension",
    current: 3,
    starting: 0,
    threshold: 10,
  },
  opponent_metric: {
    name: "tension",
    current: 1,
    starting: 0,
    threshold: 10,
  },
  beats: [
    { id: "stare", label: "Stare Down", kind: "press", base: 2, stat_check: "CHA", risk: "blink" },
    { id: "draw", label: "Draw!", kind: "finisher", base: 5, stat_check: "DEX", resolution: true },
  ],
  secondary_stats: null,
  genre_slug: "spaghetti_western",
  mood: "tense",
};

const CHASE_DATA: ConfrontationData = {
  type: "chase",
  label: "Highway Pursuit",
  category: "confrontation",
  actors: [
    { name: "Road Hog", role: "pursuer" },
    { name: "Sam", role: "quarry" },
  ],
  player_metric: {
    name: "distance",
    current: 5,
    starting: 0,
    threshold: 10,
  },
  opponent_metric: {
    name: "closing",
    current: 3,
    starting: 0,
    threshold: 10,
  },
  beats: [
    { id: "floor-it", label: "Floor It", kind: "press", base: 2, stat_check: "SPD" },
    { id: "swerve", label: "Swerve", kind: "press", base: 1, stat_check: "MAN", risk: "rollover" },
  ],
  secondary_stats: {
    stats: {
      hp: { current: 80, max: 100 },
      speed: { current: 120, max: 120 },
      armor: { current: 3, max: 3 },
      maneuver: { current: 5, max: 5 },
      fuel: { current: 45, max: 60 },
    },
  },
  genre_slug: "road_warrior",
  mood: "frantic",
};

// ══════════════════════════════════════════════════════════════════════════════
// AC1: ConfrontationOverlay renders when data is provided
// ══════════════════════════════════════════════════════════════════════════════

describe("AC1: ConfrontationOverlay renders when data is provided", () => {
  it("renders confrontation overlay when data is provided", () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);

    expect(screen.getByTestId("confrontation-overlay")).toBeInTheDocument();
    expect(screen.getByText("High Noon Standoff")).toBeInTheDocument();
  });

  it("does not render confrontation overlay when data is null", () => {
    render(<ConfrontationOverlay data={null} />);

    expect(screen.queryByTestId("confrontation-overlay")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC2: Correct confrontation type renders (standoff, chase, etc.)
// ══════════════════════════════════════════════════════════════════════════════

describe("AC2: Confrontation type rendering", () => {
  it("renders standoff with data-type attribute", () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);

    const overlay = screen.getByTestId("confrontation-overlay");
    expect(overlay).toHaveAttribute("data-type", "standoff");
    expect(overlay).toHaveAttribute("data-genre", "spaghetti_western");
  });

  it("renders chase with secondary stats panel", () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);

    const overlay = screen.getByTestId("confrontation-overlay");
    expect(overlay).toHaveAttribute("data-type", "chase");
    expect(screen.getByTestId("secondary-stats")).toBeInTheDocument();
  });

  it("renders actor chips for all encounter participants", () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);

    const portraits = screen.getAllByTestId("actor-portrait");
    expect(portraits.length).toBe(2);
    // Compact status line: name lives on the chip's title attribute.
    expect(portraits[0]).toHaveAttribute("title", expect.stringMatching(/The Stranger/));
    expect(portraits[1]).toHaveAttribute("title", expect.stringMatching(/Black Bart/));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC3: Metric bar renders correctly
// ══════════════════════════════════════════════════════════════════════════════

describe("AC3: Dual-dial metric display", () => {
  it("renders both player and opponent metric bars", () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);

    const bars = screen.getAllByTestId("metric-bar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("data-metric-side", "player");
    expect(bars[1]).toHaveAttribute("data-metric-side", "opponent");
  });

  it("renders fill elements for both bars", () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);

    expect(screen.getAllByTestId("metric-bar-fill")).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC4: Beat tiles render and fire onBeatSelect callback
// ══════════════════════════════════════════════════════════════════════════════

describe("AC4: Beat action tiles", () => {
  it("renders all beat options as tiles", () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);

    expect(screen.getByText("Stare Down")).toBeInTheDocument();
    expect(screen.getByText("Draw!")).toBeInTheDocument();
  });

  it("marks resolution beats with data-resolution attribute", () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);

    const drawBtn = screen.getByText("Draw!").closest("button");
    expect(drawBtn).toHaveAttribute("data-resolution", "true");
  });

  it("calls onBeatSelect when a beat tile is clicked", async () => {
    const user = userEvent.setup();
    const onBeatSelect = vi.fn();
    render(<ConfrontationOverlay data={STANDOFF_DATA} onBeatSelect={onBeatSelect} />);

    await user.click(screen.getByText("Stare Down"));
    expect(onBeatSelect).toHaveBeenCalledWith("stare");
  });

  it("calls onBeatSelect for resolution beats on click", async () => {
    const user = userEvent.setup();
    const onBeatSelect = vi.fn();
    render(<ConfrontationOverlay data={STANDOFF_DATA} onBeatSelect={onBeatSelect} />);

    await user.click(screen.getByText("Draw!"));
    expect(onBeatSelect).toHaveBeenCalledWith("draw");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC5: Overlay lifecycle — hides when confrontation resolves
// ══════════════════════════════════════════════════════════════════════════════

describe("AC5: Overlay lifecycle", () => {
  it("hides overlay when data transitions from present to null", () => {
    const { rerender } = render(<ConfrontationOverlay data={STANDOFF_DATA} />);

    expect(screen.getByTestId("confrontation-overlay")).toBeInTheDocument();

    rerender(<ConfrontationOverlay data={null} />);

    expect(screen.queryByTestId("confrontation-overlay")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Production wiring — App.tsx → GameBoard → ConfrontationOverlay
//
// The component-level tests above prove the callback plumbing inside
// ConfrontationOverlay. This block reads source files to assert the production
// wire-up is present: GameBoard accepts the props, GameBoard renders the
// panel above the InputBar when data is present, and App.tsx passes data
// through to GameBoard. Replaces the dockview-tab wiring asserted before
// 2026-05-13 (D2 mock — confrontation moved out of dockview).
// ══════════════════════════════════════════════════════════════════════════════

describe("Wiring: Production App.tsx → GameBoard → ConfrontationOverlay", () => {
  it("GameBoard.tsx accepts confrontationData prop", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const gameBoardSrc = fs.readFileSync(
      path.resolve(__dirname, "../components/GameBoard/GameBoard.tsx"),
      "utf-8",
    );
    expect(gameBoardSrc).toMatch(/confrontationData/);
  });

  it("GameBoard.tsx accepts onBeatSelect prop", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const gameBoardSrc = fs.readFileSync(
      path.resolve(__dirname, "../components/GameBoard/GameBoard.tsx"),
      "utf-8",
    );
    expect(gameBoardSrc).toMatch(/onBeatSelect/);
  });

  it("GameBoard.tsx renders ConfrontationOverlay above the InputBar", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const gameBoardSrc = fs.readFileSync(
      path.resolve(__dirname, "../components/GameBoard/GameBoard.tsx"),
      "utf-8",
    );
    // ConfrontationOverlay must be imported as a value, not just a type.
    expect(gameBoardSrc).toMatch(
      /import[\s\S]*?ConfrontationOverlay[\s\S]*?from\s*["']@\/components\/ConfrontationOverlay["']/,
    );
    // Renders with confrontationData and onBeatSelect threaded in.
    expect(gameBoardSrc).toMatch(/<ConfrontationOverlay[\s\S]*?data=\{confrontationData\}/);
    expect(gameBoardSrc).toMatch(/<ConfrontationOverlay[\s\S]*?onBeatSelect=\{onBeatSelect\}/);
    // Threads confrontationActive into the InputBar so plain Enter is locked.
    expect(gameBoardSrc).toMatch(
      /<InputBar[\s\S]*?confrontationActive=\{confrontationData\s*!=\s*null\}/,
    );
  });

  it("App.tsx declares a handleBeatSelect callback", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appSrc = fs.readFileSync(
      path.resolve(__dirname, "../App.tsx"),
      "utf-8",
    );
    expect(appSrc).toMatch(/const handleBeatSelect\s*=\s*useCallback/);
  });

  it("App.tsx passes onBeatSelect={handleBeatSelect} to <GameBoard>", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appSrc = fs.readFileSync(
      path.resolve(__dirname, "../App.tsx"),
      "utf-8",
    );
    // The <GameBoard .../> block must contain onBeatSelect={handleBeatSelect}.
    // Without this, confrontation tiles are silent no-ops in production.
    const gameBoardBlock = appSrc.match(/<GameBoard[\s\S]*?\/>/);
    expect(gameBoardBlock).not.toBeNull();
    expect(gameBoardBlock?.[0]).toContain("onBeatSelect={handleBeatSelect}");
  });

  it("handleBeatSelect drives a beat-tagged DICE_THROW handshake", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appSrc = fs.readFileSync(
      path.resolve(__dirname, "../App.tsx"),
      "utf-8",
    );
    // Beat dispatch was migrated off the BEAT_SELECTION wire message and onto
    // the physics-is-the-roll DICE_THROW pipeline (story 34-12). handleBeatSelect
    // now builds a local DiceRequest carrying the beat's stat_check + DC; the
    // beat id is latched in pendingBeatIdRef and re-attached to DICE_THROW when
    // dice settle. The handler must therefore:
    // 1. Be declared as a useCallback (so its identity is stable for GameBoard).
    // 2. Build a DiceRequest using the beat's stat_check + base difficulty.
    // 3. Latch the beat id in pendingBeatIdRef so handleDiceThrow can attach it.
    // 4. Have confrontationData in its dependency array (current beat list).
    expect(appSrc).toMatch(/const handleBeatSelect\s*=\s*useCallback/);
    expect(appSrc).toMatch(/setDiceRequest\(localReq\)/);
    expect(appSrc).toMatch(/pendingBeatIdRef\.current\s*=\s*beatId/);
    expect(appSrc).toMatch(/\[confrontationData,[\s\S]*?\]/);
    // And the matching wire-message exit point on dice settle must tag the
    // throw with beat_id when one is pending.
    expect(appSrc).toMatch(/type:\s*MessageType\.DICE_THROW/);
    expect(appSrc).toMatch(/beat_id\s*:\s*beatId/);
  });

  it("NARRATION_END clears confrontation when no CONFRONTATION message arrived this turn", async () => {
    // Wiring test: App.tsx must clear confrontationData on NARRATION_END
    // when confrontationReceivedThisTurnRef is false (encounter resolved
    // but server didn't send active:false due to snapshot ordering).
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appSrc = fs.readFileSync(
      path.resolve(__dirname, "../App.tsx"),
      "utf-8",
    );
    // Ref must exist to track per-turn CONFRONTATION receipt
    expect(appSrc).toContain("confrontationReceivedThisTurnRef");
    // NARRATION_END handler must clear confrontation when ref is false
    expect(appSrc).toMatch(
      /NARRATION_END[\s\S]*?confrontationReceivedThisTurnRef\.current\b/,
    );
    // CONFRONTATION handler must set the ref
    expect(appSrc).toMatch(
      /CONFRONTATION[\s\S]*?confrontationReceivedThisTurnRef\.current\s*=\s*true/,
    );
  });
});
