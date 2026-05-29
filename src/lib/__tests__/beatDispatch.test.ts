import { describe, it, expect } from "vitest";
import { beatDispatchBlockReason, type BeatDispatchState } from "@/lib/beatDispatch";

// Story 67-8, Layer 3 — the beat-commit session-bound gate.
//
// The load-bearing assertion: a beat-commit is REFUSED while the session is
// unbound (server AwaitingConnect), so a DICE_THROW is never flushed into an
// OPEN-but-unbound socket and rejected `session_unbound`. Refused, not queued
// (AC4: no buffering).

const CONFRONTATION = {
  label: "High Noon Standoff",
  beats: [
    { id: "stare" },
    { id: "draw" },
  ],
};

/** A fully-dispatchable baseline: not thinking, bound, valid confrontation. */
function readyState(overrides: Partial<BeatDispatchState> = {}): BeatDispatchState {
  return {
    thinking: false,
    sessionBound: true,
    confrontationData: CONFRONTATION,
    ...overrides,
  };
}

describe("beatDispatchBlockReason — beat-commit gate (67-8)", () => {
  it("allows dispatch when bound, not thinking, and the beat exists", () => {
    expect(beatDispatchBlockReason("stare", readyState())).toBeNull();
  });

  it("BLOCKS with session_unbound when the session is not bound (AwaitingConnect)", () => {
    // This is the 67-8 fix: a valid beat on a live-but-unbound socket must not
    // be issued. Pre-Layer-3 this returned null and the DICE_THROW was sent
    // into the AwaitingConnect window → session_unbound rejection.
    const block = beatDispatchBlockReason("stare", readyState({ sessionBound: false }));
    expect(block).not.toBeNull();
    expect(block?.code).toBe("session_unbound");
  });

  it("does not buffer — an unbound valid beat is refused, signalled by a block code, never returned as dispatchable", () => {
    // The contract is refuse-and-let-the-player-retry, not queue. The function
    // has no queue/sideeffect surface; a non-null return is the refusal.
    const block = beatDispatchBlockReason("draw", readyState({ sessionBound: false }));
    expect(block?.code).toBe("session_unbound");
  });

  it("blocks while thinking (duplicate-submit guard) — precedence over session state", () => {
    const block = beatDispatchBlockReason("stare", readyState({ thinking: true, sessionBound: false }));
    expect(block?.code).toBe("thinking");
  });

  it("blocks when there is no active confrontation", () => {
    const block = beatDispatchBlockReason("stare", readyState({ confrontationData: null }));
    expect(block?.code).toBe("no_confrontation");
  });

  it("blocks an unknown beat id even when bound", () => {
    const block = beatDispatchBlockReason("nonexistent", readyState());
    expect(block?.code).toBe("unknown_beat");
  });

  it("session-bound check is the only thing standing between a valid beat and dispatch", () => {
    // Flipping ONLY sessionBound on an otherwise-dispatchable state flips the
    // outcome — proves the gate is wired to the bound signal, not vacuous.
    expect(beatDispatchBlockReason("stare", readyState({ sessionBound: true }))).toBeNull();
    expect(beatDispatchBlockReason("stare", readyState({ sessionBound: false }))?.code).toBe(
      "session_unbound",
    );
  });
});
