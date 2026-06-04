/**
 * RED — Story 85-3 (Tier B): confrontation-mode panel surfaces.
 *
 * The confrontation is promoted from a thin bottom strip into a focused dockview
 * panel (SPLIT layout — narration left, confrontation right). This file pins the
 * three NEW player-facing surfaces the promotion adds to the confrontation
 * renderer (docs/design/confrontation-space-usage.md, Tier B):
 *
 *   1. Stakes banner   — `data.stakes` (set_stakes) shown prominently up top.
 *   2. "Meanwhile at the table" strip — non-soloing players' concurrent verbs
 *      (The Guitar Solo); collapses to nothing in solo play.
 *   3. THEM panel      — opponent portrait + name + their last beat, so the dial
 *      reads as *against someone* (ADR-116 "requires an Other").
 *
 * The CONFRONTATION payload gains `stakes` and per-opponent `portrait_url`
 * server-side (see sidequest-server test_confrontation_stakes_portrait_payload.py).
 * `meanwhileActions` is a NEW prop carrying the table's concurrent verbs (sourced
 * from existing MP peer-action state per ADR-036's 2026-05-03 amendment — wired
 * by Dev; this file pins the rendering contract).
 *
 * The fixtures cast the new `stakes` field / `meanwhileActions` prop so the RED
 * signal is the missing rendered surface (runtime), not a type error in the test
 * — the type additions land in the source as part of GREEN.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// R3F + drei mocks — ConfrontationOverlay → InlineDiceTray → DiceScene calls useLoader.
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

import {
  ConfrontationOverlay,
  type ConfrontationData,
} from "@/components/ConfrontationOverlay";

type OverlayProps = React.ComponentProps<typeof ConfrontationOverlay>;

const BASE: ConfrontationData = {
  type: "chase",
  label: "Highway Pursuit",
  category: "movement",
  actors: [
    { name: "Magpie", role: "driver", side: "player" },
    {
      name: "Divvie Sergeant",
      role: "pursuer",
      side: "opponent",
      portrait_url: "/portraits/divvie-sergeant.png",
    },
  ],
  player_metric: { name: "separation", current: 5, starting: 0, threshold: 10 },
  opponent_metric: { name: "pursuit", current: 2, starting: 0, threshold: 10 },
  beats: [
    { id: "floor-it", label: "Floor It", kind: "press", base: 2, stat_check: "SPD" },
  ],
  secondary_stats: null,
  genre_slug: "road_warrior",
  mood: "tense",
};

/** BASE plus the new `stakes` field (cast suppresses excess-property check). */
function withStakes(stakes: string | undefined): ConfrontationData {
  return { ...BASE, stakes } as ConfrontationData;
}

// ── 1. Stakes banner ────────────────────────────────────────────────────────

describe("85-3 stakes banner", () => {
  it("renders the stakes text prominently when data.stakes is present", () => {
    render(<ConfrontationOverlay data={withStakes("Shake the cruisers or lose the cargo")} />);
    const banner = screen.getByTestId("confrontation-stakes-banner");
    expect(banner).toHaveTextContent("Shake the cruisers or lose the cargo");
  });

  it("collapses (renders no banner) when stakes is absent", () => {
    render(<ConfrontationOverlay data={withStakes(undefined)} />);
    expect(screen.queryByTestId("confrontation-stakes-banner")).toBeNull();
  });

  it("collapses (renders no banner) when stakes is an empty string", () => {
    render(<ConfrontationOverlay data={withStakes("")} />);
    expect(screen.queryByTestId("confrontation-stakes-banner")).toBeNull();
  });
});

// ── 2. "Meanwhile at the table" strip (The Guitar Solo) ──────────────────────

describe("85-3 meanwhile-at-the-table strip", () => {
  const meanwhileActions = [
    { actor: "Spark", role: "gunner", verb: "lay down covering fire" },
    { actor: "Haraka", role: "nav", verb: "call the next turn" },
  ];

  it("surfaces each non-soloing player's concurrent verb when actions are present", () => {
    const props = { data: BASE, meanwhileActions } as unknown as OverlayProps;
    render(<ConfrontationOverlay {...props} />);
    const strip = screen.getByTestId("confrontation-meanwhile-strip");
    expect(strip).toHaveTextContent("lay down covering fire");
    expect(strip).toHaveTextContent("call the next turn");
    expect(strip).toHaveTextContent("Spark");
    expect(strip).toHaveTextContent("Haraka");
  });

  it("collapses to nothing in solo play (no concurrent actions)", () => {
    const props = { data: BASE, meanwhileActions: [] } as unknown as OverlayProps;
    render(<ConfrontationOverlay {...props} />);
    expect(screen.queryByTestId("confrontation-meanwhile-strip")).toBeNull();
  });

  it("collapses when the meanwhile prop is omitted entirely", () => {
    render(<ConfrontationOverlay data={BASE} />);
    expect(screen.queryByTestId("confrontation-meanwhile-strip")).toBeNull();
  });
});

// ── 3. THEM panel — opponent portrait + name + last beat (ADR-116) ───────────

describe("85-3 THEM panel (the dial has a face)", () => {
  it("renders a dedicated opponent panel with the opponent's name and portrait", () => {
    render(<ConfrontationOverlay data={BASE} />);
    const them = screen.getByTestId("confrontation-them-panel");
    expect(them).toHaveTextContent("Divvie Sergeant");
    // The opponent's resolved portrait renders inside the THEM panel.
    const portrait = them.querySelector('[data-has-portrait="true"]');
    expect(portrait).not.toBeNull();
  });

  it("surfaces the opponent's last beat inside the THEM panel when present", () => {
    const data: ConfrontationData = {
      ...BASE,
      opponent_last_beat_impact: {
        effect: "advance",
        dial_moved: true,
        summary: "Sergeant closes the gap (+2 pursuit)",
        own: 2,
      },
    };
    render(<ConfrontationOverlay data={data} />);
    const them = screen.getByTestId("confrontation-them-panel");
    expect(them).toHaveTextContent("Sergeant closes the gap (+2 pursuit)");
  });

  it("degrades cleanly when the opponent has no portrait (solo / missing manifest)", () => {
    const data: ConfrontationData = {
      ...BASE,
      actors: [
        { name: "Magpie", role: "driver", side: "player" },
        { name: "Faceless Pursuer", role: "pursuer", side: "opponent" }, // no portrait_url
      ],
    };
    render(<ConfrontationOverlay data={data} />);
    const them = screen.getByTestId("confrontation-them-panel");
    // Still names the opponent; the portrait slot degrades rather than breaking.
    expect(them).toHaveTextContent("Faceless Pursuer");
    expect(them.querySelector('[data-has-portrait="true"]')).toBeNull();
  });
});
