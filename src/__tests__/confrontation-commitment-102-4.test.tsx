/**
 * Story 102-4 — committed-vs-waiting in the ConfrontationOverlay.
 *
 * The WN sealed round (server: wwn.round.* spans, DiceThrowOutcome
 * .commitment_pending) surfaces on the CONFRONTATION payload as
 * `committed_actors: string[]` — the player-side actor names whose Main
 * Action is sealed this round. The overlay mirrors it so the table can see
 * who the round is waiting on (ADR-036 submit-and-wait; collaborative
 * visibility, never a rush cue — Alex is the design constraint here).
 *
 * Contract pinned:
 *  - `ConfrontationData.committed_actors?: string[] | null` (wire mirror of
 *    build_confrontation_payload()["committed_actors"], pinned server-side in
 *    sidequest-server tests/integration/test_102_4_wn_sealed_round.py).
 *  - Each PLAYER-side actor renders a commitment indicator
 *    (data-testid `commitment-${name}`): /committed/i when listed,
 *    /waiting/i when not.
 *  - Opponent-side actors get NO indicator — the opponent doesn't submit;
 *    implying a closed "enemy is waiting" state would be a lie.
 *  - Legacy/dial payloads (committed_actors absent) render NO indicators —
 *    native packs keep today's presentation byte-for-byte.
 */
import { render, screen } from "@testing-library/react";
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

const WN_COMBAT: ConfrontationData = {
  type: "combat",
  label: "Blade-work",
  category: "combat",
  actors: [
    { name: "Vesska", role: "combatant", side: "player" },
    { name: "Brakka", role: "combatant", side: "player" },
    { name: "Hired Blade", role: "combatant", side: "opponent" },
  ],
  player_metric: { name: "momentum", current: 0, starting: 0, threshold: 1000000 },
  opponent_metric: { name: "momentum", current: 0, starting: 0, threshold: 1000000 },
  win_condition: "hp_depletion",
  player_hp: { current: 12, max: 12 },
  opponent_hp: { current: 10, max: 10 },
  beats: [
    { id: "committed_blow", label: "Committed Blow", kind: "strike", base: 4, stat_check: "STR", difficulty: 12 },
  ],
  secondary_stats: null,
  genre_slug: "heavy_metal",
  mood: "grim",
  committed_actors: ["Vesska"],
};

function renderOverlay(data: ConfrontationData) {
  return render(<ConfrontationOverlay data={data} playerId="player-1" />);
}

describe("ConfrontationOverlay sealed-round commitment state (102-4)", () => {
  it("marks committed player actors committed and uncommitted ones waiting", () => {
    renderOverlay(WN_COMBAT);

    const vesska = screen.getByTestId("commitment-Vesska");
    expect(vesska.textContent).toMatch(/committed/i);

    const brakka = screen.getByTestId("commitment-Brakka");
    expect(brakka.textContent).toMatch(/waiting/i);
  });

  it("renders no commitment indicator for opponent-side actors", () => {
    renderOverlay(WN_COMBAT);
    expect(screen.queryByTestId("commitment-Hired Blade")).toBeNull();
  });

  it("renders no commitment indicators on legacy payloads without committed_actors", () => {
    const { committed_actors: _omit, ...legacy } = WN_COMBAT;
    renderOverlay(legacy as ConfrontationData);
    expect(screen.queryByTestId("commitment-Vesska")).toBeNull();
    expect(screen.queryByTestId("commitment-Brakka")).toBeNull();
  });
});
