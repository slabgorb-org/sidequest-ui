import { useCallback, useState } from "react";
import type { ActionRevealEntry } from "@/types/payloads";

export interface UsePersistedPeerActionsResult {
  /** Per-round accumulator of persisted peer actions, keyed by round. */
  byRound: Map<number, ActionRevealEntry[]>;
  /**
   * Snapshot the (perception-filtered) peer reveals into the persistent
   * accumulator under `round`. Call at TURN_STATUS{resolved} BEFORE
   * usePeerReveals.clear() wipes the ephemeral map. Keeps submitted-only and
   * dedups one entry per (player_id) within that round. `round` is the
   * resolving round (usePeerReveals only ever holds the current round's
   * reveals, so this matches each entry's own `round`).
   */
  capture: (round: number, reveals: Map<string, ActionRevealEntry>) => void;
  /** Drop all persisted peer actions (wire to the reconnect messages-purge). */
  reset: () => void;
}

/**
 * Story 71-4: the ephemeral→persistent bridge for peer actions (Architect
 * ruling A1). `usePeerReveals` is wiped on round-advance AND explicitly
 * cleared on TURN_STATUS{resolved}; this hook persists a snapshot of the
 * submitted reveals so they survive into the narration transcript
 * post-resolution.
 *
 * The capture transform is intentionally identical to the e2e wiring Host's
 * inline bridge (peer-action-persistence-wiring-71-4.test.tsx): filter
 * submitted, dedup per (player_id, round), group by `entry.round`. Source is
 * STRICTLY the firewall-filtered reveals map (ADR-104/105) — no other origin —
 * so persisting "what was visible" can never surface "what was hidden".
 */
export function usePersistedPeerActions(): UsePersistedPeerActionsResult {
  const [byRound, setByRound] = useState<Map<number, ActionRevealEntry[]>>(
    () => new Map(),
  );

  const capture = useCallback((round: number, reveals: Map<string, ActionRevealEntry>) => {
    const submitted = Array.from(reveals.values()).filter(
      (e) => e.status === "submitted",
    );
    if (submitted.length === 0) return;
    setByRound((prev) => {
      const next = new Map(prev);
      const list = next.has(round) ? [...next.get(round)!] : [];
      for (const e of submitted) {
        if (!list.some((x) => x.player_id === e.player_id)) list.push(e);
      }
      next.set(round, list);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setByRound((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  return { byRound, capture, reset };
}
