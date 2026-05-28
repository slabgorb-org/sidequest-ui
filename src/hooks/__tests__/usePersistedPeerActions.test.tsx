/**
 * Story 71-4 — usePersistedPeerActions: the snapshot seam (Architect
 * CORRECTED-FINAL contract).
 *
 * Contract:
 *   usePersistedPeerActions() → {
 *     byRound: Map<number, ActionRevealEntry[]>;
 *     capture(round, reveals): filters status==="submitted", dedups by
 *       player_id within the round, accumulates into byRound[round];
 *     reset(): clears byRound;
 *   }
 *
 * `reveals` is the usePeerReveals reveals map (Map<player_id, ActionRevealEntry>).
 * capture() is called at TURN_STATUS{resolved} BEFORE usePeerReveals.clear()
 * fires — that ordering is what lets the submitted peer actions survive into
 * the persistent transcript.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedPeerActions } from "../usePersistedPeerActions";
import type { ActionRevealEntry } from "@/types/payloads";

function entry(overrides: Partial<ActionRevealEntry> & Pick<ActionRevealEntry, "player_id">): ActionRevealEntry {
  return {
    character_name: overrides.character_name ?? overrides.player_id,
    status: "submitted",
    action: "act",
    aside: false,
    seq: 1,
    round: 1,
    ...overrides,
  };
}

describe("71-4 usePersistedPeerActions — snapshot seam", () => {
  it("capture stores submitted reveals only (composing excluded)", () => {
    const { result } = renderHook(() => usePersistedPeerActions());
    const reveals = new Map<string, ActionRevealEntry>([
      ["p2", entry({ player_id: "p2", action: "I cover the hall", status: "submitted", round: 1 })],
      ["p3", entry({ player_id: "p3", action: "I hesitate", status: "composing", round: 1 })],
    ]);

    act(() => result.current.capture(1, reveals));

    const round1 = result.current.byRound.get(1) ?? [];
    expect(round1.map((e) => e.player_id)).toEqual(["p2"]);
    expect(round1[0].action).toBe("I cover the hall");
  });

  it("dedups by player_id within a round across repeated captures", () => {
    const { result } = renderHook(() => usePersistedPeerActions());
    const first = new Map<string, ActionRevealEntry>([
      ["p2", entry({ player_id: "p2", action: "I cover the hall", seq: 1, round: 1 })],
    ]);
    const resubmit = new Map<string, ActionRevealEntry>([
      ["p2", entry({ player_id: "p2", action: "I cover the hall", seq: 2, round: 1 })],
    ]);

    act(() => result.current.capture(1, first));
    act(() => result.current.capture(1, resubmit));

    const round1 = result.current.byRound.get(1) ?? [];
    expect(round1.filter((e) => e.player_id === "p2")).toHaveLength(1);
  });

  it("keeps captures from different rounds separate", () => {
    const { result } = renderHook(() => usePersistedPeerActions());
    act(() => result.current.capture(1, new Map([["p2", entry({ player_id: "p2", round: 1 })]])));
    act(() => result.current.capture(2, new Map([["p3", entry({ player_id: "p3", round: 2 })]])));

    expect((result.current.byRound.get(1) ?? []).map((e) => e.player_id)).toEqual(["p2"]);
    expect((result.current.byRound.get(2) ?? []).map((e) => e.player_id)).toEqual(["p3"]);
  });

  it("reset clears all captured rounds", () => {
    const { result } = renderHook(() => usePersistedPeerActions());
    act(() => result.current.capture(1, new Map([["p2", entry({ player_id: "p2", round: 1 })]])));
    act(() => result.current.reset());

    expect(result.current.byRound.size).toBe(0);
  });
});
