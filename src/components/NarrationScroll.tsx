import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import { buildSegments, groupPortraitSegments } from "@/lib/narrativeSegments";
import type { GameMessage } from "@/types/protocol";
import { renderSegment } from "./narrativeRenderers";
import { ThinkingIndicator, EmptyNarrationState, NarratorConsidersInterstitial } from "./NarrationShared";
import { useGameState } from "@/providers/GameStateProvider";
import { displayTextForTurn } from "@/providers/streamingNarration";

const STALL_THRESHOLD_MS = 5000;
const STALL_POLL_INTERVAL_MS = 250;

export interface NarrationScrollProps {
  messages: GameMessage[];
  thinking?: boolean;
}

export function NarrationScroll({ messages, thinking }: NarrationScrollProps) {
  const { streamingNarration } = useGameState();

  const segments = useMemo(
    () => groupPortraitSegments(buildSegments(messages)),
    [messages],
  );

  // Find the boundary index that splits history from the current (most recent) turn.
  // Each NARRATION_END appends a separator, so a freshly-completed turn ends with a
  // trailing separator. If we used that as the split, the new turn's text would be
  // placed in "history" (dimmed) the moment the turn ends — making it look like the
  // panel never updated. Skip the trailing separator when searching for the split.
  const lastSeparatorIdx = useMemo(() => {
    let i = segments.length - 1;
    if (i >= 0 && segments[i].kind === "separator") i--; // skip trailing separator
    while (i >= 0) {
      if (segments[i].kind === "separator") return i;
      i--;
    }
    return -1;
  }, [segments]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);
  // Track the previous separator index so we can detect "a new turn just
  // landed" (lastSeparatorIdx grew). New turns ALWAYS scroll to bottom
  // regardless of autoScroll — without this, a peer player whose mount
  // happened to coincide with a layout shift (image loading, font swap,
  // backfilled history sizing) flips autoScroll to false via a stray
  // scroll event with scrollTop=0, and never auto-scrolls again.
  // Playtest 2026-05-03 [UX]: P2's tab missed every new turn (scrollH=2247
  // clientH=1061 scrollTop=0 after new turn) while P1's tab tracked
  // correctly because P1 was actively engaged and stayed near the bottom.
  const prevSeparatorIdx = useRef<number>(-1);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    autoScroll.current = el.scrollTop >= el.scrollHeight - el.clientHeight - 50;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const newTurnLanded = lastSeparatorIdx > prevSeparatorIdx.current;
    if (newTurnLanded || autoScroll.current) {
      el.scrollTop = el.scrollHeight - el.clientHeight;
      // A force-scroll on new turn also resets autoScroll so subsequent
      // streaming chunks keep tracking the bottom (the player is now
      // looking at the latest beat — reading history mid-turn opts back
      // out via the scroll-up handler).
      if (newTurnLanded) {
        autoScroll.current = true;
      }
    }
    prevSeparatorIdx.current = lastSeparatorIdx;
  }, [segments, thinking, lastSeparatorIdx]);

  const hasHistory = lastSeparatorIdx >= 0;
  const historySegments = hasHistory ? segments.slice(0, lastSeparatorIdx) : [];
  const currentSegments = hasHistory ? segments.slice(lastSeparatorIdx + 1) : segments;

  // Streaming segment: rendered as a live suffix when the current turn is
  // in-flight (delta chunks arrived, canonical not yet landed).
  // Rules (per task spec):
  //   - activeTurnId must be non-null (a turn is streaming)
  //   - turns entry must exist and have canonical === null (no canonical yet)
  //   - displayTextForTurn must return a non-empty string
  // If activeTurnId is set but has no turns entry, render nothing (no fallback).
  const { activeTurnId, activeTurnStartedAt, turns } = streamingNarration;
  const liveText =
    activeTurnId !== null &&
    turns.has(activeTurnId) &&
    turns.get(activeTurnId)!.canonical === null
      ? displayTextForTurn(streamingNarration, activeTurnId)
      : null;

  // Stall interstitial: shown when a turn has been open for 5+ seconds but
  // no delta chunks have arrived yet. This tells the player the narrator is
  // working, rather than leaving dead silence.
  //
  // Implementation: `nowSnapshot` is updated exclusively inside interval/timeout
  // callbacks and the effect cleanup — never in the synchronous effect body
  // (the purity linter forbids both: calling Date.now() in render, and
  // calling setState synchronously inside an effect body).
  //
  // Guard: if activeTurnStartedAt is null when activeTurnId is set, that is a
  // bug in the reducer — do NOT show the interstitial; log a warning instead.
  const [nowSnapshot, setNowSnapshot] = useState<number | null>(null);
  const warnedTurnRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeTurnId === null || activeTurnStartedAt === null) {
      if (activeTurnId !== null && activeTurnStartedAt === null) {
        if (warnedTurnRef.current !== activeTurnId) {
          warnedTurnRef.current = activeTurnId;
          console.warn(
            "[NarrationScroll] activeTurnId is set but activeTurnStartedAt is null — " +
              "reducer bug; stall interstitial suppressed for turn:",
            activeTurnId,
          );
        }
      }
      // No active turn or missing timestamp — clear and bail.
      // NOTE: cleanup sets nowSnapshot to null; the early return just skips
      // setting up the interval.
      return () => setNowSnapshot(null);
    }

    // Poll every STALL_POLL_INTERVAL_MS. The interval callback captures the
    // current clock value into React state, which is the only lint-safe way
    // to derive elapsed time without calling Date.now() in the render body.
    const interval = setInterval(() => {
      setNowSnapshot(Date.now());
    }, STALL_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      setNowSnapshot(null);
    };
  }, [activeTurnId, activeTurnStartedAt]);

  const hasNoContent =
    activeTurnId !== null &&
    activeTurnStartedAt !== null &&
    (liveText === null || liveText === "");

  const shouldShowInterstitial =
    hasNoContent &&
    nowSnapshot !== null &&
    nowSnapshot - activeTurnStartedAt >= STALL_THRESHOLD_MS;

  return (
    <div
      ref={scrollRef}
      data-testid="narration-scroll"
      onScroll={handleScroll}
      className="narrative-scroll flex-1 min-h-0 overflow-y-auto flex flex-col"
    >
      <div className="flex-1" />
      <div className="px-6 py-8 space-y-4">
        {segments.length === 0 && !liveText && !shouldShowInterstitial ? (
          <EmptyNarrationState />
        ) : (
          <>
            {/* History — dimmed at 0.65 opacity for legibility (WCAG-aware) */}
            {hasHistory && historySegments.length > 0 && (
              <div className="history-section opacity-65 space-y-4 pb-6 mb-6 border-b-2 border-border/50">
                {historySegments.map((seg, i) =>
                  renderSegment(seg, i, { maxTextWidth: "max-w-[85ch]", isHistory: true }),
                )}
              </div>
            )}
            {/* Current turn — full opacity, larger leading for serif body */}
            {currentSegments.map((seg, i) =>
              renderSegment(seg, historySegments.length + 1 + i, { maxTextWidth: "max-w-[85ch]" }),
            )}
            {/* Live streaming segment — rendered only while canonical has not
                yet arrived for the active turn. Reuses current-turn typography
                (text-2xl leading-loose) to match canonical narration styling.
                Appears as a suffix after any canonical segments that may already
                exist in the current turn block. */}
            {liveText && (
              <div
                data-testid="narration-streaming-text"
                className="max-w-[85ch] mx-auto mb-6"
              >
                <div className="prose dark:prose-invert text-2xl leading-loose">
                  {liveText}
                </div>
              </div>
            )}
            {/* Stall interstitial — shown when a turn has been open for 5+
                seconds with no chunks and no canonical. Gives the player a
                clear signal the narrator is working rather than dead silence. */}
            {shouldShowInterstitial && <NarratorConsidersInterstitial />}
          </>
        )}
        {thinking && <ThinkingIndicator />}
      </div>
    </div>
  );
}
