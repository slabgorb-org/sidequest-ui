import { NarrativeView } from "@/screens/NarrativeView";
import type { GameMessage } from "@/types/protocol";

interface NarrativeWidgetProps {
  messages: GameMessage[];
  thinking?: boolean;
  /** Genre slug — passes through to the narrator-thinking indicator. */
  genreSlug?: string | null;
}

export function NarrativeWidget({ messages, thinking, genreSlug }: NarrativeWidgetProps) {
  return <NarrativeView messages={messages} thinking={thinking} genreSlug={genreSlug} />;
}
