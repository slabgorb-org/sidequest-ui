// Beat-commit dispatch gate (Story 67-8, Layer 3).
//
// Centralizes every precondition that must hold before a confrontation beat is
// committed into a DICE_THROW. The load-bearing one for 67-8 is `sessionBound`:
// a beat-commit must NEVER be issued while the server session is unbound
// (AwaitingConnect). The DICE_THROW would otherwise be flushed into an OPEN-
// but-unbound socket and rejected `session.message_rejected_unbound`, stranding
// the confrontation. This is a turn-barrier, not a buffer — when blocked the
// action is REFUSED (the player retries), never silently queued. That honors
// AC4 ("eliminate the loop, do not buffer-until-Playing") and No Silent
// Fallbacks: a genuinely unbound frame still rejects loudly server-side.

export type BeatBlockCode =
  | "thinking"
  | "no_confrontation"
  | "unknown_beat"
  | "session_unbound";

export interface BeatBlock {
  code: BeatBlockCode;
  /** Developer/console-facing reason. Not shown verbatim to the player. */
  logReason: string;
}

export interface BeatDispatchState {
  /** Narrator is mid-turn; a second beat would double-submit. */
  thinking: boolean;
  /**
   * The server session is bound and in Playing state — i.e. the UI has seen a
   * SESSION_EVENT `connected`/`ready` on the current socket and has not since
   * observed a drop, a re-handshake, or a `session_unbound` rejection.
   */
  sessionBound: boolean;
  /** Active confrontation, or null when none is in progress. */
  confrontationData: { label?: string; beats: ReadonlyArray<{ id: string }> } | null;
}

/**
 * Returns `null` when the beat may be dispatched, or a {@link BeatBlock}
 * describing why it must be suppressed. Precedence matches the prior inline
 * guards (thinking → confrontation present → beat exists) with the new
 * session-bound gate last, so an otherwise-valid beat attempted while unbound
 * surfaces the `session_unbound` recovery affordance rather than a generic drop.
 */
export function beatDispatchBlockReason(
  beatId: string,
  state: BeatDispatchState,
): BeatBlock | null {
  if (state.thinking) {
    return { code: "thinking", logReason: "narrator is thinking — duplicate suppressed" };
  }
  if (!state.confrontationData) {
    return { code: "no_confrontation", logReason: "no active confrontation — dropping" };
  }
  if (!state.confrontationData.beats.some((b) => b.id === beatId)) {
    return {
      code: "unknown_beat",
      logReason: `beat id "${beatId}" not in active confrontation (${state.confrontationData.label ?? "?"})`,
    };
  }
  if (!state.sessionBound) {
    return {
      code: "session_unbound",
      logReason: "session not bound (AwaitingConnect) — awaiting server ready before commit",
    };
  }
  return null;
}

// Story 106-4 Part C: transient inventory item-use beats ("Drink <potion>").
// The server appends these to the confrontation beat menu from the actor's
// carried consumables (mirrors sidequest-server beat_filter.ITEM_USE_BEAT_PREFIX).
// They are AUTO-SUCCESS, no-roll actions: they carry no server-authored
// `difficulty` and must commit WITHOUT the d20 dice tray.
export const ITEM_USE_BEAT_PREFIX = "use_item:";

export function isItemUseBeat(beatId: string): boolean {
  return beatId.startsWith(ITEM_USE_BEAT_PREFIX);
}
