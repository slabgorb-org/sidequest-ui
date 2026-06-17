/**
 * Story 118-7 (ADR-144 F3g): FatePanel mounts the 4dF roll surface (RED).
 *
 * 118-2 gave FatePanel the Fate sheet; 118-3 gave us FateDiceTray (a real 3D
 * Fudge-die roll surface) with NO production consumer. This mounts the tray
 * inside the panel, gated so it NEVER co-renders with the WN/native
 * ConfrontationOverlay (epic 118 guardrail — the required *paired negative
 * test*):
 *   - fate pack + a roll present  → tray mounts
 *   - no roll yet                 → tray ABSENT
 *   - ruleset != "fate"           → tray ABSENT (FateDiceTray self-gate)
 *   - no Fate pack (data null)    → tray ABSENT (mount gated on fate-pack
 *                                   presence, gameState.fateState != null)
 *
 * `latestRoll` and `ruleset` are not yet FatePanel props, so they're reached
 * through a widened type — the RED signal is the missing mount at runtime, not a
 * type error (mirrors GameBoard-fate-tab.test.tsx).
 *
 * R3F/drei/dice-lib are mocked exactly as FateDiceTray.test.tsx mocks them (no
 * WebGL in jsdom).
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ComponentProps } from "react";

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
vi.mock("@local/dice-lib", () => ({
  DiceScene: () => <div data-testid="dice-scene" />,
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

import { FatePanel } from "../FatePanel";
import type { FateRollPayload, FateStatePayload } from "../../types/payloads";

// A roll that includes a ZERO face so the AC4 glyph guard has something to read.
const SUCCEED: FateRollPayload = {
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

const fateState: FateStatePayload = {
  characters: [
    {
      name: "Sam Spadework",
      fate_points: 3,
      refresh: 3,
      skills: [{ name: "Investigate", rating: 4, ladder: "Great" }],
      aspects: [
        { text: "Hard-boiled detective", kind: "high_concept", free_invokes: 0 },
      ],
      stress: { physical: [{ value: 1, checked: false }], mental: [] },
      consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
    },
  ],
  scene_aspects: [],
  conflict: null,
};

// Widen FatePanel's props with the not-yet-landed roll inputs so this RED test
// compiles before the props land and stays correct after.
type PanelProps = ComponentProps<typeof FatePanel> & {
  latestRoll?: FateRollPayload | null;
  ruleset?: string;
};

function renderPanel(props: PanelProps) {
  return render(<FatePanel {...(props as ComponentProps<typeof FatePanel>)} />);
}

describe("FatePanel — 4dF roll surface mount (Story 118-7, paired ruleset gate)", () => {
  it("mounts FateDiceTray when a fate pack is active and a roll has arrived", () => {
    renderPanel({ data: fateState, latestRoll: SUCCEED, ruleset: "fate" });
    expect(screen.getByTestId("fate-dice-tray")).toBeInTheDocument();
  });

  it("does NOT mount the tray before any roll has arrived (latestRoll null)", () => {
    renderPanel({ data: fateState, latestRoll: null, ruleset: "fate" });
    expect(screen.queryByTestId("fate-dice-tray")).not.toBeInTheDocument();
  });

  it("does NOT mount the tray on a non-fate ruleset (never co-renders with the WN/native overlay)", () => {
    renderPanel({ data: fateState, latestRoll: SUCCEED, ruleset: "native" });
    expect(screen.queryByTestId("fate-dice-tray")).not.toBeInTheDocument();
  });

  it("does NOT mount the tray when there is no Fate pack (data null — the fate-pack gate)", () => {
    renderPanel({ data: null, latestRoll: SUCCEED, ruleset: "fate" });
    expect(screen.queryByTestId("fate-dice-tray")).not.toBeInTheDocument();
  });

  // AC4 (glyph consistency): the legible faces readout renders a ZERO face as
  // "0" (clearer for Sebastien/Jade), not a blank — so the table reads "+ + 0 −".
  it("renders a zero Fudge face as '0' in the legible readout (AC4)", () => {
    renderPanel({ data: fateState, latestRoll: SUCCEED, ruleset: "fate" });
    const faces = screen.getByTestId("fate-roll-faces");
    expect(faces).toHaveTextContent("0");
    // The full readout is the four glyphs in order — a blank zero would collapse
    // this to "+ + −"; the explicit "0" keeps all four faces legible.
    expect(faces.textContent?.replace(/\s+/g, " ").trim()).toBe("+ + 0 −");
  });
});
