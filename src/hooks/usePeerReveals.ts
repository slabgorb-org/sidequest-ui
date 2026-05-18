import { useCallback, useMemo, useReducer } from "react";
import type { ActionRevealEntry } from "@/types/payloads";

export type PeerReveal = ActionRevealEntry;

export interface UsePeerRevealsOptions {
  selfPlayerId: string | null | undefined;
  round: number;
}

export interface UsePeerRevealsResult {
  reveals: Map<string, PeerReveal>;
  apply: (entry: ActionRevealEntry) => void;
  /**
   * Drop every tracked reveal without touching the round counter.
   *
   * Callers wire this to TURN_STATUS{status="resolved"} so the
   * peer-submitted strip clears the moment narration completes. The
   * round-bump flush is still authoritative when a new round's
   * ACTION_REVEAL arrives, but resolved fires *before* the next round's
   * first reveal — without this explicit hook the previous round's
   * "✓ submitted" row persists into the next turn's compose phase.
   * (2026-05-18 MP playtest.)
   */
  clear: () => void;
}

interface State {
  // The round this map belongs to. Used to detect transitions.
  round: number;
  // Last seen seq per player_id — kept in state so it resets with round.
  lastSeq: Map<string, number>;
  reveals: Map<string, PeerReveal>;
}

type ReducerAction =
  | { type: "APPLY"; entry: ActionRevealEntry; selfPlayerId: string | null | undefined }
  | { type: "ADVANCE_ROUND"; round: number }
  | { type: "CLEAR" };

function reducer(state: State, action: ReducerAction): State {
  switch (action.type) {
    case "ADVANCE_ROUND":
      return { round: action.round, lastSeq: new Map(), reveals: new Map() };

    case "CLEAR":
      // Preserve the round counter — a subsequent same-round
      // ACTION_REVEAL would otherwise be treated as a back-in-time
      // entry and dropped. Only the visible reveal map + per-player
      // seq tracking reset.
      if (state.reveals.size === 0 && state.lastSeq.size === 0) return state;
      return { ...state, lastSeq: new Map(), reveals: new Map() };

    case "APPLY": {
      const { entry, selfPlayerId } = action;

      if (entry.player_id === selfPlayerId) return state;

      // Self-advance: an entry from a future round implicitly flushes
      // prior state. Mirrors the round-flush failsafe but is driven by
      // the entry itself, not by an external round prop. This avoids the
      // race where the screen's round counter lags behind the entry that
      // triggered its update.
      let working: State = state;
      if (entry.round > state.round) {
        working = { round: entry.round, lastSeq: new Map(), reveals: new Map() };
      } else if (entry.round < state.round) {
        // Prior-round entry — drop.
        return state;
      }

      if (entry.status === "cleared") {
        if (!working.reveals.has(entry.player_id)) return working;
        const reveals = new Map(working.reveals);
        reveals.delete(entry.player_id);
        const lastSeq = new Map(working.lastSeq);
        lastSeq.delete(entry.player_id);
        return { ...working, reveals, lastSeq };
      }

      const prevSeq = working.lastSeq.get(entry.player_id);
      if (prevSeq !== undefined && entry.seq <= prevSeq) return working;

      const lastSeq = new Map(working.lastSeq);
      lastSeq.set(entry.player_id, entry.seq);
      const reveals = new Map(working.reveals);
      reveals.set(entry.player_id, { ...entry });
      return { ...working, reveals, lastSeq };
    }
  }
}

/**
 * Track peer reveals (composing/submitted) for the current round.
 *
 * Drops self, drops non-monotonic seq within (player_id, round), deletes
 * on cleared, flushes the entire map on round transition. ADR-036
 * Action Visibility Model.
 *
 * Round-transition flush is a failsafe: server emits cleared on dispatch
 * for every party member, but if a cleared message is dropped/lost,
 * advancing round still wipes stale state.
 *
 * All mutable state (reveals, lastSeq, tracked round) lives in the reducer
 * so no refs are needed and no effects touch state — satisfying the React
 * Compiler lint rules.
 */
export function usePeerReveals({
  selfPlayerId,
  round,
}: UsePeerRevealsOptions): UsePeerRevealsResult {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    round,
    lastSeq: new Map<string, number>(),
    reveals: new Map<string, PeerReveal>(),
  }));

  // Flush on round transition: dispatch during render is the React-blessed
  // "derived state reset" pattern (equivalent to getDerivedStateFromProps).
  // We return the flushed map immediately so the caller sees an empty map
  // on this render without waiting for a re-render cycle.
  //
  // Only flush when the prop is AHEAD of internal state. When state is
  // ahead (because APPLY self-advanced for a future-round entry before the
  // consumer's round prop caught up), we keep the self-advanced state —
  // flushing back would silently drop the very entry that triggered the
  // advance. Both paths converge once the prop catches up.
  const activeReveals = useMemo(() => {
    if (round > state.round) {
      dispatch({ type: "ADVANCE_ROUND", round });
      return new Map<string, PeerReveal>();
    }
    return state.reveals;
  }, [state, round]);

  const apply = useCallback(
    (entry: ActionRevealEntry) => {
      dispatch({ type: "APPLY", entry, selfPlayerId });
    },
    [selfPlayerId]
  );

  const clear = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  return { reveals: activeReveals, apply, clear };
}
