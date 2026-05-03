import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AudioEngine } from "@/audio/AudioEngine";
import type { GenresResponse, GenreMeta, WorldMeta } from "@/types/genres";
import { OptionList, type OptionItem } from "./lobby/OptionList";
import { WorldPreview } from "./lobby/WorldPreview";
import { CurrentSessions } from "./lobby/CurrentSessions";
import { useSessions } from "./lobby/useSessions";
import { JourneyHistory } from "./lobby/JourneyHistory";
import {
  appendHistory,
  loadHistory,
  type JourneyEntry,
} from "./lobby/historyStore";
import { ModePicker, type GameMode } from "./lobby/ModePicker";
import { useStartGame } from "./lobby/useStartGame";
import { useDisplayName } from "@/hooks/useDisplayName";

export interface ConnectScreenProps {
  /**
   * Full genres response from `/api/genres`. Keyed by genre slug, each
   * value carries the pack's display name, description, and full world
   * metadata for the picker preview panel. Empty object = loading or
   * failed fetch.
   */
  genres: GenresResponse;
  isConnecting?: boolean;
  error?: string | null;
  genreError?: boolean;
  onRetryGenres?: () => void;
}

const STORAGE_KEY = "sidequest-connect";

interface SavedConnectState {
  playerName?: string;
  genre?: string;
  world?: string;
}

function loadSavedState(): SavedConnectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SavedConnectState;
  } catch {
    return {};
  }
}

function saveState(playerName: string, genre: string, world: string) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ playerName, genre, world }),
    );
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

/** Build a pretty label from a slug, replacing underscores with spaces. */
function prettify(slug: string): string {
  return slug.replace(/_/g, " ");
}

export function ConnectScreen({
  genres,
  isConnecting = false,
  error,
  genreError = false,
  onRetryGenres,
}: ConnectScreenProps) {
  const [saved] = useState(loadSavedState);
  const isInitialMount = useRef(true);
  const [playerName, setPlayerName] = useState(saved.playerName ?? "");
  const [genreSlug, setGenreSlug] = useState<string | null>(
    saved.genre ?? null,
  );
  const [worldSlug, setWorldSlug] = useState<string | null>(
    saved.world ?? null,
  );
  const [mode, setMode] = useState<GameMode>("solo");
  const { start } = useStartGame();
  const { setName: setDisplayName } = useDisplayName();
  const navigate = useNavigate();
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Live multiplayer presence — drives both the per-world "X here"
  // annotations on the world list and the CurrentSessions panel below
  // the preview. Polls /api/sessions every 15s while the lobby is open.
  const { sessions: activeSessions } = useSessions({
    pollMs: 15000,
    genre: genreSlug,
  });

  // Sorted list of genre slugs for stable rendering.
  const genreItems: OptionItem[] = useMemo(
    () =>
      Object.entries(genres)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slug, meta]) => ({
          slug,
          label: meta.name || prettify(slug),
        })),
    [genres],
  );

  const currentPack: GenreMeta | null =
    genreSlug && genres[genreSlug] ? genres[genreSlug] : null;

  // Pre-compute "N here" annotations keyed by world slug so the world
  // list can show at-a-glance presence without rendering the full panel.
  // Only counts sessions in the currently-selected genre — a world named
  // "outpost" in two different genres shouldn't share a count.
  const worldPresence: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!genreSlug) return counts;
    for (const session of activeSessions) {
      if (session.genre !== genreSlug) continue;
      counts[session.world] =
        (counts[session.world] ?? 0) + session.players.length;
    }
    return counts;
  }, [activeSessions, genreSlug]);

  // World list derived from the selected genre, with optional presence
  // annotations attached to rows that have active players.
  const worldItems: OptionItem[] = useMemo(() => {
    if (!currentPack) return [];
    return currentPack.worlds.map((w) => {
      const count = worldPresence[w.slug] ?? 0;
      return {
        slug: w.slug,
        label: w.name || prettify(w.slug),
        annotation: count > 0 ? `· ${count} here` : undefined,
      };
    });
  }, [currentPack, worldPresence]);

  // Sessions matching the currently-selected world, for the panel below.
  const sessionsForWorld = useMemo(() => {
    if (!genreSlug || !worldSlug) return [];
    return activeSessions.filter(
      (s) => s.genre === genreSlug && s.world === worldSlug,
    );
  }, [activeSessions, genreSlug, worldSlug]);

  const currentWorld: WorldMeta | null = useMemo(() => {
    if (!currentPack || !worldSlug) return null;
    return currentPack.worlds.find((w) => w.slug === worldSlug) ?? null;
  }, [currentPack, worldSlug]);

  // When genres load, auto-select if there is exactly one genre and no genre
  // is yet selected. Mirrors the world auto-select logic below.
  useEffect(() => {
    const slugs = Object.keys(genres);
    if (slugs.length === 1 && genreSlug === null) {
      setGenreSlug(slugs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genres]);

  // When the genre changes, pick a sensible default world:
  //   1. Respect the saved world if it's valid in this genre (initial mount only).
  //   2. Otherwise, if there's exactly one world, auto-select it.
  //   3. Otherwise, clear the selection — the player must pick.
  useEffect(() => {
    if (!currentPack) {
      setWorldSlug(null);
      return;
    }
    const available = currentPack.worlds.map((w) => w.slug);

    if (
      isInitialMount.current &&
      saved.world &&
      available.includes(saved.world)
    ) {
      setWorldSlug(saved.world);
    } else if (available.length === 1) {
      setWorldSlug(available[0]);
    } else if (worldSlug && !available.includes(worldSlug)) {
      setWorldSlug(null);
    }
    isInitialMount.current = false;
    // We intentionally don't depend on `worldSlug` here — re-running this
    // effect on every world change would fight the user's selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPack, saved.world]);

  // Start requires only a world selection — player name is collected by
  // AppInner's NamePrompt when mounting at the slug route (if not already
  // stored in localStorage under "sq:display-name").
  const canStart = genreSlug !== null && worldSlug !== null;

  const handleStart = async () => {
    if (!canStart || !genreSlug || !worldSlug) return;
    if (isStarting) return;
    setStartError(null);
    setIsStarting(true);

    // Unlock AudioContext on this user gesture — browsers require a
    // click/tap before audio can play.
    try {
      await AudioEngine.getInstance().ensureResumed();
    } catch {
      // Audio unlock is best-effort; never block game entry.
    }

    // (genre, world, mode, typed_name) match against past journeys —
    // playtest 2026-04-25 BLOCKING bug. Pre-fix the lobby always called
    // POST /api/games and let the server's same-day-same-world-same-mode
    // slug collision silently resume the prior session. That trapped
    // multiplayer: typing a fresh name (e.g. "Lenny") with an existing
    // solo journey for the same world dropped the player into the prior
    // character's seat.
    //
    // Now: if the typed name matches an existing past journey for this
    // (genre, world, mode), navigate straight to that journey's slug —
    // same outcome as clicking the Past Journeys row, just from the
    // Start button. If the typed name does NOT match, mark this start as
    // a forced-new session so the server can disambiguate. Empty name
    // falls through to the default-resume path so the lobby still works
    // for unnamed quick-starts.
    const trimmedTyped = playerName.trim();
    let matchingJourney: JourneyEntry | undefined;
    if (trimmedTyped) {
      matchingJourney = loadHistory().find(
        (e) =>
          e.genre === genreSlug &&
          e.world === worldSlug &&
          e.mode === mode &&
          e.player_name === trimmedTyped &&
          !!e.game_slug,
      );
    }
    if (matchingJourney?.game_slug) {
      // Resume short-circuit. Mirrors handleSelectHistory side-effects so
      // AppInner's slug-mount has the same context whether the user
      // clicked the Past Journeys row or hit Start with a matching name.
      setDisplayName(trimmedTyped);
      saveState(trimmedTyped, genreSlug, worldSlug);
      const prefix = mode === "multiplayer" ? "/play" : "/solo";
      navigate(`${prefix}/${matchingJourney.game_slug}`);
      setIsStarting(false);
      return;
    }

    let result;
    try {
      result = await start({
        genreSlug,
        worldSlug,
        mode,
        playerName: trimmedTyped || undefined,
        // Force-new only fires when the player typed a name that didn't
        // match any past journey for this (genre, world, mode). Without
        // a typed name we have no way to know they meant "fresh session"
        // vs "resume", so we let the server's default same-slug-resume
        // path handle it (matching pre-fix behavior).
        forceNew: trimmedTyped !== "" && matchingJourney === undefined,
      });
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : "Failed to start game. Please try again.",
      );
      setIsStarting(false);
      return;
    } finally {
      // Belt-and-suspenders: ensure isStarting is cleared even on
      // unexpected throws above (setIsStarting(false) is idempotent).
      setIsStarting(false);
    }

    // Only write side-effects after start() succeeds — avoid phantom
    // "Past journeys" entries for sessions that were never created.
    const trimmedName = playerName.trim();
    if (trimmedName) {
      // Writes localStorage and fires the same-tab custom event so
      // AppInner's useDisplayName instance picks up the name without a
      // remount before we navigate to the slug route.
      setDisplayName(trimmedName);
      saveState(trimmedName, genreSlug, worldSlug);
      // game_slug + mode let Past Journeys offer one-click resume
      // instead of starting a new game on every revisit (playtest
      // 2026-04-24 BLOCKING bug).
      appendHistory({
        player_name: trimmedName,
        genre: genreSlug,
        world: worldSlug,
        game_slug: result.slug,
        mode: result.mode,
      });
    }
    navigate(result.url);
  };

  // Click handler for "Past journeys" rows. New entries (post-2026-04-24)
  // carry a game_slug so we navigate straight to the resume route.
  // Old entries lack the slug — fall back to legacy prefill behavior so
  // the player can re-enter and click Begin.
  const handleSelectHistory = useCallback(
    (entry: JourneyEntry) => {
      if (entry.game_slug) {
        // Set displayName ahead of the navigate so AppInner's slug-mount
        // skips NamePrompt and connects immediately. saveState mirrors
        // legacy prefill writes so a subsequent lobby visit shows the
        // same defaults.
        if (entry.player_name) {
          setDisplayName(entry.player_name);
        }
        saveState(entry.player_name, entry.genre, entry.world);
        const prefix = entry.mode === "multiplayer" ? "/play" : "/solo";
        navigate(`${prefix}/${entry.game_slug}`);
        return;
      }
      // Legacy fallback: prefill only.
      setPlayerName(entry.player_name);
      setGenreSlug(entry.genre);
      setWorldSlug(entry.world);
    },
    [navigate, setDisplayName],
  );

  // Pretty-name resolvers for JourneyHistory rows. Fall back to the
  // prettified slug if the genre/world is no longer in the current
  // GenresResponse (pack removed since the history was written).
  const prettyGenreName = useCallback(
    (slug: string) => genres[slug]?.name || prettify(slug),
    [genres],
  );
  const prettyWorldName = useCallback(
    (genreSlugInput: string, worldSlugInput: string) => {
      const pack = genres[genreSlugInput];
      const world = pack?.worlds.find((w) => w.slug === worldSlugInput);
      return world?.name || prettify(worldSlugInput);
    },
    [genres],
  );

  const showGenreError = genreError || Object.keys(genres).length === 0;

  return (
    <div className="flex flex-col items-center min-h-screen px-6 py-12">
      {/* Opening ornament */}
      <span
        aria-hidden="true"
        className="text-muted-foreground/30 text-sm tracking-[0.5em] mb-10"
      >
        ── ◇ ──
      </span>

      <form
        onSubmit={(e) => { e.preventDefault(); void handleStart(); }}
        className="flex flex-col items-center gap-8 w-full max-w-4xl"
      >
        {/* Name prompt */}
        <div className="text-center w-full max-w-sm">
          <label
            htmlFor="player-name"
            className="block text-base italic text-muted-foreground/60 mb-3"
          >
            What name shall be yours?
          </label>
          <input
            id="player-name"
            type="text"
            aria-label="Player name"
            autoFocus
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full bg-transparent border-0 border-b border-muted-foreground/40
                       text-center text-lg text-foreground/90
                       focus:outline-none focus:border-muted-foreground
                       placeholder:text-muted-foreground/60"
            placeholder="Enter your name…"
            disabled={isConnecting}
          />
        </div>

        {/* Genre + World + Preview — two-column on md+, single-column below. */}
        {showGenreError ? (
          <div className="text-center w-full max-w-sm">
            <p id="genre-load-error" className="text-sm italic text-destructive/70 mb-2">
              Could not load worlds. Is the server running?
            </p>
            {onRetryGenres && (
              <button
                type="button"
                onClick={onRetryGenres}
                aria-describedby="genre-load-error"
                className="text-sm italic text-foreground/60 hover:text-foreground
                           transition-colors bg-transparent border-0 cursor-pointer underline"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-8 w-full">
            {/* Left column — genre + world radio lists */}
            <div className="flex flex-col gap-6 md:w-64 shrink-0">
              <section className="flex flex-col min-h-0">
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground/50 mb-2">
                  Genre
                  <span className="not-italic text-muted-foreground/40 ml-1">
                    ({genreItems.length})
                  </span>
                </h2>
                {/* Cap height so the list scrolls inside its frame instead
                    of pushing the page below the fold; ensures Sebastien-
                    type players see all packs without needing to discover
                    that the page itself scrolls. */}
                <div className="max-h-[40vh] flex flex-col min-h-0">
                  <OptionList
                    ariaLabel="Genre"
                    items={genreItems}
                    selected={genreSlug}
                    onSelect={setGenreSlug}
                    disabled={isConnecting}
                  />
                </div>
              </section>

              {currentPack && worldItems.length > 0 && (
                <section className="flex flex-col min-h-0">
                  <h2 className="text-xs uppercase tracking-widest text-muted-foreground/50 mb-2">
                    World
                    <span className="not-italic text-muted-foreground/40 ml-1">
                      ({worldItems.length})
                    </span>
                  </h2>
                  <div className="max-h-[40vh] flex flex-col min-h-0">
                    <OptionList
                      ariaLabel="World"
                      items={worldItems}
                      selected={worldSlug}
                      onSelect={setWorldSlug}
                      disabled={isConnecting}
                    />
                  </div>
                </section>
              )}
            </div>

            {/* Right column — mode picker + world preview. Mode sits above
                the preview so it doesn't feel like a footnote buried beneath
                the world description — Sebastien-tier readers need mode to
                read as a real decision. */}
            <div className="flex-1 flex flex-col gap-4">
              {worldSlug && (
                <div className="px-6">
                  <ModePicker value={mode} onChange={setMode} />
                </div>
              )}
              <WorldPreview pack={currentPack} world={currentWorld} />
            </div>
          </div>
        )}

        {/* Live presence panel — shows who else is in the selected world. */}
        {!showGenreError && <CurrentSessions sessions={sessionsForWorld} />}

        {/* Past journeys — localStorage-backed prefill convenience. */}
        {!showGenreError && (
          <JourneyHistory
            onSelect={handleSelectHistory}
            prettyGenre={prettyGenreName}
            prettyWorld={prettyWorldName}
          />
        )}

        {/* Error — covers both the prop-passed connection error and start() failures.
            Both sources are joined so neither silently masks the other. */}
        {[error, startError].filter(Boolean).join(" — ") && (
          <p role="alert" className="text-sm italic text-destructive/70">
            {[error, startError].filter(Boolean).join(" — ")}
          </p>
        )}

        {/* Connecting state */}
        {isConnecting && (
          <p
            role="status"
            className="text-sm italic text-muted-foreground/50 animate-pulse"
          >
            The pages are turning…
          </p>
        )}

        {/* Closing ornament + submit */}
        <div className="flex flex-col items-center gap-4 mt-4">
          <span
            aria-hidden="true"
            className="text-muted-foreground/30 text-sm tracking-[0.5em]"
          >
            ── ◇ ──
          </span>
          <button
            type="button"
            data-testid="lobby-start-button"
            onClick={handleStart}
            disabled={!canStart || isConnecting || isStarting}
            title={
              !canStart
                ? "Choose a genre and world to begin"
                : undefined
            }
            className="text-lg font-semibold uppercase tracking-[0.25em]
                       text-[var(--primary-foreground)] bg-[var(--primary)]
                       hover:bg-[var(--primary)]/90 hover:shadow-[0_0_24px_rgba(255,255,255,0.08)]
                       disabled:bg-muted/40 disabled:text-muted-foreground/40
                       disabled:cursor-default disabled:shadow-none
                       transition-all border-0
                       focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60
                       focus-visible:outline-none
                       rounded-md px-10 py-3.5 cursor-pointer
                       shadow-[0_0_16px_rgba(0,0,0,0.3)]"
          >
            {isStarting
              ? "Starting..."
              : mode === "multiplayer"
                ? "Start or Join Adventure"
                : "Start Adventure"}
          </button>
        </div>
      </form>
    </div>
  );
}
