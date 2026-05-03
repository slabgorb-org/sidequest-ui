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
  | { type: "ADVANCE_ROUND"; round: number };

function reducer(state: State, action: ReducerAction): State {
  switch (action.type) {
    case "ADVANCE_ROUND":
      return { round: action.round, lastSeq: new Map(), reveals: new Map() };

    case "APPLY": {
      const { entry, selfPlayerId } = action;

      if (entry.player_id === selfPlayerId) return state;
      if (entry.round !== state.round) return state;

      if (entry.status === "cleared") {
        if (!state.reveals.has(entry.player_id)) return state;
        const reveals = new Map(state.reveals);
        reveals.delete(entry.player_id);
        const lastSeq = new Map(state.lastSeq);
        lastSeq.delete(entry.player_id);
        return { ...state, reveals, lastSeq };
      }

      const prevSeq = state.lastSeq.get(entry.player_id);
      if (prevSeq !== undefined && entry.seq <= prevSeq) return state;

      const lastSeq = new Map(state.lastSeq);
      lastSeq.set(entry.player_id, entry.seq);
      const reveals = new Map(state.reveals);
      reveals.set(entry.player_id, { ...entry });
      return { ...state, reveals, lastSeq };
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
  const activeReveals = useMemo(() => {
    if (state.round !== round) {
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

  return { reveals: activeReveals, apply };
}
