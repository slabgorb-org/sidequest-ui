/**
 * Pure helpers for deriving multiplayer turn-state UI from TURN_STATUS roster.
 *
 * Two concerns drive these helpers, both surfaced by sq-playtest 2026-05-12:
 *
 *   1. `peersOutstanding` (banner copy "Waiting on X + N other to act…") used
 *      to derive its "submitted" set as `new Set(entries.map(e => e.player_id))`
 *      — every player_id in the roster, regardless of status. Pre-canonical-
 *      roster that worked because the legacy accumulator only pushed an entry
 *      per submission; the set was implicitly status-filtered. The canonical
 *      roster (server fix `fix/turn-status-canonical-roster-per-recipient`)
 *      now carries every PLAYING peer with `pending` or `submitted`, so the
 *      old set-by-presence treats pending peers as already-submitted and
 *      `peersOutstanding` snaps to empty after the first broadcast. Host
 *      regression: banner skips "waiting-on-peers" entirely.
 *
 *   2. `PeerRevealList` rows used to read `PeerReveal.status` directly from
 *      `ACTION_REVEAL`-driven state. When the ACTION_REVEAL composing event
 *      lands AFTER the submitted (server-side ordering or client late-fire
 *      race), the row sticks at "is composing" while the banner above
 *      correctly says "X acted". Sebastien-axis self-contradiction.
 *      TURN_STATUS is server-authoritative; ACTION_REVEAL is a best-effort
 *      visibility channel — merge the authoritative submitted status in so
 *      a stale ACTION_REVEAL never outvotes it.
 */

import type { TurnStatusEntry } from "@/types/payloads";

import type { PeerReveal } from "@/hooks/usePeerReveals";

/**
 * Players the server reports as having sealed this round. Pending peers in
 * the canonical roster are NOT counted — they're still composing.
 *
 * `auto_resolved` counts as submitted: the server already advanced past
 * them and the merged dispatch ran without their input, so the banner
 * should not keep waiting on them.
 */
export function computeSubmittedPlayerIds(
  entries: readonly TurnStatusEntry[],
): Set<string> {
  const submitted = new Set<string>();
  for (const e of entries) {
    if (e.status === "submitted" || e.status === "auto_resolved") {
      submitted.add(e.player_id);
    }
  }
  return submitted;
}

/**
 * Merge TURN_STATUS authoritative submitted status into the ACTION_REVEAL
 * peer-reveal map. Two concerns, both serving ADR-036 WAIT-phase visibility:
 *
 *   1. **Status override.** If TURN_STATUS says a player has sealed but the
 *      ACTION_REVEAL still has them "composing", override to "submitted" so
 *      the row label matches the banner.
 *
 *   2. **Text recovery (Story 126-4).** The peer's action text has exactly one
 *      best-effort carrier — the ACTION_REVEAL frame. A submitted-only turn
 *      (fast typist / paste-and-Enter, no preceding `composing`) rides a single
 *      frame; if it is missed (the `broadcast.recipient_dropped` "seal frame
 *      vanished" churn, etc.) the row never exists and the WAIT strip shows the
 *      `✓ Sealed` chip with no text. The authoritative roster carries the
 *      sealed action text (server sources it from `pending_actions`); when a
 *      sealed player has text on the roster but NO reveal row, synthesize a
 *      display row so the strip recovers the text. This makes peer text
 *      reliable, not best-effort-only.
 *
 * Returns the input map identity-unchanged when no overrides are needed —
 * lets the caller's `useMemo` dep array keep referential stability.
 */
export function mergePeerRevealsWithSubmittedStatus(
  reveals: ReadonlyMap<string, PeerReveal>,
  entries: readonly TurnStatusEntry[],
): Map<string, PeerReveal> {
  const submitted = computeSubmittedPlayerIds(entries);
  if (submitted.size === 0) return reveals as Map<string, PeerReveal>;

  let merged: Map<string, PeerReveal> | null = null;
  const ensureMerged = (): Map<string, PeerReveal> => {
    if (merged === null) merged = new Map(reveals);
    return merged;
  };

  // (1) Upgrade an existing row whose ACTION_REVEAL status lags the seal.
  for (const [pid, reveal] of reveals) {
    if (submitted.has(pid) && reveal.status !== "submitted") {
      ensureMerged().set(pid, { ...reveal, status: "submitted" });
    }
  }

  // (2) Recover the action text for a sealed peer with no reveal row. Only when
  // the roster actually carries text — never synthesize a blank row.
  for (const entry of entries) {
    if (
      (entry.status === "submitted" || entry.status === "auto_resolved") &&
      entry.action &&
      entry.action.length > 0 &&
      !reveals.has(entry.player_id)
    ) {
      ensureMerged().set(entry.player_id, {
        player_id: entry.player_id,
        character_name: entry.character_name,
        status: "submitted",
        action: entry.action,
        aside: false,
        seq: 0,
        round: 0,
      });
    }
  }

  return merged ?? (reveals as Map<string, PeerReveal>);
}
