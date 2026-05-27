import type { PeerReveal } from "@/hooks/usePeerReveals";

export interface PeerRevealListProps {
  reveals: Map<string, PeerReveal>;
  /**
   * Stable ordering — array of player_ids in seat order. Rows render in
   * this order regardless of insertion. Peers not in partyOrder are
   * appended after, in iteration order from `reveals`.
   */
  partyOrder: string[];
  /**
   * Server-authoritative sealed player_ids (derived from TURN_STATUS).
   * If a reveal's player_id is in this set, the row renders as submitted
   * regardless of `r.status` — defends against ACTION_REVEAL drop/race
   * where the composing→submitted transition didn't reach this client
   * but the sealed-letter barrier already recorded the seal. Without
   * this, the PeerRevealList row can disagree with the TurnStatusPanel's
   * "✓ Sealed" indicator (sq-playtest 2026-05-15 [UX] two-banner mismatch).
   */
  sealedPlayerIds?: ReadonlySet<string>;
}

export function PeerRevealList({
  reveals,
  partyOrder,
  sealedPlayerIds,
}: PeerRevealListProps) {
  if (reveals.size === 0) return null;

  const ordered: PeerReveal[] = [];
  for (const pid of partyOrder) {
    const r = reveals.get(pid);
    if (r) ordered.push(r);
  }
  for (const [pid, r] of reveals) {
    if (!partyOrder.includes(pid)) ordered.push(r);
  }

  return (
    <div
      data-testid="peer-reveal-list"
      role="status"
      aria-live="polite"
      className="space-y-1 mb-1"
    >
      {ordered.map((r) => {
        const effectiveSubmitted =
          r.status === "submitted" || (sealedPlayerIds?.has(r.player_id) ?? false);
        return (
        <div
          key={r.player_id}
          data-testid={`peer-reveal-row-${r.player_id}`}
          data-status={r.status}
          data-effective-submitted={effectiveSubmitted ? "true" : "false"}
          className={`flex flex-col gap-0.5 px-3 py-1.5 rounded-md text-sm border-l-4 motion-reduce:transition-none text-foreground ${
            effectiveSubmitted
              ? "border-l-emerald-500 bg-emerald-500/10"
              : "border-l-amber-500 bg-amber-500/10"
          }`}
        >
          <span
            data-testid="peer-reveal-header"
            className={`text-xs uppercase tracking-wide font-medium ${
              effectiveSubmitted ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            {effectiveSubmitted
              ? `${r.character_name} ✓ Sealed`
              : `${r.character_name} Composing…`}
          </span>
          <span
            data-aside={r.aside ? "true" : "false"}
            className={r.aside ? "italic text-muted-foreground" : ""}
          >
            {r.aside ? `(${r.action})` : r.action}
          </span>
        </div>
        );
      })}
    </div>
  );
}
