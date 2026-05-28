import { type GameMessage } from "@/types/protocol";
import type { ActionRevealEntry } from "@/types/payloads";
import { useLayoutMode, type LayoutMode } from "@/hooks/useLayoutMode";
import { NarrationScroll } from "@/components/NarrationScroll";
import { NarrationFocus } from "@/components/NarrationFocus";
import { NarrationCards } from "@/components/NarrationCards";

export interface NarrativeViewProps {
  messages: GameMessage[];
  thinking?: boolean;
  /** When provided, overrides the hook-based layout mode (single source of truth from parent). */
  layoutMode?: LayoutMode;
  /** Genre slug — passes through to the narrator-thinking indicator. */
  genreSlug?: string | null;
  /** Story 71-4: per-round persisted peer actions (firewall-filtered). */
  peerActionsByRound?: Map<number, ActionRevealEntry[]>;
}

export function NarrativeView({ messages, thinking, layoutMode, genreSlug, peerActionsByRound }: NarrativeViewProps) {
  const { mode: hookMode } = useLayoutMode();
  const mode = layoutMode ?? hookMode;

  const LayoutComponent =
    mode === "focus" ? NarrationFocus :
    mode === "cards" ? NarrationCards :
    NarrationScroll;

  return (
    <div data-testid="narrative-view" className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
      <LayoutComponent messages={messages} thinking={thinking} genreSlug={genreSlug} peerActionsByRound={peerActionsByRound} />
    </div>
  );
}
