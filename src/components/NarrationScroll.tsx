import { useMemo, useEffect, useRef, useCallback } from "react";
import { buildSegments, groupPortraitSegments } from "@/lib/narrativeSegments";
import type { GameMessage } from "@/types/protocol";
import type { ActionRevealEntry } from "@/types/payloads";
import { renderSegment } from "./narrativeRenderers";
import { ThinkingIndicator, EmptyNarrationState } from "./NarrationShared";

export interface NarrationScrollProps {
  messages: GameMessage[];
  thinking?: boolean;
  /** Genre slug — selects which loader pair drives the thinking indicator. */
  genreSlug?: string | null;
  /** Story 71-4: per-round persisted peer actions (firewall-filtered). */
  peerActionsByRound?: Map<number, ActionRevealEntry[]>;
}

export function NarrationScroll({ messages, thinking, genreSlug, peerActionsByRound }: NarrationScrollProps) {
  const segments = useMemo(
    () => groupPortraitSegments(buildSegments(messages, peerActionsByRound)),
    [messages, peerActionsByRound],
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
      // A force-scroll on new turn also resets autoScroll so the view keeps
      // tracking the bottom (the player is now looking at the latest beat —
      // reading history mid-turn opts back out via the scroll-up handler).
      if (newTurnLanded) {
        autoScroll.current = true;
      }
    }
    prevSeparatorIdx.current = lastSeparatorIdx;
  }, [segments, thinking, lastSeparatorIdx]);

  const hasHistory = lastSeparatorIdx >= 0;
  const historySegments = hasHistory ? segments.slice(0, lastSeparatorIdx) : [];
  const currentSegments = hasHistory ? segments.slice(lastSeparatorIdx + 1) : segments;

  // First text segment in the current block gets the drop-cap class. The
  // archetype-chrome.css rules render an oversized initial in the display
  // font, matching the "chapter-opening paragraph" treatment from the
  // narration design handoff (see styles/archetype-chrome.css).
  const firstCurrentTextIdx = currentSegments.findIndex((s) => s.kind === "text");

  return (
    <div
      ref={scrollRef}
      data-testid="narration-scroll"
      onScroll={handleScroll}
      className="narrative-scroll flex-1 min-h-0 overflow-y-auto flex flex-col"
    >
      <div className="flex-1" />
      <div className="px-6 py-8 space-y-4">
        {segments.length === 0 ? (
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
            {/* Current turn — full opacity, larger leading for serif body.
                The first text segment receives `has-dropcap` so the
                archetype-chrome.css rule can render the per-archetype
                oversized initial. */}
            {currentSegments.map((seg, i) =>
              renderSegment(seg, historySegments.length + 1 + i, {
                maxTextWidth: "max-w-[85ch]",
                isFirstCurrentText: i === firstCurrentTextIdx,
              }),
            )}
          </>
        )}
        {thinking && <ThinkingIndicator genre={genreSlug} />}
      </div>
    </div>
  );
}
