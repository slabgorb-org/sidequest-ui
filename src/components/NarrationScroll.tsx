import { useMemo, useEffect, useRef, useCallback } from "react";
import { buildSegments, groupPortraitSegments } from "@/lib/narrativeSegments";
import type { GameMessage } from "@/types/protocol";
import { renderSegment } from "./narrativeRenderers";
import { ThinkingIndicator, EmptyNarrationState } from "./NarrationShared";
import { useGameState } from "@/providers/GameStateProvider";
import { displayTextForTurn } from "@/providers/streamingNarration";

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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    autoScroll.current = el.scrollTop >= el.scrollHeight - el.clientHeight - 50;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && autoScroll.current) {
      el.scrollTop = el.scrollHeight - el.clientHeight;
    }
  }, [segments, thinking]);

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
  const { activeTurnId, turns } = streamingNarration;
  const liveText =
    activeTurnId !== null &&
    turns.has(activeTurnId) &&
    turns.get(activeTurnId)!.canonical === null
      ? displayTextForTurn(streamingNarration, activeTurnId)
      : null;

  return (
    <div
      ref={scrollRef}
      data-testid="narration-scroll"
      onScroll={handleScroll}
      className="narrative-scroll flex-1 min-h-0 overflow-y-auto flex flex-col"
    >
      <div className="flex-1" />
      <div className="px-6 py-8 space-y-4">
        {segments.length === 0 && !liveText ? (
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
          </>
        )}
        {thinking && <ThinkingIndicator />}
      </div>
    </div>
  );
}
