import { useRef, useState, type CSSProperties } from "react";
import type { GenreMeta, WorldMeta } from "@/types/genres";
import { getToneChips } from "./toneAxes";
import { getGenreArt } from "./genreArt";
import { useScopedChromeArchetype, type ChromeArchetype } from "@/hooks/useChromeArchetype";

export interface WorldPreviewProps {
  /** Pack-level metadata. Null when no genre is selected. */
  pack: GenreMeta | null;
  /** World-level metadata. Null when no world is selected. */
  world: WorldMeta | null;
  /** Selected world's genre archetype, scoped to this card only. */
  archetype?: ChromeArchetype | null;
  /** World-scoped lore reference href, or null when unavailable. */
  loreHref?: string | null;
  /**
   * Selected world's genre slug. Drives the per-genre `[data-genre]` accent
   * scope and the cinematic hero's gradient placeholder (story 83-1). Null
   * when no world is selected.
   */
  genreSlug?: string | null;
}

/**
 * Right-panel preview card in the lobby picker.
 *
 * Renders hero image, title, era subtitle, full description, tone chips
 * derived from `axis_snapshot`, and the inspirations list. Handles four
 * states: empty (nothing selected), loading (data in flight — not used by
 * the current implementation because data is prop-driven), loaded (full
 * content), and image-failed (hero placeholder with literary copy).
 */
export function WorldPreview({
  pack,
  world,
  archetype = null,
  loreHref = null,
  genreSlug = null,
}: WorldPreviewProps) {
  // Confine the selected world's genre archetype to THIS card's subtree — the
  // lobby shell stays neutral `house` while the card shows a taste of the genre.
  const cardRef = useRef<HTMLDivElement>(null);
  useScopedChromeArchetype(cardRef, archetype);

  // Track image-failed per world. Uses the React "adjust state during
  // render" pattern (preferred over useEffect for prop-derived resets,
  // see https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes)
  // so eslint-plugin-react-hooks/set-state-in-effect doesn't fire.
  // Image state machine: 'idle' (no image to load), 'loading' (fetching),
  // 'loaded' (visible), 'failed' (network/decode error). Reset on world swap.
  type ImageStatus = "idle" | "loading" | "loaded" | "failed";
  const initialStatus: ImageStatus = world?.hero_image ? "loading" : "idle";
  const [imageStatus, setImageStatus] = useState<ImageStatus>(initialStatus);
  const [trackedSlug, setTrackedSlug] = useState<string | null>(world?.slug ?? null);
  if ((world?.slug ?? null) !== trackedSlug) {
    setTrackedSlug(world?.slug ?? null);
    setImageStatus(initialStatus);
  }

  if (!pack || !world) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6 min-h-[18rem]">
        <p className="text-base italic text-muted-foreground/50">
          Choose a world to see what awaits.
        </p>
      </div>
    );
  }

  const toneChips = getToneChips(world.axis_snapshot);
  const hasImage = Boolean(world.hero_image);
  const genreArt = getGenreArt(genreSlug);

  // Pick the placeholder copy for the *non-loaded* states. Three explicit
  // copies so a player (and Sebastien with a debugger open) can tell at a
  // glance whether the image is loading, missing, or failed to fetch.
  const placeholderCopy =
    imageStatus === "loading"
      ? "loading the page…"
      : imageStatus === "failed"
      ? "the page tore in transit"
      : "the page is faded…";

  return (
    <div
      ref={cardRef}
      data-testid="world-preview-card"
      data-genre={genreSlug ?? undefined}
      style={{ "--accent": genreArt.accent } as CSSProperties}
      className="flex-1 flex flex-col gap-4 px-6"
    >
      {/* Cinematic hero (story 83-1). Carries the genre-label placard and, when
          the world has no runtime AI render, a per-genre gradient placeholder. */}
      <div data-testid="lobby-hero" className="relative">
      {/* Hero image frame — 4:3 to match the POI render aspect (1024×768)
          so the whole plate shows uncropped. Fixed ratio still prevents
          layout jump (every hero is the same shape). */}
      <div
        data-testid="world-hero-frame"
        data-image-status={imageStatus}
        style={hasImage ? undefined : { backgroundImage: genreArt.art }}
        className={`relative w-full aspect-[4/3] overflow-hidden rounded border border-muted-foreground/20 bg-muted/10 ${
          imageStatus === "loading" ? "animate-pulse" : ""
        }`}
      >
        {hasImage && imageStatus !== "failed" && (
          <img
            // Keyed on slug so switching worlds fully remounts the <img>
            // — otherwise the previous world's image stays visible (with
            // opacity=1 set imperatively on prior onLoad) until the new
            // src's onLoad fires, masking the loading state.
            key={world.slug}
            src={world.hero_image!}
            alt={`${world.name} — ${world.setting ?? pack.name}`}
            className="w-full h-full object-contain opacity-0 transition-opacity duration-300"
            onLoad={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "1";
              setImageStatus("loaded");
            }}
            onError={() => setImageStatus("failed")}
          />
        )}
        {imageStatus !== "loaded" && (
          <div
            className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 bg-muted/30"
            role={imageStatus === "loading" ? "status" : undefined}
            aria-live={imageStatus === "failed" ? "polite" : undefined}
          >
            {imageStatus === "loading" && (
              <span
                data-testid="world-hero-spinner"
                className="block w-10 h-10 rounded-full border-[3px] border-muted-foreground/20
                           border-t-[var(--primary)] animate-spin"
                aria-hidden="true"
              />
            )}
            {imageStatus === "failed" && (
              <span
                aria-hidden="true"
                className="text-3xl text-muted-foreground/50"
              >
                ⚑
              </span>
            )}
            {imageStatus === "idle" && (
              <span
                aria-hidden="true"
                className="text-3xl text-muted-foreground/40"
              >
                ◇
              </span>
            )}
            <p className="text-sm italic text-muted-foreground/70 tracking-wide">
              {placeholderCopy}
            </p>
          </div>
        )}
        </div>
        {/* Genre placard — bottom-left plate label over the hero, per design. */}
        <div className="absolute left-3 bottom-2 right-3 pointer-events-none">
          <div className="text-[11px] uppercase tracking-[0.32em] text-[var(--accent)] [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
            {pack.name}
          </div>
        </div>
      </div>

      {/* Title + era subtitle, with the world-scoped Lore reference. */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xl text-foreground/90 tracking-wide">
            {world.name}
          </h2>
          {loreHref && (
            <a
              href={loreHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${world.name} lore`}
              className="text-sm underline hover:no-underline text-muted-foreground/70 shrink-0"
            >
              Lore
            </a>
          )}
        </div>
        {(world.setting || world.era) && (
          <p className="text-sm italic text-muted-foreground/70 mt-1">
            {world.setting}
            {world.setting && world.era && " · "}
            {world.era}
          </p>
        )}
      </div>

      {/* Tone chips — one per authored axis; hidden only when the world declared none. */}
      {toneChips.length > 0 && (
        <ul
          className="flex flex-wrap gap-2"
          aria-label={`Tone: ${toneChips.map((c) => c.label).join(", ")}`}
        >
          {toneChips.map((chip) => (
            <li
              key={chip.label}
              className="text-xs italic text-foreground/70
                         border border-muted-foreground/25 rounded-full
                         px-2.5 py-0.5"
            >
              <span aria-hidden="true" className="mr-1">
                {chip.glyph}
              </span>
              {chip.label}
            </li>
          ))}
        </ul>
      )}

      {/* Full description — no truncation. Adults read. */}
      <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">
        {world.description}
      </p>

      {/* Inspirations list. */}
      {world.inspirations.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/50 mb-1">
            Inspired by
          </p>
          <ul className="text-sm italic text-foreground/75 space-y-0.5">
            {world.inspirations.map((inspiration) => (
              <li key={inspiration}>· {inspiration}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
