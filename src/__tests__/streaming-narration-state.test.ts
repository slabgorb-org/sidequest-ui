/**
 * Task 16: streamingNarration reducer — per-turn delta accumulator.
 *
 * Tests four cases:
 * 1. Appends chunks in order
 * 2. Swaps to canonical when NarrationMessage lands
 * 3. Discards late deltas after canonical is set
 * 4. displayTextForTurn helper returns canonical ?? chunks.join("")
 */

import { describe, it, expect } from "vitest";
import {
  reduceStreamingNarration,
  displayTextForTurn,
  initialStreamingState,
} from "../providers/streamingNarration";
import type { NarrationDelta } from "../types/payloads";

// Helper — build a narration.delta action
function delta(turn_id: string, chunk: string, seq: number): NarrationDelta {
  return {
    kind: "narration.delta",
    payload: { turn_id, chunk, seq },
  };
}

// Helper — build a canonical NarrationMessage (type = "NARRATION")
function canonical(text: string, player_id = "p1") {
  return {
    type: "NARRATION" as const,
    payload: { text },
    player_id,
  };
}

// ---------------------------------------------------------------------------
// Case 1: Appends chunks in order
// ---------------------------------------------------------------------------

describe("reduceStreamingNarration — chunk accumulation", () => {
  it("appends two delta chunks for the same turn_id", () => {
    let state = initialStreamingState;
    state = reduceStreamingNarration(state, delta("t-1", "Hello ", 0));
    state = reduceStreamingNarration(state, delta("t-1", "world.", 1));

    const turn = state.turns.get("t-1");
    expect(turn).toBeDefined();
    expect(turn!.chunks).toEqual(["Hello ", "world."]);
    expect(turn!.canonical).toBeNull();
    expect(turn!.nextExpectedSeq).toBe(2);
  });

  it("tracks chunks independently across different turn_ids", () => {
    let state = initialStreamingState;
    state = reduceStreamingNarration(state, delta("t-1", "Alpha", 0));
    state = reduceStreamingNarration(state, delta("t-2", "Beta", 0));

    expect(state.turns.get("t-1")!.chunks).toEqual(["Alpha"]);
    expect(state.turns.get("t-2")!.chunks).toEqual(["Beta"]);
  });
});

// ---------------------------------------------------------------------------
// Case 2: Swaps to canonical when NarrationMessage lands
// ---------------------------------------------------------------------------

describe("reduceStreamingNarration — canonical arrival", () => {
  it("sets canonical text after a delta has arrived", () => {
    let state = initialStreamingState;
    state = reduceStreamingNarration(state, delta("t-1", "Hello ", 0));

    // canonical narration has no turn_id on the wire; reducer applies it to
    // whichever turn is currently streaming (keyed by special sentinel) OR
    // to the most-recent open turn. The spec requires canonical to land on
    // the same turn — here we use a separate canonical call keyed to "t-1".
    state = reduceStreamingNarration(state, canonical("FINAL CANONICAL TEXT"));

    // The canonical narration should be stored; find it via displayTextForTurn
    // on "t-1" if the reducer matched, or check turns map directly.
    // The reducer stores canonical on the active streaming turn.
    const turn = state.turns.get("t-1");
    expect(turn).toBeDefined();
    expect(turn!.canonical).toBe("FINAL CANONICAL TEXT");
  });
});

// ---------------------------------------------------------------------------
// Case 3: Discards late deltas after canonical is set
// ---------------------------------------------------------------------------

describe("reduceStreamingNarration — late delta discard", () => {
  it("drops a delta that arrives after canonical is set", () => {
    let state = initialStreamingState;
    state = reduceStreamingNarration(state, delta("t-1", "Hello ", 0));
    state = reduceStreamingNarration(state, canonical("FINAL CANONICAL TEXT"));

    // Capture chunks count at canonical-arrival time
    const chunksAtCanonical = state.turns.get("t-1")!.chunks.length;

    // Late delta — should be discarded
    state = reduceStreamingNarration(state, delta("t-1", "LATE CHUNK", 1));

    const turn = state.turns.get("t-1");
    expect(turn!.chunks).toHaveLength(chunksAtCanonical);
    expect(turn!.chunks).not.toContain("LATE CHUNK");
  });
});

// ---------------------------------------------------------------------------
// Case 4: displayTextForTurn helper
// ---------------------------------------------------------------------------

describe("displayTextForTurn", () => {
  it("returns chunks joined when no canonical", () => {
    let state = initialStreamingState;
    state = reduceStreamingNarration(state, delta("t-1", "Hello ", 0));
    state = reduceStreamingNarration(state, delta("t-1", "world.", 1));

    expect(displayTextForTurn(state, "t-1")).toBe("Hello world.");
  });

  it("returns canonical text when canonical is set (ignores chunks)", () => {
    let state = initialStreamingState;
    state = reduceStreamingNarration(state, delta("t-1", "Hello ", 0));
    state = reduceStreamingNarration(state, canonical("FINAL CANONICAL TEXT"));

    expect(displayTextForTurn(state, "t-1")).toBe("FINAL CANONICAL TEXT");
  });

  it("returns null for unknown turn_id", () => {
    expect(displayTextForTurn(initialStreamingState, "unknown")).toBeNull();
  });
});
