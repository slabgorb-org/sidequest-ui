import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ReferenceLinks } from "@/components/ReferenceLinks";

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

  // Scene Library — fixture metadata from GET /dev/scenes.
  const [scenes, setScenes] = useState<
    { name: string; genre: string; world: string; description: string | null }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/dev/scenes")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setScenes(data);
      })
      .catch(() => {
        /* Scene library fetch failure is non-fatal — section stays empty. */
      });
    return () => { cancelled = true; };
  }, []);

  // Live multiplayer presence — drives both the per-world "X here"
  // annotations on the world list and the CurrentSessions panel below
  // the preview. Polls /api/sessions every 15s while the lobby is open.
  // No genre filter: the flat world picker shows presence across every
  // genre at once.
  const { sessions: activeSessions } = useSessions({ pollMs: 15000 });

  // Pre-compute "N here" annotations keyed by composite "genre/world"
  // slug so the flat world list can show at-a-glance presence without
  // collapsing same-named worlds across genres.
  const worldPresence: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of activeSessions) {
      const key = `${session.genre}/${session.world}`;
      counts[key] = (counts[key] ?? 0) + session.players.length;
    }
    return counts;
  }, [activeSessions]);

  // Flat list of every world across every genre, sorted by world label.
  // Composite "genre/world" slug keeps OptionList rows unique even when
  // two genres ship a world with the same slug. Genre name renders as a
  // hint so Sebastien-tier players can see which rule pack a world rides.
  const worldItems: OptionItem[] = useMemo(() => {
    const items: OptionItem[] = [];
    for (const [gSlug, gMeta] of Object.entries(genres)) {
      const genreLabel = gMeta.name || prettify(gSlug);
      for (const w of gMeta.worlds) {
        const composite = `${gSlug}/${w.slug}`;
        const count = worldPresence[composite] ?? 0;
        items.push({
          slug: composite,
          label: w.name || prettify(w.slug),
          hint: genreLabel,
          annotation: count > 0 ? `· ${count} here` : undefined,
        });
      }
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
  }, [genres, worldPresence]);

  // Composite slug used by the OptionList to track the active row.
  const selectedComposite =
    genreSlug && worldSlug ? `${genreSlug}/${worldSlug}` : null;

  const handleSelectWorld = useCallback((composite: string) => {
    const slash = composite.indexOf("/");
    if (slash < 0) return;
    setGenreSlug(composite.slice(0, slash));
    setWorldSlug(composite.slice(slash + 1));
  }, []);

  const currentPack: GenreMeta | null =
    genreSlug && genres[genreSlug] ? genres[genreSlug] : null;

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

  // Auto-select if the entire catalog has exactly one world (and the user
  // has not already chosen one — e.g. from saved state).
  useEffect(() => {
    if (worldItems.length === 1 && selectedComposite === null) {
      handleSelectWorld(worldItems[0].slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldItems.length]);

  // If saved state references a world that no longer exists in the
  // catalog (pack removed since last visit), clear the stale selection
  // so the picker doesn't sit in an invalid state.
  useEffect(() => {
    if (
      selectedComposite &&
      worldItems.length > 0 &&
      !worldItems.some((item) => item.slug === selectedComposite)
    ) {
      setGenreSlug(null);
      setWorldSlug(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldItems]);

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

        {/* World + Preview — two-column on md+, single-column below. The
            lobby flattened genre→world into a single world list (2026-05-05);
            genre name renders as a hint on each row so the rules pack is
            still visible without a second pick step. */}
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
            {/* Left column — flat world radio list */}
            <div className="flex flex-col gap-6 md:w-64 shrink-0">
              <section className="flex flex-col min-h-0">
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground/50 mb-2">
                  World
                  <span className="not-italic text-muted-foreground/40 ml-1">
                    ({worldItems.length})
                  </span>
                </h2>
                {/* Cap height so the list scrolls inside its frame instead
                    of pushing the page below the fold; ensures Sebastien-
                    type players see all packs without needing to discover
                    that the page itself scrolls. */}
                <div className="max-h-[60vh] flex flex-col min-h-0">
                  <OptionList
                    ariaLabel="World"
                    items={worldItems}
                    selected={selectedComposite}
                    onSelect={handleSelectWorld}
                    disabled={isConnecting}
                  />
                </div>
              </section>
              {/* Reference surface — always visible; disabled until a world
                  is selected (which sets both genreSlug and worldSlug
                  simultaneously via handleSelectWorld). */}
              <ReferenceLinks pack={genreSlug} world={worldSlug} />
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

        {/* Scene Library — fixture picker for quick scene loading. */}
        <section className="w-full max-w-4xl">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground/50 mb-3">
            Scene Library
          </h2>
          {scenes.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {scenes.map((scene) => (
                <button
                  key={scene.name}
                  type="button"
                  onClick={() => navigate(`/?scene=${scene.name}`)}
                  className="text-left p-3 rounded-md border border-muted-foreground/20
                             hover:border-muted-foreground/40 hover:bg-muted/20
                             transition-colors cursor-pointer bg-transparent"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground/90">
                      {scene.name}
                    </span>
                    <span className="text-[0.65rem] uppercase tracking-wider px-1.5 py-0.5
                                     rounded bg-muted/40 text-muted-foreground/70">
                      {prettify(scene.genre)}
                    </span>
                  </div>
                  {scene.description && (
                    <p className="text-xs text-muted-foreground/60 line-clamp-2">
                      {scene.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

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
                ? "Choose a world to begin"
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
