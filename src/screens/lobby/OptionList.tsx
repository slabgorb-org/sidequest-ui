import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * A single selectable row in an `OptionList`.
 *
 * `annotation` is an optional suffix (e.g., "· 2 here" for a world that
 * has active players in it). `hint` is an optional lowercase tag shown
 * next to the label (e.g., "mythic", "gritty") for genre rows.
 */
export interface OptionItem {
  slug: string;
  label: string;
  hint?: string;
  annotation?: React.ReactNode;
}

/** A genre section: a sticky header (with an optional Rules link) over its worlds. */
export interface OptionGroup {
  slug: string;
  label: string;
  rulesHref: string | null;
  items: OptionItem[];
}

export interface OptionListProps {
  /** Accessibility label describing what the list is for (e.g., "Genre"). */
  ariaLabel: string;
  /** Flat mode. Mutually exclusive with `groups`. */
  items?: OptionItem[];
  /** Grouped mode: sticky genre headers over a single radiogroup. */
  groups?: OptionGroup[];
  /** Currently selected slug, or `null` if nothing is selected. */
  selected: string | null;
  /** Called when the user picks a different item. */
  onSelect: (slug: string) => void;
  /** Disable all interaction (during connect). */
  disabled?: boolean;
}

/**
 * Scrollable radio-group used for both genre and world selection in the lobby.
 *
 * Pattern: WAI-ARIA radiogroup. Arrow keys move selection through the items;
 * Home/End jump to ends. In grouped mode, sticky `role="presentation"` genre
 * headers interleave the worlds but a single radiogroup spans every world, so
 * keyboard nav flows across genre boundaries and skips the headers. The
 * component is fully keyboard-navigable and does not require a mouse.
 */
export function OptionList({
  ariaLabel,
  items,
  groups,
  selected,
  onSelect,
  disabled = false,
}: OptionListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // The flat radio set the keyboard model and roving-tabindex operate over,
  // regardless of whether the caller passed flat items or genre groups. Memoized
  // so the handleKeyDown useCallback's deps are stable across renders.
  const flatItems: OptionItem[] = useMemo(
    () => (groups ? groups.flatMap((g) => g.items) : items ?? []),
    [groups, items],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled || flatItems.length === 0) return;
      const currentIndex = flatItems.findIndex((i) => i.slug === selected);

      let nextIndex = currentIndex;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % flatItems.length;
          break;
        case "ArrowUp":
        case "ArrowLeft":
          nextIndex = currentIndex <= 0 ? flatItems.length - 1 : currentIndex - 1;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = flatItems.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      onSelect(flatItems[nextIndex].slug);

      // Move focus to the new radio to match WAI-ARIA roving-tabindex pattern.
      const nextEl = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-slug="${flatItems[nextIndex].slug}"]`,
      );
      nextEl?.focus();
    },
    [flatItems, selected, onSelect, disabled],
  );

  // Keep the selected world visible (it may sit under a sticky header or below
  // the fold after a restore). `block: "nearest"` avoids jumping the page.
  // Optional-chain the method: scrollIntoView is a browser-only API absent in
  // jsdom, so flat-mode callers' tests need not stub it to render.
  useEffect(() => {
    if (!selected) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-slug="${selected}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const renderItem = (item: OptionItem) => {
    const isSelected = item.slug === selected;
    return (
      <button
        key={item.slug}
        type="button"
        role="radio"
        aria-checked={isSelected}
        data-slug={item.slug}
        tabIndex={isSelected || (!selected && item === flatItems[0]) ? 0 : -1}
        disabled={disabled}
        onClick={() => onSelect(item.slug)}
        className={`
          flex items-baseline justify-between
          w-full text-left px-3 py-1.5 scroll-mt-12
          bg-transparent border-0 border-l-4
          transition-colors cursor-pointer
          disabled:cursor-default disabled:opacity-40
          focus-visible:outline-none focus-visible:bg-muted/20
          ${
            isSelected
              ? "border-l-[var(--primary)] bg-[var(--primary)]/20 text-foreground font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
              : "border-l-transparent text-foreground/60 hover:border-l-muted-foreground/40 hover:bg-muted/20 hover:text-foreground/85"
          }
        `}
      >
        <span className="flex items-baseline gap-2">
          <span className="text-base tracking-wide">{item.label}</span>
          {item.hint && (
            <span className="text-xs italic text-muted-foreground/50">{item.hint}</span>
          )}
        </span>
        {item.annotation && (
          <span className="text-xs text-muted-foreground/70 tabular-nums">
            {item.annotation}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className="flex flex-col w-full overflow-y-auto min-h-0
                 [scrollbar-gutter:stable] [scrollbar-width:thin]"
    >
      {groups
        ? groups.map((group) => (
            <div key={group.slug} role="presentation">
              <div
                role="presentation"
                className="sticky top-0 z-10 flex items-baseline justify-between
                           bg-background px-3 pt-3 pb-1"
              >
                <span className="text-xs uppercase tracking-widest text-muted-foreground/50">
                  {group.label}
                </span>
                {group.rulesHref && (
                  <a
                    href={group.rulesHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${group.label} rules`}
                    className="text-xs underline hover:no-underline text-muted-foreground/60"
                  >
                    Rules
                  </a>
                )}
              </div>
              {group.items.map(renderItem)}
            </div>
          ))
        : flatItems.map(renderItem)}
    </div>
  );
}
