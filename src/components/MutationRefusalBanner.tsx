/**
 * MutationRefusalBanner — surfaces refused AWN mutation uses to the table.
 *
 * Story 158-57: the server already saw this refusal on the awn.mutation.refused
 * OTEL span (GM-panel-only); the round used to resolve with the player told
 * nothing at all. This is the player-facing mirror — an evident, dismissible
 * strip naming WHO was refused, WHICH mutation, and WHY (with the mechanics-
 * first math the server already computed, e.g. "limit_exhausted (per_day: 1/1)").
 * Reviewer round 1 required this be evident when it happens, not hidden behind
 * a tooltip or a panel the player has to go find — mirrors the top-of-screen
 * DeathBanner/transient-error idiom, dismissible rather than sticky since a
 * refusal (unlike a death) does not lock the seat.
 *
 * Reviewer round 3 [MEDIUM]: `run_wn_round` appends one MUTATION_REFUSED frame
 * PER doomed slot, so a single round can produce more than one — the exact MP
 * shape `test_refusal_survives_the_multiplayer_barrier` pins server-side (PC
 * A's refusal, sealed in A's own dispatch, surviving the walk inside PC B's).
 * A single nullable slot silently drops every refusal but the last, which is
 * the same "a player gets silence" bug this story exists to end. This renders
 * ALL live refusals, and dismissing one (`onDismiss(id)`) never touches the
 * others.
 */

export interface MutationRefusal {
  /** Client-generated — identifies this refusal for a targeted dismiss. Not
   * carried on the wire; the server payload has no stable identity across
   * possibly-identical concurrent refusals. */
  id: string;
  actor: string;
  mutationId: string;
  reason: string;
}

export interface MutationRefusalBannerProps {
  /** Every live (not yet dismissed) refusal this session. Empty hides the banner entirely. */
  refusals: MutationRefusal[];
  onDismiss: (id: string) => void;
}

export function MutationRefusalBanner({ refusals, onDismiss }: MutationRefusalBannerProps) {
  if (refusals.length === 0) return null;
  return (
    <div data-testid="mutation-refusal-banner-stack" className="flex flex-col">
      {refusals.map((refusal) => (
        <div
          key={refusal.id}
          role="alert"
          aria-live="assertive"
          data-testid="mutation-refusal-banner"
          data-actor={refusal.actor}
          className="bg-destructive/15 border-b border-destructive/30 text-destructive-foreground px-4 py-2 flex items-center justify-between gap-3"
        >
          <span className="text-sm">
            {refusal.actor}&rsquo;s <strong>{refusal.mutationId}</strong> was refused —{" "}
            {refusal.reason}
          </span>
          <button
            type="button"
            onClick={() => onDismiss(refusal.id)}
            data-testid="mutation-refusal-dismiss"
            aria-label={`Dismiss mutation refusal notice for ${refusal.actor}`}
            className="text-xs uppercase tracking-wider px-3 py-1 rounded hover:bg-destructive/20"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
