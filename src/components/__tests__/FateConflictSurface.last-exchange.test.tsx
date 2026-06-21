/**
 * FATE-CONFLICT-SEQUENCE-OPAQUE (sq-playtest 2026-06-20, Keith-flagged HIGH).
 *
 * The attack→defend exchange "silently returns to my turn" with no legible outcome
 * — the only feedback was narrator prose. The server now projects a per-action
 * resolution ledger onto `FATE_STATE.conflict.last_exchange` (the derived
 * attacker/defender totals + outcome; NPC dice hidden per ADR-148, totals shown).
 * This pins that the surface RENDERS it as a "Last Exchange" section:
 *
 *   AC1  a PC attack line reads "You attack <skill> <total> → <Other> defends
 *        <skill> <total> →" + a colored outcome detail.
 *   AC2  an NPC attack on the PC reads "<Other> attacks ... → you defend ... →" +
 *        the outcome (the 'you defend Will = N → no harm' half).
 *   AC3  no `last_exchange` → no ledger section (back-compat / between exchanges).
 *
 * R3F / drei / dice-lib mocked exactly as the sibling FateConflictSurface tests.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type {
  FateCharacterEntry,
  FateConflictParticipant,
  FateExchangeLine,
  FateStatePayload,
} from "@/types/payloads";

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
  replayThrowParams: () => ({
    position: [0, 0.86, 0],
    rotation: [0, 0, 0],
    linearVelocity: [0, 4, -1],
    angularVelocity: [0.5, 0.5, 0.5],
  }),
}));

import { FateConflictSurface } from "../FateConflictSurface";

const ME: FateCharacterEntry = {
  name: "Alice",
  fate_points: 3,
  refresh: 3,
  skills: [
    { name: "Rapport", rating: 3, ladder: "Good" },
    { name: "Will", rating: 2, ladder: "Fair" },
  ],
  aspects: [],
  stress: { physical: [], mental: [] },
  consequences: [],
};

const PARTICIPANTS: FateConflictParticipant[] = [
  { name: "Alice", side: "player", committed: false, stress: {}, consequences: [] },
  { name: "Queen", side: "opponent", committed: false, stress: { mental: [] }, consequences: [] },
];

function fateStateWith(lastExchange: FateExchangeLine[]): FateStatePayload {
  return {
    characters: [ME],
    scene_aspects: [],
    conflict: { active: true, participants: PARTICIPANTS, last_exchange: lastExchange },
  };
}

function renderSurface(fateState: FateStatePayload) {
  return render(
    <FateConflictSurface
      fateState={fateState}
      fateRoll={null}
      ruleset="fate"
      actorName="Alice"
      onFateAction={vi.fn()}
      onFateThrow={vi.fn()}
    />,
  );
}

describe("FateConflictSurface — last-exchange ledger (FATE-CONFLICT-SEQUENCE-OPAQUE)", () => {
  it("renders the PC's attack with the derived attacker/defender math and outcome (AC1)", () => {
    renderSurface(
      fateStateWith([
        {
          actor: "Alice",
          action: "attack",
          skill: "Rapport",
          target: "Queen",
          defense_skill: "Will",
          actor_total: 3,
          opposition_total: 1,
          shifts: 2,
          outcome: "absorbed",
          detail: "absorbed (2 shifts)",
        },
      ]),
    );

    const section = screen.getByTestId("fate-last-exchange");
    const line = within(section).getByTestId("fate-last-exchange-line");
    // "You" localization + both totals shown + outcome detail present.
    expect(line.textContent).toContain("You attack Rapport 3");
    expect(line.textContent).toContain("Queen defends Will 1");
    expect(line.textContent).toContain("absorbed (2 shifts)");
    expect(line.getAttribute("data-outcome")).toBe("absorbed");
  });

  it("renders the NPC's attack as 'you defend' with the outcome (AC2)", () => {
    renderSurface(
      fateStateWith([
        {
          actor: "Queen",
          action: "attack",
          skill: "Provoke",
          target: "Alice",
          defense_skill: "Will",
          actor_total: 2,
          opposition_total: 4,
          shifts: -2,
          outcome: "miss",
          detail: "no harm",
        },
      ]),
    );

    const line = screen.getByTestId("fate-last-exchange-line");
    expect(line.textContent).toContain("Queen attacks Provoke 2");
    expect(line.textContent).toContain("you defend Will 4");
    expect(line.textContent).toContain("no harm");
  });

  it("renders one row per resolved action, both directions of the exchange", () => {
    renderSurface(
      fateStateWith([
        {
          actor: "Alice",
          action: "attack",
          skill: "Rapport",
          target: "Queen",
          defense_skill: "Will",
          actor_total: 4,
          opposition_total: 1,
          shifts: 3,
          outcome: "absorbed",
          detail: "absorbed (3 shifts)",
        },
        {
          actor: "Queen",
          action: "attack",
          skill: "Provoke",
          target: "Alice",
          defense_skill: "Will",
          actor_total: 2,
          opposition_total: 4,
          shifts: -2,
          outcome: "miss",
          detail: "no harm",
        },
      ]),
    );

    expect(screen.getAllByTestId("fate-last-exchange-line")).toHaveLength(2);
  });

  it("renders NO ledger section when there is no last_exchange (AC3)", () => {
    renderSurface(fateStateWith([]));
    expect(screen.queryByTestId("fate-last-exchange")).toBeNull();
  });
});
