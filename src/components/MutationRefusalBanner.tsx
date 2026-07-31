/**
 * MutationRefusalBanner — surfaces a refused AWN mutation use to the table.
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
 */

export interface MutationRefusalBannerProps {
  /** Set on MUTATION_REFUSED; null hides the banner. */
  refusal: {
    actor: string;
    mutationId: string;
    reason: string;
  } | null;
  onDismiss: () => void;
}

export function MutationRefusalBanner({ refusal, onDismiss }: MutationRefusalBannerProps) {
  if (refusal === null) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="mutation-refusal-banner"
      className="bg-destructive/15 border-b border-destructive/30 text-destructive-foreground px-4 py-2 flex items-center justify-between gap-3"
    >
      <span className="text-sm">
        {refusal.actor}&rsquo;s <strong>{refusal.mutationId}</strong> was refused — {refusal.reason}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="mutation-refusal-dismiss"
        aria-label="Dismiss mutation refusal notice"
        className="text-xs uppercase tracking-wider px-3 py-1 rounded hover:bg-destructive/20"
      >
        Dismiss
      </button>
    </div>
  );
}
