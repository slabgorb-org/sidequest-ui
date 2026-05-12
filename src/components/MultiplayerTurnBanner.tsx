/**
 * MultiplayerTurnBanner — turn ownership cue above the InputBar.
 *
 * Solves two playtest 2026-04-24 bugs at once:
 *   1. "Multiplayer view has no turn indicator" — neither player's UI
 *      tells them whose turn it is. (Sebastien needs the mechanical
 *      handle; Alex needs to know the wait is normal.)
 *   2. "Considering your words…" hangs read as crashes — without a
 *      heartbeat or "waiting on X" line, the 30-90s narrator turn looks
 *      like a freeze.
 *
 * Renders nothing in single-player (no peers to wait on, no turn to
 * announce). In multiplayer, the banner is driven by ``mpInputState``
 * (derived in App.tsx from canType + per-player TURN_STATUS counts) so
 * the copy matches the simultaneous-action server model:
 *   - 'free' + peer has acted → "<peer> acted — declare your action"
 *     (NOT "It's <peer>'s turn…", which implied alternating turns and
 *     made Alex think she was holding up the group; playtest 2026-04-29).
 *   - 'free' + nobody has acted → "<local> — declare your action".
 *     (Sealed-letter mode is simultaneous, so "you have the floor" — the
 *     one-at-a-time speaking metaphor — read as "your turn while others
 *     wait" and confused the playgroup. The local player is *always* able
 *     to declare in free state; the prompt is to do it, not to claim a
 *     speaking slot. sq-playtest 2026-05-12 [UX] floor banner clarity.)
 *   - 'waiting-on-peers' → "Waiting on <peer> to act…" — local submitted
 *     but peers haven't yet. Distinguishes from narrator-pending.
 *   - 'waiting-on-narrator' → "Waiting for the narrator…" — every player
 *     submitted, the merged dispatch is running.
 */
export interface MultiplayerTurnBannerProps {
  isMultiplayer: boolean;
  /** WebSocket connected — drives the heartbeat dot. */
  wsConnected: boolean;
  /** Active player from server TURN_STATUS (null in sealed-letter mode). */
  activePlayerName?: string | null;
  /** Active player's id (used to disambiguate when names collide). */
  activePlayerId?: string | null;
  /** Local player's id — compares against activePlayerId. */
  localPlayerId?: string | null;
  /** Local character's display name — used in "<name> — declare your action". */
  localCharacterName?: string | null;
  /**
   * True after local player submits. Retained for the legacy fallback
   * branch only — when ``mpInputState`` is provided, it is the source
   * of truth for narrator/peer disambiguation.
   */
  thinking?: boolean;
  /**
   * Drives the simultaneous-action banner copy. When omitted, the legacy
   * thinking/active-player branches are used (single-player, tests).
   */
  mpInputState?: "free" | "waiting-on-peers" | "waiting-on-narrator";
  /** Names of peers who have NOT yet submitted this round. */
  peersOutstanding?: string[];
}

export function MultiplayerTurnBanner({
  isMultiplayer,
  wsConnected,
  activePlayerName,
  activePlayerId,
  localPlayerId,
  localCharacterName,
  thinking,
  mpInputState,
  peersOutstanding = [],
}: MultiplayerTurnBannerProps) {
  if (!isMultiplayer) return null;

  // Decide what the banner says.
  const localIsActive =
    activePlayerId !== undefined &&
    activePlayerId !== null &&
    localPlayerId !== undefined &&
    localPlayerId !== null &&
    activePlayerId === localPlayerId;

  let label: string;
  let tone: "you" | "peer" | "thinking";

  // Preferred path (playtest 2026-04-29): mpInputState is the truth of the
  // simultaneous-action turn model. The legacy ``thinking``/``activePlayerName``
  // branches below are retained for single-player and the existing test
  // harness that doesn't yet pass mpInputState.
  if (mpInputState === "waiting-on-narrator") {
    label = "Waiting for the narrator…";
    tone = "thinking";
  } else if (mpInputState === "waiting-on-peers") {
    if (peersOutstanding.length === 1) {
      label = `Waiting on ${peersOutstanding[0]} to act…`;
    } else if (peersOutstanding.length > 1) {
      label = `Waiting on ${peersOutstanding[0]} + ${peersOutstanding.length - 1} other${
        peersOutstanding.length - 1 === 1 ? "" : "s"
      } to act…`;
    } else {
      label = "Waiting on your party to act…";
    }
    tone = "peer";
  } else if (mpInputState === "free" && activePlayerName && !localIsActive) {
    // A peer has acted but local hasn't yet — simultaneous model: not
    // their "turn", their declaration. Cue the local player to act
    // rather than telling them to wait.
    label = `${activePlayerName} acted — declare your action`;
    tone = "peer";
  } else if (mpInputState === "free") {
    label = localCharacterName
      ? `${localCharacterName} — declare your action`
      : "Declare your action";
    tone = "you";
  } else if (thinking) {
    // Legacy branch (mpInputState not provided). Retained so existing
    // tests + single-player paths keep their copy.
    label = "Waiting for the narrator…";
    tone = "thinking";
  } else if (
    activePlayerName &&
    !localIsActive &&
    activePlayerName !== localCharacterName
  ) {
    label = `It's ${activePlayerName}'s turn…`;
    tone = "peer";
  } else {
    label = localCharacterName
      ? `${localCharacterName} — declare your action`
      : "Declare your action";
    tone = "you";
  }

  // Dot color: green when WS open, amber when reconnecting/closed.
  // The `aria-live` attribute lets screen readers announce turn changes.
  return (
    <div
      data-testid="multiplayer-turn-banner"
      data-tone={tone}
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 px-3 py-1.5 mb-1 rounded-md text-sm border-l-4 ${
        tone === "you"
          ? "border-l-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)] font-semibold"
          : tone === "peer"
            ? "border-l-amber-500/70 bg-amber-500/10 text-amber-200/90"
            : "border-l-muted-foreground/40 bg-muted/30 text-muted-foreground"
      }`}
    >
      <span
        data-testid="ws-heartbeat-dot"
        aria-hidden="true"
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
          wsConnected
            ? "bg-emerald-500 animate-pulse"
            : "bg-amber-500/70 animate-pulse"
        }`}
      />
      <span className="flex-1">{label}</span>
    </div>
  );
}
