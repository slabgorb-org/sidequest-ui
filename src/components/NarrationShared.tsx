import { GenreLoader } from "./GenreLoader";
import { hasGenreLoader } from "./GenreLoader.constants";

/**
 * The narrator-thinking divider that sits between user input and the next
 * narration block. When a genre with designed loaders is active (any of the 8
 * genres covered by the "Sixteen Quiet Marks" handoff), the GenreLoader
 * renders one of that genre's two loaders, randomised per mount. Otherwise we
 * fall back to the diamond triplet — an explicit, documented fallback for
 * genres that haven't received a designed pair yet (road_warrior,
 * spaghetti_western, heavy_metal).
 */
export function ThinkingIndicator({
  genre,
  className,
}: {
  genre?: string | null;
  className?: string;
}) {
  if (hasGenreLoader(genre)) {
    return (
      <div
        data-testid="thinking-indicator"
        className={`flex items-center justify-center ${className ?? "py-2"}`}
      >
        <GenreLoader genre={genre as string} />
      </div>
    );
  }
  return (
    <div
      data-testid="thinking-indicator"
      className={`flex items-center justify-center gap-3 text-muted-foreground/30 ${className ?? "py-2"}`}
    >
      <span className="text-sm animate-pulse">◇</span>
      <span className="text-sm animate-pulse [animation-delay:200ms]">◇</span>
      <span className="text-sm animate-pulse [animation-delay:400ms]">◇</span>
    </div>
  );
}

export function EmptyNarrationState() {
  return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm italic text-muted-foreground/50 animate-pulse">
        The narrator gathers their thoughts...
      </p>
    </div>
  );
}

