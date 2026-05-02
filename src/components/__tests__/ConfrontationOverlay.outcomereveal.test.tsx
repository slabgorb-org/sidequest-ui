import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// R3F + drei mocks — ConfrontationOverlay renders InlineDiceTray → DiceScene
// which calls useLoader. Mirrors the pattern in confrontation-wiring.test.tsx.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
  useLoader: () => {
    const tex = {
      wrapS: 0,
      wrapT: 0,
      clone() {
        return { ...this, clone: this.clone };
      },
    };
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
  type ConfrontationOutcome,
} from "../ConfrontationOverlay";

const BLEEDING_THROUGH_DATA: ConfrontationData = {
  type: "the_bleeding_through",
  label: "The Bleeding-Through",
  category: "magic_confrontation",
  actors: [{ name: "Sira Mendes", role: "channeler" }],
  player_metric: { name: "sanity", current: 4, starting: 4, threshold: 10 },
  opponent_metric: {
    name: "the resonance",
    current: 6,
    starting: 0,
    threshold: 10,
  },
  beats: [],
  secondary_stats: null,
  genre_slug: "space_opera",
  mood: "haunted",
};

describe("ConfrontationOverlay — Phase 5 outcome reveal (Story 47-3 Task 5.6)", () => {
  it("renders the branch label when an outcome resolves", () => {
    const outcome: ConfrontationOutcome = {
      confrontation_id: "the_bleeding_through",
      label: "The Bleeding-Through",
      branch: "clear_win",
      mandatory_outputs: ["control_tier_advance"],
    };

    render(
      <ConfrontationOverlay data={BLEEDING_THROUGH_DATA} outcome={outcome} />,
    );

    // Branch must be surfaced explicitly per design Decision #9.
    // Either as text ("clear_win" / "Clear Win") or as a class hook —
    // we accept either via aria/data attribute or rendered text.
    const reveal = screen.getByTestId("confrontation-outcome-reveal");
    expect(reveal).toBeInTheDocument();
    expect(reveal).toHaveAttribute("data-branch", "clear_win");
  });

  it("lists every mandatory_output in the reveal panel", () => {
    const outcome: ConfrontationOutcome = {
      confrontation_id: "the_bleeding_through",
      label: "The Bleeding-Through",
      branch: "pyrrhic_win",
      mandatory_outputs: [
        "control_tier_advance",
        "status_add_scar",
        "lore_revealed",
      ],
    };

    render(
      <ConfrontationOverlay data={BLEEDING_THROUGH_DATA} outcome={outcome} />,
    );

    const reveal = screen.getByTestId("confrontation-outcome-reveal");
    // Pin each output by its stable data-output-id selector — the
    // implementation tags every list item with `data-output-id={id}`.
    // This avoids the loose substring matching that could pass
    // vacuously when the humanizer collapses outputs to generic text.
    expect(
      reveal.querySelector('[data-output-id="control_tier_advance"]'),
    ).not.toBeNull();
    expect(
      reveal.querySelector('[data-output-id="status_add_scar"]'),
    ).not.toBeNull();
    expect(
      reveal.querySelector('[data-output-id="lore_revealed"]'),
    ).not.toBeNull();
    // Sanity: exactly the three outputs we passed in (no spurious extras).
    expect(
      reveal.querySelectorAll("[data-output-id]").length,
    ).toBe(3);
  });

  it("does not render the outcome panel when no outcome is provided", () => {
    render(<ConfrontationOverlay data={BLEEDING_THROUGH_DATA} />);
    expect(
      screen.queryByTestId("confrontation-outcome-reveal"),
    ).not.toBeInTheDocument();
  });

  it("renders distinct branch styling for each of the four outcomes", () => {
    // Branch styling must be distinguishable so players can tell at a
    // glance which way the confrontation broke. We assert the data
    // attribute round-trips for all four branches.
    const branches: Array<ConfrontationOutcome["branch"]> = [
      "clear_win",
      "pyrrhic_win",
      "clear_loss",
      "refused",
    ];
    for (const branch of branches) {
      const outcome: ConfrontationOutcome = {
        confrontation_id: "the_salvage",
        label: "The Salvage",
        branch,
        mandatory_outputs: ["item_acquired"],
      };
      const { unmount } = render(
        <ConfrontationOverlay
          data={{
            ...BLEEDING_THROUGH_DATA,
            type: "the_salvage",
            label: "The Salvage",
          }}
          outcome={outcome}
        />,
      );
      const reveal = screen.getByTestId("confrontation-outcome-reveal");
      expect(reveal).toHaveAttribute("data-branch", branch);
      unmount();
    }
  });
});
