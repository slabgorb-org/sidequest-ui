/**
 * Story 153-30 — [MP-CONFRONTATION-ROSTER-VS-DISPLAY]
 *
 * The confrontation header roster used to join EVERY adjacent combatant with
 * "vs", so two allied PCs read as if they opposed each other:
 *
 *   "Brann vs Vesna vs The Thing That Learned Your Name"
 *
 * (verbatim from the 2026-06-20 full-stack playtest). The separate "Them" block
 * already identifies the real opponent; only the roster join was wrong.
 *
 * Expected: allies grouped on one side, "vs" rendered ONLY across the genuine
 * player↔opponent faction boundary (ADR-116 — the dial has an "Other"):
 *
 *   "Brann · Vesna  vs  The Thing That Learned Your Name"
 *
 * Grouping is driven by the existing `EncounterActor.side` field — the same
 * field the sibling `ThemPanel` already consumes (it is reliably populated).
 * These tests render the real `ConfrontationOverlay` and assert on the rendered
 * DOM (count + placement of the "vs" node), per the ui CLAUDE.md rule against
 * source-text wiring tests.
 */
import { render, screen, within } from "@testing-library/react";
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

import { ConfrontationOverlay, type ConfrontationData, type EncounterActor } from "@/components/ConfrontationOverlay";

// Base fixture (hp_depletion / WN shape, mirrors confrontation-commitment-102-4).
// Only `actors` varies per test.
function makeData(actors: EncounterActor[]): ConfrontationData {
  return {
    type: "combat",
    label: "Blade-work",
    category: "combat",
    actors,
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
  } as ConfrontationData;
}

function renderOverlay(data: ConfrontationData) {
  return render(<ConfrontationOverlay data={data} playerId="player-1" />);
}

// The roster lives inside the dial-scoreboard; scope every query there so the
// ThemPanel's own opponent ActorChip never leaks into the assertions.
function roster() {
  return within(screen.getByTestId("dial-scoreboard"));
}

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

describe("ConfrontationOverlay roster faction grouping (153-30)", () => {
  it("renders 'vs' once at the player↔opponent boundary, never between two allied PCs", () => {
    renderOverlay(
      makeData([
        { name: "Brann", role: "combatant", side: "player" },
        { name: "Vesna", role: "combatant", side: "player" },
        { name: "The Thing That Learned Your Name", role: "horror", side: "opponent" },
      ]),
    );

    // Exactly one "vs" in the whole roster (the finding showed two).
    expect(roster().getAllByText("vs")).toHaveLength(1);

    // ...and it sits AFTER both player chips and BEFORE the opponent chip.
    // Scope the title lookups to the roster — the opponent's chip also renders
    // in the ThemPanel, so an unscoped getByTitle would match two nodes.
    const vs = roster().getByText("vs");
    const brann = roster().getByTitle(/^Brann —/);
    const vesna = roster().getByTitle(/^Vesna —/);
    const thing = roster().getByTitle(/^The Thing That Learned Your Name —/);

    // vs follows both allies in document order
    expect(brann.compareDocumentPosition(vs) & FOLLOWING).toBeTruthy();
    expect(vesna.compareDocumentPosition(vs) & FOLLOWING).toBeTruthy();
    // opponent follows vs
    expect(vs.compareDocumentPosition(thing) & FOLLOWING).toBeTruthy();
  });

  it("renders a single 'vs' for the simple one-PC-vs-one-opponent roster", () => {
    renderOverlay(
      makeData([
        { name: "Brann", role: "combatant", side: "player" },
        { name: "The Thing That Learned Your Name", role: "horror", side: "opponent" },
      ]),
    );
    expect(roster().getAllByText("vs")).toHaveLength(1);
  });

  it("renders no 'vs' when every actor is on the same (player) side", () => {
    renderOverlay(
      makeData([
        { name: "Brann", role: "combatant", side: "player" },
        { name: "Vesna", role: "combatant", side: "player" },
      ]),
    );
    expect(roster().queryAllByText("vs")).toHaveLength(0);
  });

  it("invents no false 'vs' when `side` is absent on a legacy payload", () => {
    renderOverlay(
      makeData([
        { name: "Brann", role: "combatant" },
        { name: "Vesna", role: "combatant" },
        { name: "The Thing That Learned Your Name", role: "horror" },
      ]),
    );
    // No reliable faction boundary → collapse to a single no-"vs" group, never a wrong "vs".
    expect(roster().queryAllByText("vs")).toHaveLength(0);
  });

  it("keeps every roster ActorChip rendering after grouping", () => {
    renderOverlay(
      makeData([
        { name: "Brann", role: "combatant", side: "player" },
        { name: "Vesna", role: "combatant", side: "player" },
        { name: "The Thing That Learned Your Name", role: "horror", side: "opponent" },
      ]),
    );
    // 3 roster chips (the ThemPanel's own opponent chip is outside dial-scoreboard).
    expect(roster().getAllByTestId("actor-portrait")).toHaveLength(3);
  });
});
