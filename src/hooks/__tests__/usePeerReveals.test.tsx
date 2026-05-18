import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePeerReveals } from "../usePeerReveals";
import type { ActionRevealEntry } from "@/types/payloads";

const reveal = (overrides: Partial<ActionRevealEntry>): ActionRevealEntry => ({
  player_id: "p2",
  character_name: "Bob",
  status: "composing",
  action: "I draw",
  aside: false,
  seq: 0,
  round: 1,
  ...overrides,
});

describe("usePeerReveals", () => {
  it("upserts composing for a peer", () => {
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 1 })
    );
    act(() => result.current.apply(reveal({ seq: 0, action: "I" })));
    act(() => result.current.apply(reveal({ seq: 1, action: "I dr" })));
    expect(result.current.reveals.get("p2")?.action).toBe("I dr");
  });

  it("drops own player_id (self-filter)", () => {
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 1 })
    );
    act(() => result.current.apply(reveal({ player_id: "p1" })));
    expect(result.current.reveals.size).toBe(0);
  });

  it("drops stale seq within same round", () => {
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 1 })
    );
    act(() => result.current.apply(reveal({ seq: 5, action: "five" })));
    act(() => result.current.apply(reveal({ seq: 3, action: "three" })));
    expect(result.current.reveals.get("p2")?.action).toBe("five");
  });

  it("submitted upsert preserves later updates", () => {
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 1 })
    );
    act(() => result.current.apply(reveal({ seq: 1, status: "composing", action: "abc" })));
    act(() => result.current.apply(reveal({ seq: 2, status: "submitted", action: "abc" })));
    expect(result.current.reveals.get("p2")?.status).toBe("submitted");
  });

  it("cleared deletes the entry", () => {
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 1 })
    );
    act(() => result.current.apply(reveal({ seq: 1 })));
    act(() =>
      result.current.apply(reveal({ status: "cleared", action: "", seq: 0 }))
    );
    expect(result.current.reveals.size).toBe(0);
  });

  it("ignores prior-round entries (current-round only)", () => {
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 5 })
    );
    act(() => result.current.apply(reveal({ round: 4, seq: 0 })));
    expect(result.current.reveals.size).toBe(0);
  });

  it("round transition flushes the map", () => {
    const { result, rerender } = renderHook(
      ({ round }) => usePeerReveals({ selfPlayerId: "p1", round }),
      { initialProps: { round: 1 } }
    );
    act(() => result.current.apply(reveal({ seq: 1, round: 1 })));
    expect(result.current.reveals.size).toBe(1);
    rerender({ round: 2 });
    expect(result.current.reveals.size).toBe(0);
  });

  it("entry from a future round auto-advances and is applied", () => {
    // Race-condition fix: an entry whose round is ahead of the hook's
    // current round must auto-flush + apply, not be silently dropped.
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 5 })
    );
    // Establish state in round 5
    act(() => result.current.apply(reveal({ round: 5, seq: 0, action: "x" })));
    expect(result.current.reveals.size).toBe(1);

    // Now an entry from round 6 arrives BEFORE the round prop updates.
    // The hook must auto-advance + apply, not drop.
    act(() => result.current.apply(reveal({ round: 6, seq: 0, action: "future" })));
    expect(result.current.reveals.size).toBe(1);
    expect(result.current.reveals.get("p2")?.action).toBe("future");
  });

  it("clear() empties the reveals map without bumping round", () => {
    // Regression: 2026-05-18 MP playtest. After narration resolved and
    // turn 2 opened, the previous round's "Laverne ✓ submitted — I walk to
    // the winch..." persisted on Shirley's tab. The reducer only flushes
    // on a round bump, but TURN_STATUS{status="resolved"} fires *before*
    // any new-round ACTION_REVEAL arrives, so the panel needs an explicit
    // clear hook to call on resolve.
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 1 })
    );
    act(() => result.current.apply(reveal({ seq: 0, status: "submitted" })));
    expect(result.current.reveals.size).toBe(1);
    act(() => result.current.clear());
    expect(result.current.reveals.size).toBe(0);
  });

  it("two peers tracked independently", () => {
    const { result } = renderHook(() =>
      usePeerReveals({ selfPlayerId: "p1", round: 1 })
    );
    act(() => result.current.apply(reveal({ player_id: "p2", character_name: "Bob", seq: 0 })));
    act(() =>
      result.current.apply(
        reveal({ player_id: "p3", character_name: "Carol", seq: 0 })
      )
    );
    expect(result.current.reveals.size).toBe(2);
    expect(result.current.reveals.get("p2")?.character_name).toBe("Bob");
    expect(result.current.reveals.get("p3")?.character_name).toBe("Carol");
  });
});
