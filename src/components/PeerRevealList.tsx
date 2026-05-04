import type { PeerReveal } from "@/hooks/usePeerReveals";

export interface PeerRevealListProps {
  reveals: Map<string, PeerReveal>;
  /**
   * Stable ordering — array of player_ids in seat order. Rows render in
   * this order regardless of insertion. Peers not in partyOrder are
   * appended after, in iteration order from `reveals`.
   */
  partyOrder: string[];
}

export function PeerRevealList({ reveals, partyOrder }: PeerRevealListProps) {
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
      {ordered.map((r) => (
        <div
          key={r.player_id}
          data-testid={`peer-reveal-row-${r.player_id}`}
          data-status={r.status}
          className={`flex flex-col gap-0.5 px-3 py-1.5 rounded-md text-sm border-l-4 motion-reduce:transition-none ${
            r.status === "submitted"
              ? "border-l-emerald-500 bg-emerald-500/5 text-emerald-100/90"
              : "border-l-amber-500/60 bg-amber-500/5 text-amber-100/80"
          }`}
        >
          <span
            data-testid="peer-reveal-header"
            className="text-xs uppercase tracking-wide opacity-70"
          >
            {r.status === "submitted"
              ? `${r.character_name} ✓ submitted`
              : `${r.character_name} is composing`}
          </span>
          <span
            data-aside={r.aside ? "true" : "false"}
            className={r.aside ? "italic text-muted-foreground" : ""}
          >
            {r.aside ? `(${r.action})` : r.action}
          </span>
        </div>
      ))}
    </div>
  );
}
