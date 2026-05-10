import { useMemo, useState } from "react";
import { buildSegments, buildTurnPages } from "@/lib/narrativeSegments";
import type { GameMessage } from "@/types/protocol";
import { renderSegment } from "./narrativeRenderers";
import { ThinkingIndicator } from "./NarrationShared";

export interface NarrationFocusProps {
  messages: GameMessage[];
  thinking?: boolean;
}

/**
 * Focus mode: one TURN PAGE at a time, not one segment at a time.
 *
 * A turn page collects the player's action (if any) plus every narrator
 * paragraph and side-effect that followed, until the next player action.
 * See `buildTurnPages` in lib/narrativeSegments.ts for the grouping rule.
 *
 * Playtest 2026-04-11 fix: previously each segment (single paragraph, single
 * gallery notice, raw player action text) was its own page — so the player
 * read one sentence at a time and typically landed on a side-effect toast.
 */
export function NarrationFocus({ messages, thinking }: NarrationFocusProps) {
  const pages = useMemo(
    () => buildTurnPages(buildSegments(messages)),
    [messages],
  );

  // Reset cursor to the newest page when the page list grows.
  // Derive-during-render pattern (no useEffect → setState → re-render).
  const [lastPageCount, setLastPageCount] = useState(pages.length);
  const [index, setIndex] = useState(Math.max(0, pages.length - 1));
  if (pages.length !== lastPageCount) {
    setLastPageCount(pages.length);
    if (pages.length > 0) {
      setIndex(pages.length - 1);
    }
  }

  const hasPages = pages.length > 0;
  const isFirst = index <= 0;
  const isLast = index >= pages.length - 1;
  const currentPage = hasPages ? pages[Math.min(index, pages.length - 1)] : [];

  // Drop cap is reserved for the *current* turn's opening paragraph — only
  // when the viewer is parked on the latest page.
  const firstTextIdx = isLast ? currentPage.findIndex((s) => s.kind === "text") : -1;

  return (
    <div data-testid="narration-focus" className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        {currentPage.length > 0 && (
          <div className="max-w-[85ch] w-full mx-auto">
            {currentPage.map((seg, i) =>
              renderSegment(seg, i, {
                maxTextWidth: "max-w-[85ch]",
                isFirstCurrentText: i === firstTextIdx,
              }),
            )}
          </div>
        )}
      </div>

      {thinking && <ThinkingIndicator />}

      <div className="flex items-center justify-center gap-4 py-4 border-t border-border/30">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          aria-label="Prev"
          className="px-3 py-1.5 text-sm rounded border border-border/50 hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        <span className="text-xs text-muted-foreground/50">
          {hasPages ? `${index + 1} / ${pages.length}` : "—"}
        </span>
        <button
          onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}
          disabled={isLast}
          aria-label="Next"
          className="px-3 py-1.5 text-sm rounded border border-border/50 hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
