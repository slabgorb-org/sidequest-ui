/**
 * DeathBanner — surfaces a PC's death/incapacitation and offers a re-roll.
 *
 * sq-playtest 2026-06-07 (heavy_metal/barsoom-3, blocking): a PC the genre
 * lethality policy ruled dead kept full agency for four rounds because the UI
 * never told the player they were dead. The server now refuses a downed PC's
 * actions (input is locked alongside this banner); this is the player-facing
 * surface — an unambiguous death notice and, when the server allows it, a
 * one-click path to a fresh character (the operator reports players re-roll
 * within seconds once they understand).
 */

export interface DeathBannerProps {
  /** Set when the local PC is incapacitated; null hides the banner. */
  incapacitation: {
    characterName: string;
    headline: string;
    verdict: string;
    canReroll: boolean;
  } | null;
  /** Invoked by the re-roll CTA — returns to the lobby to start fresh. */
  onReroll: () => void;
}

export function DeathBanner({ incapacitation, onReroll }: DeathBannerProps) {
  if (incapacitation === null) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="death-banner"
      className="bg-destructive/20 border-b border-destructive/40 text-destructive-foreground px-4 py-3 flex items-center justify-between gap-3"
    >
      <div className="flex flex-col">
        <span className="text-sm font-semibold tracking-wide">{incapacitation.headline}</span>
        <span className="text-xs opacity-80">
          Your character is out of the action. You can no longer act in this scene.
        </span>
      </div>
      {incapacitation.canReroll && (
        <button
          type="button"
          onClick={onReroll}
          data-testid="death-banner-reroll"
          className="text-xs uppercase tracking-wider px-3 py-1 rounded border border-destructive/50 hover:bg-destructive/30"
        >
          New character
        </button>
      )}
    </div>
  );
}
