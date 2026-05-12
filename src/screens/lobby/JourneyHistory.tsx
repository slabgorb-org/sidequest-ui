import { useCallback, useEffect, useState } from "react";
import {
  loadHistory,
  removeHistory,
  formatRelativeTime,
  type JourneyEntry,
} from "./historyStore";
import { modeBadge } from "./modeBadge";

export interface JourneyHistoryProps {
  /**
   * Called when the player clicks a history row. The lobby wires this
   * to its prefill function — name, genre, and world all populate but
   * Begin is not auto-clicked. The player still confirms the choice.
   */
  onSelect: (entry: JourneyEntry) => void;
  /** Pretty display name for a genre slug, sourced from the GenresResponse. */
  prettyGenre: (slug: string) => string;
  /** Pretty display name for a world slug, sourced from the GenresResponse. */
  prettyWorld: (genre: string, world: string) => string;
}

/**
 * "Past journeys" panel — lists up to 5 recent (player_name, genre, world)
 * combinations from localStorage. Click a row to prefill the lobby fields.
 * Hover a row to reveal an X button that forgets that combination.
 *
 * Hidden entirely when the history is empty so first-time players never
 * see "no past journeys" — the panel appears as a delight on the second
 * visit instead.
 */
export function JourneyHistory({
  onSelect,
  prettyGenre,
  prettyWorld,
}: JourneyHistoryProps) {
  // Local state mirrors localStorage so removals re-render immediately
  // without depending on a parent refetch. Initial load reads from disk.
  const [entries, setEntries] = useState<JourneyEntry[]>(() => loadHistory());

  // Self-evict entries whose save was deleted out from under us. On mount,
  // ping the server for every entry that carries a `game_slug`; if the
  // server responds 404 the save is gone (cleaned up between sessions)
  // and clicking the row would land the player on an error screen. Drop
  // it from both render state and localStorage so the next render is
  // clean. Only 404 evicts — other statuses (5xx, network errors) are
  // transient and the entry is preserved.
  //
  // Legacy entries without `game_slug` (pre-2026-04-24) are skipped: the
  // lobby uses them for prefill-only and never tries to resume the slug.
  //
  // Reads `loadHistory()` directly rather than the `entries` state slice so
  // the dep-array is genuinely empty (validation runs once on mount); a
  // dep on `entries` would re-trigger validation after every user-driven
  // removal.
  useEffect(() => {
    const controller = new AbortController();
    for (const entry of loadHistory()) {
      if (!entry.game_slug) continue;
      const slug = entry.game_slug;
      void (async () => {
        try {
          const res = await fetch(`/api/games/${encodeURIComponent(slug)}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          if (res.status === 404) {
            removeHistory({
              player_name: entry.player_name,
              genre: entry.genre,
              world: entry.world,
            });
            setEntries((prev) =>
              prev.filter(
                (existing) =>
                  !(
                    existing.player_name === entry.player_name &&
                    existing.genre === entry.genre &&
                    existing.world === entry.world
                  ),
              ),
            );
          }
        } catch {
          // Network errors / aborts are not definitive — keep the entry.
        }
      })();
    }
    return () => controller.abort();
  }, []);

  const handleRemove = useCallback(
    (entry: JourneyEntry, e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger row-select on X click.
      removeHistory({
        player_name: entry.player_name,
        genre: entry.genre,
        world: entry.world,
      });
      setEntries((prev) =>
        prev.filter(
          (existing) =>
            !(
              existing.player_name === entry.player_name &&
              existing.genre === entry.genre &&
              existing.world === entry.world
            ),
        ),
      );
    },
    [],
  );

  if (entries.length === 0) return null;

  return (
    <section className="w-full max-w-4xl mt-6">
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground/50 mb-2">
        Past journeys
      </h2>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => {
          const genreName = prettyGenre(entry.genre);
          const worldName = prettyWorld(entry.genre, entry.world);
          // Mode icon: helps Alex (slow reader, MP context) see at-a-glance
          // whether a row is a solo or multiplayer save before clicking. Pre
          // 2026-04-24 entries lack `mode` — render a hollow diamond rather
          // than guessing, so an unknown row visually differs from a known
          // solo/MP row instead of silently looking like one.
          const { glyph: modeGlyph, label: modeLabel } = modeBadge(entry.mode);
          return (
            <li key={`${entry.player_name}:${entry.genre}:${entry.world}`}>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className="group w-full flex items-baseline justify-between
                           text-left bg-transparent border-0 px-3 py-1.5
                           border-l-2 border-l-transparent
                           hover:border-l-muted-foreground/40 hover:bg-muted/10
                           transition-colors cursor-pointer
                           focus-visible:outline-none focus-visible:bg-muted/20"
              >
                <span className="flex items-baseline gap-2 text-sm">
                  <span
                    aria-label={modeLabel}
                    title={modeLabel}
                    data-mode={entry.mode ?? "unknown"}
                    className="inline-block w-3 text-center text-muted-foreground/70 tabular-nums"
                  >
                    {modeGlyph}
                  </span>
                  <span className="text-foreground/85">{entry.player_name}</span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="italic text-foreground/70">
                    {genreName} / {worldName}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs italic text-muted-foreground/50">
                    {formatRelativeTime(entry.last_played_iso)}
                  </span>
                  <span
                    role="button"
                    aria-label={`Forget ${entry.player_name} in ${worldName}`}
                    tabIndex={-1}
                    onClick={(e) => handleRemove(entry, e)}
                    className="text-xs text-muted-foreground/40 opacity-0
                               group-hover:opacity-100 hover:text-foreground/80
                               transition-opacity cursor-pointer px-1"
                  >
                    ✕
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
