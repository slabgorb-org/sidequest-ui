/**
 * Story 126-29 (RED) — gate the proactive tiles on the SERVER-AUTHORITATIVE
 * committed bool, not the transient ``sealedWaiting`` prop.
 *
 * The bug (#403): today the four proactive controls (Overcome / Create Advantage /
 * Attack / Concede) and the ``fate-sealed-hint`` are driven only by ``sealedWaiting``
 * — a transient client flag that does NOT survive a reconnect. On a RESUMED
 * mid-exchange conflict the local PC has already sealed an action server-side, but
 * ``sealedWaiting`` is false, so the surface re-offers the tiles and the server
 * (correctly) rejects the throw.
 *
 * The fix: FATE_STATE now carries ``participant.committed`` (server story half). The
 * surface must read the LOCAL PC's participant and, when ``committed`` is true,
 * disable the proactive tiles and show the existing ``fate-sealed-hint`` — independent
 * of ``sealedWaiting``, so the gate is resume-safe.
 *
 * FAIL today: the surface ignores ``participant.committed`` entirely.
 *
 * R3F / drei / dice-lib are mocked exactly as FateConflictSurface.test.tsx mocks them
 * (no WebGL in jsdom).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FateStatePayload } from "@/types/payloads";

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

const PROACTIVE_TESTIDS = [
  "fate-action-overcome",
  "fate-action-create_advantage",
  "fate-action-attack",
  "fate-action-concede",
] as const;

/** A Fate state with an ACTIVE conflict. ``selfCommitted`` / ``foeCommitted`` set the
 *  server-projected committed bool per side; ``includeSelf`` omits the local PC from
 *  the participant list (the TS undefined-handling edge). */
function fateState(
  opts: { selfCommitted?: boolean; foeCommitted?: boolean; includeSelf?: boolean } = {},
): FateStatePayload {
  const { selfCommitted = false, foeCommitted = false, includeSelf = true } = opts;
  const participants = [
    ...(includeSelf
      ? [{ name: "Sam Spadework", side: "player", committed: selfCommitted }]
      : []),
    { name: "The Fat Man", side: "opponent", committed: foeCommitted },
  ];
  return {
    characters: [
      {
        name: "Sam Spadework",
        fate_points: 3,
        refresh: 3,
        skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
        aspects: [{ text: "Cornered Rat", kind: "trouble", free_invokes: 0 }],
        stress: { physical: [{ value: 1, checked: false }], mental: [] },
        consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
      },
    ],
    scene_aspects: [],
    // `committed` is the field the server story half adds to FateConflictParticipant.
    conflict: { active: true, participants } as FateStatePayload["conflict"],
  };
}

function renderSurface(
  props: Partial<React.ComponentProps<typeof FateConflictSurface>> = {},
) {
  return render(
    <FateConflictSurface
      fateState={fateState()}
      fateRoll={null}
      ruleset="fate"
      actorName="Sam Spadework"
      onFateAction={vi.fn()}
      onFateThrow={vi.fn()}
      {...props}
    />,
  );
}

describe("FateConflictSurface — committed-this-exchange tile gate (Story 126-29)", () => {
  it("disables all proactive tiles when the LOCAL PC's participant is committed", () => {
    // sealedWaiting is left FALSE on purpose — the gate must come from the
    // server-projected committed bool, the resume-safe signal (#403).
    renderSurface({ fateState: fateState({ selfCommitted: true }) });
    for (const id of PROACTIVE_TESTIDS) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
  });

  it("shows the fate-sealed-hint when the local PC is committed (sealedWaiting false)", () => {
    renderSurface({ fateState: fateState({ selfCommitted: true }) });
    const hint = screen.getByTestId("fate-sealed-hint");
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveTextContent(/Committed/i);
  });

  it("leaves the proactive tiles ENABLED when the local PC has not committed", () => {
    // Negative guard: the gate must not disable for an un-committed PC (no over-gating).
    renderSurface({ fateState: fateState({ selfCommitted: false }) });
    for (const id of PROACTIVE_TESTIDS) {
      expect(screen.getByTestId(id)).toBeEnabled();
    }
    expect(screen.queryByTestId("fate-sealed-hint")).not.toBeInTheDocument();
  });

  it("gates on the LOCAL PC's commit, not another participant's", () => {
    // The OPPONENT is committed but the local PC is not — the local PC's tiles must
    // stay live (the gate reads `participants[me].committed`, never any participant's).
    renderSurface({ fateState: fateState({ selfCommitted: false, foeCommitted: true }) });
    expect(screen.getByTestId("fate-action-attack")).toBeEnabled();
    expect(screen.queryByTestId("fate-sealed-hint")).not.toBeInTheDocument();
  });

  it("does not disable when the local PC is absent from participants (undefined-safe)", () => {
    // TS null/undefined handling: participants.find(me) is undefined → committed
    // resolves to false (`?? false`), tiles stay enabled, no crash.
    renderSurface({ fateState: fateState({ includeSelf: false }) });
    expect(screen.getByTestId("fate-action-attack")).toBeEnabled();
  });
});
