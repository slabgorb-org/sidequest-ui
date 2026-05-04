import { useMemo } from "react";
import { buildSegments, groupPortraitSegments } from "@/lib/narrativeSegments";
import type { NarrativeSegment } from "@/lib/narrativeSegments";
import type { GameMessage } from "@/types/protocol";
import { renderSegment } from "./narrativeRenderers";
import { ThinkingIndicator, EmptyNarrationState } from "./NarrationShared";

export interface NarrationCardsProps {
  messages: GameMessage[];
  thinking?: boolean;
}

/** Turn boundary kinds — a new turn card starts at these segment types. */
const TURN_STARTERS = new Set<NarrativeSegment["kind"]>([
  "player-action",
  "player-aside",
]);

/**
 * Group segments into turn-based cards.
 *
 * A "turn" starts at a player-action and includes everything that follows
 * until the next turn starter. Segments before the first turn starter are
 * kept as individual cards (e.g. initial narration, system msgs).
 */
function groupIntoTurns(segments: NarrativeSegment[]): NarrativeSegment[][] {
  const turns: NarrativeSegment[][] = [];
  let current: NarrativeSegment[] | null = null;

  for (const seg of segments) {
    if (TURN_STARTERS.has(seg.kind)) {
      // Flush any in-progress turn, then start a new one
      if (current) turns.push(current);
      current = [seg];
    } else if (current) {
      // Accumulate into the current turn
      current.push(seg);
    } else {
      // Pre-turn segment — each gets its own card
      turns.push([seg]);
    }
  }
  if (current) turns.push(current);

  return turns;
}

export function NarrationCards({ messages, thinking }: NarrationCardsProps) {
  const segments = useMemo(
    () => groupPortraitSegments(buildSegments(messages)).filter((s) => s.kind !== "separator"),
    [messages],
  );

  const turns = useMemo(() => groupIntoTurns(segments), [segments]);

  return (
    <div data-testid="narration-cards" className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {turns.map((turnSegs, ti) => (
          <div
            key={ti}
            data-testid="narration-card"
            className="rounded-lg border border-border/30 bg-card/50 p-4 shadow-sm space-y-2"
          >
            {turnSegs.map((seg, si) => renderSegment(seg, ti * 1000 + si, { maxTextWidth: "" }))}
          </div>
        ))}
      </div>

      {turns.length === 0 && <EmptyNarrationState />}

      {thinking && <ThinkingIndicator className="py-4" />}
    </div>
  );
}
