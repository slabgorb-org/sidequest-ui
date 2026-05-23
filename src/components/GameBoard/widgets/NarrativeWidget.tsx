import { NarrativeView } from "@/screens/NarrativeView";
import { ReferenceLinks } from "@/components/ReferenceLinks";
import type { GameMessage } from "@/types/protocol";

interface NarrativeWidgetProps {
  messages: GameMessage[];
  thinking?: boolean;
  /** Genre slug — passes through to the narrator-thinking indicator AND the
   *  reference links. */
  genreSlug?: string | null;
  /** World slug — passes through to the lore reference link. */
  worldSlug?: string | null;
}

export function NarrativeWidget({
  messages,
  thinking,
  genreSlug,
  worldSlug,
}: NarrativeWidgetProps) {
  return (
    <div className="narrative-widget flex flex-col flex-1 min-h-0">
      <ReferenceLinks pack={genreSlug} world={worldSlug} />
      <NarrativeView messages={messages} thinking={thinking} genreSlug={genreSlug} />
    </div>
  );
}
