import { type CSSProperties } from "react";
import { getGenreArt } from "./genreArt";

/**
 * A single selectable world row inside a genre section.
 *
 * `slug` is the composite "genre/world" identifier; `annotation` is an
 * optional live-presence suffix (e.g., "2 here").
 */
export interface AccordionWorld {
  slug: string;
  label: string;
  annotation?: React.ReactNode;
}

/** A genre section: a collapsible header over its worlds. */
export interface AccordionGenre {
  slug: string;
  label: string;
  worlds: AccordionWorld[];
  /** Live-presence headcount across this genre's worlds (drives the dot). */
  here?: number;
}

export interface GenreAccordionProps {
  genres: AccordionGenre[];
  /** The composite "genre/world" slug of the selected world, or null. */
  selected: string | null;
  /** The slug of the currently-open genre, or null when all are collapsed. */
  openGenre: string | null;
  /** Toggle a genre header open/closed (single-open is enforced by the caller). */
  onToggleGenre: (genreSlug: string) => void;
  /** Select a world by composite slug. */
  onSelectWorld: (composite: string) => void;
  disabled?: boolean;
}

/**
 * Standing Folio world index (story 83-1) — a single-open genre accordion.
 *
 * Replaces the old scrolling flat radiogroup (`OptionList`). Every genre is a
 * collapsible header; opening one reveals its worlds inline as a per-genre
 * `radiogroup`. With 11 genres collapsed to single rows, the whole catalogue
 * fits the fold with no scrollbar — the redesign's core goal.
 *
 * Accessibility: headers are `aria-expanded` buttons; worlds are `role="radio"`
 * within a `role="radiogroup"` labelled "{Genre} worlds", with `aria-checked`
 * on the selected world. Each genre carries `data-genre` so the per-row accent
 * (and the hero accent downstream) tracks the genre via tokens.
 */
export function GenreAccordion({
  genres,
  selected,
  openGenre,
  onToggleGenre,
  onSelectWorld,
  disabled = false,
}: GenreAccordionProps) {
  return (
    <div className="flex flex-col">
      {genres.map((g) => {
        const isOpen = openGenre === g.slug;
        const here = g.here ?? 0;
        return (
          <div
            key={g.slug}
            data-genre={g.slug}
            style={{ "--accent": getGenreArt(g.slug).accent } as CSSProperties}
          >
            <button
              type="button"
              className={`w-full flex items-center gap-2 text-left bg-transparent border-0
                          border-l-[3px] px-4 py-2 cursor-pointer transition-colors
                          focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]
                          ${
                            isOpen
                              ? "border-l-[var(--accent)] text-foreground/95"
                              : "border-l-transparent text-foreground/70 hover:bg-foreground/[0.035]"
                          }`}
              aria-expanded={isOpen}
              disabled={disabled}
              onClick={() => onToggleGenre(g.slug)}
              title={
                here > 0
                  ? `${here} adventurer${here > 1 ? "s" : ""} here now`
                  : undefined
              }
            >
              <span
                aria-hidden="true"
                className={`text-[10px] text-muted-foreground/70 transition-transform ${
                  isOpen ? "rotate-90 text-[var(--accent)]" : ""
                }`}
              >
                ▶
              </span>
              <span className="flex-1 text-[15.5px] tracking-wide">
                {g.label}
              </span>
              {here > 0 && (
                <span
                  aria-hidden="true"
                  className="text-[var(--accent)] text-xs opacity-80"
                >
                  ●
                </span>
              )}
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                {g.worlds.length}
              </span>
            </button>

            {isOpen && (
              <div
                role="radiogroup"
                aria-label={`${g.label} worlds`}
                className="flex flex-col pb-2"
              >
                {g.worlds.map((w) => {
                  const isSel = w.slug === selected;
                  return (
                    <button
                      key={w.slug}
                      type="button"
                      role="radio"
                      aria-checked={isSel}
                      disabled={disabled}
                      onClick={() => onSelectWorld(w.slug)}
                      className={`w-full flex items-baseline justify-between gap-2 text-left
                                  bg-transparent border-0 border-l-[3px] pl-9 pr-4 py-1.5
                                  cursor-pointer transition-colors
                                  focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]
                                  ${
                                    isSel
                                      ? "border-l-[var(--accent)] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_80%)] text-foreground font-semibold"
                                      : "border-l-transparent text-foreground/65 hover:bg-foreground/[0.04]"
                                  }`}
                    >
                      <span className="text-base tracking-wide">{w.label}</span>
                      {w.annotation && (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] whitespace-nowrap">
                          {w.annotation}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
