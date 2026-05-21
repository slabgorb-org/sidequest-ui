import { type GameMessage } from "@/types/protocol";
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
}

export function NarrativeView({ messages, thinking, layoutMode, genreSlug }: NarrativeViewProps) {
  const { mode: hookMode } = useLayoutMode();
  const mode = layoutMode ?? hookMode;

  const LayoutComponent =
    mode === "focus" ? NarrationFocus :
    mode === "cards" ? NarrationCards :
    NarrationScroll;

  return (
    <div data-testid="narrative-view" className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
      <LayoutComponent messages={messages} thinking={thinking} genreSlug={genreSlug} />
    </div>
  );
}
