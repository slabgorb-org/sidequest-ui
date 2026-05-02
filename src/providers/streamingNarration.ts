/**
 * Task 16 — per-turn streaming narration accumulator.
 *
 * Tracks delta chunks and canonical text per turn_id. The display rule is:
 *   render canonical if present, else chunks.join("").
 *
 * Design notes:
 * - NarrationDelta (kind: "narration.delta") carries an explicit turn_id.
 * - The canonical NarrationMessage (type: "NARRATION") does NOT carry a
 *   turn_id on the wire; the reducer applies it to the most-recently-active
 *   streaming turn (tracked via `activeTurnId`).
 * - Once canonical is set for a turn, subsequent deltas for that turn are
 *   silently discarded (late-delta protection).
 * - State is always replaced immutably (new Map on every update).
 */

import type { NarrationDelta } from "../types/payloads";
import type { NarrationMessage } from "../types/payloads";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TurnStreamState = {
  chunks: string[];
  nextExpectedSeq: number;
  canonical: string | null;
};

export type StreamingNarrationState = {
  turns: Map<string, TurnStreamState>;
  /** The turn_id that most recently received a delta — used to route the
   *  canonical NarrationMessage which carries no turn_id. */
  activeTurnId: string | null;
  /** Timestamp (Date.now()) recorded when activeTurnId first transitioned from
   *  null/different to the current value. Used by the stall-fallback interstitial
   *  to detect when no content has arrived for 5+ seconds. Cleared to null when
   *  canonical lands (alongside activeTurnId). */
  activeTurnStartedAt: number | null;
};

export const initialStreamingState: StreamingNarrationState = {
  turns: new Map(),
  activeTurnId: null,
  activeTurnStartedAt: null,
};

// ---------------------------------------------------------------------------
// Action union
// ---------------------------------------------------------------------------

type Action = NarrationDelta | NarrationMessage;

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduceStreamingNarration(
  state: StreamingNarrationState,
  action: Action,
): StreamingNarrationState {
  // --- narration.delta ---
  if ("kind" in action && action.kind === "narration.delta") {
    const { turn_id, chunk } = action.payload;
    const existing = state.turns.get(turn_id);

    // Discard late delta if canonical is already set
    if (existing && existing.canonical !== null) {
      return state;
    }

    const prev = existing ?? { chunks: [], nextExpectedSeq: 0, canonical: null };
    const updated: TurnStreamState = {
      chunks: [...prev.chunks, chunk],
      nextExpectedSeq: prev.nextExpectedSeq + 1,
      canonical: null,
    };

    const newTurns = new Map(state.turns);
    newTurns.set(turn_id, updated);

    // Stamp activeTurnStartedAt only on the transition into a new active turn.
    // If this turn is already the active one (same turn_id), preserve the existing
    // timestamp so it reflects when the turn first opened, not each chunk arrival.
    const activeTurnStartedAt =
      state.activeTurnId === turn_id
        ? state.activeTurnStartedAt
        : Date.now();

    return {
      turns: newTurns,
      activeTurnId: turn_id,
      activeTurnStartedAt,
    };
  }

  // --- canonical NarrationMessage (type: "NARRATION") ---
  if ("type" in action && action.type === "NARRATION") {
    const text = (action.payload as { text: string }).text;
    const targetTurnId = state.activeTurnId;

    if (targetTurnId === null) {
      // No active turn — nothing to attach canonical to
      return state;
    }

    const existing = state.turns.get(targetTurnId);
    const prev = existing ?? { chunks: [], nextExpectedSeq: 0, canonical: null };
    const updated: TurnStreamState = {
      ...prev,
      canonical: text,
    };

    const newTurns = new Map(state.turns);
    newTurns.set(targetTurnId, updated);

    return {
      turns: newTurns,
      activeTurnId: null, // canonical closes the active turn
      activeTurnStartedAt: null, // clear the stall timer
    };
  }

  return state;
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

export function displayTextForTurn(
  state: StreamingNarrationState,
  turn_id: string,
): string | null {
  const turn = state.turns.get(turn_id);
  if (!turn) return null;
  return turn.canonical ?? turn.chunks.join("");
}
