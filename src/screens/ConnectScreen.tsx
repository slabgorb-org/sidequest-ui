import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { AudioEngine } from "@/audio/AudioEngine";
import type { GenresResponse, GenreMeta, WorldMeta } from "@/types/genres";
import {
  GenreAccordion,
  type AccordionGenre,
  type AccordionWorld,
} from "./lobby/GenreAccordion";
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
import { getArchetypeForGenre } from "@/hooks/useChromeArchetype";
import { getGenreArt } from "./lobby/genreArt";

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
  } catch (err) {
    console.warn("[lobby] failed to read saved connect state", err);
    return {};
  }
}

function saveState(playerName: string, genre: string, world: string) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ playerName, genre, world }),
    );
  } catch (err) {
    console.warn("[lobby] failed to persist connect state", err);
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
  // `undefined` = follow the default-open rule (selected world's genre, else
  // the first genre); a string pins one genre open; `null` collapses all.
  const [openGenre, setOpenGenre] = useState<string | null | undefined>(
    undefined,
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
      .catch((err) => {
        console.warn(
          "[lobby] /dev/scenes fetch failed — scene library stays empty",
          err,
        );
      });
    return () => { cancelled = true; };
  }, []);

  // Live multiplayer presence — drives both the per-genre presence dots and
  // the CurrentSessions panel below the preview. Polls /api/sessions every 15s
  // while the lobby is open. No genre filter: presence spans every genre.
  const { sessions: activeSessions } = useSessions({ pollMs: 15000 });

  // Pre-compute "N here" annotations keyed by composite "genre/world" slug so
  // the accordion can show at-a-glance presence without collapsing same-named
  // worlds across genres.
  const worldPresence: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of activeSessions) {
      const key = `${session.genre}/${session.world}`;
      counts[key] = (counts[key] ?? 0) + session.players.length;
    }
    return counts;
  }, [activeSessions]);

  // Worlds grouped by genre for the accordion. Genres render in the order the
  // server emits them (insertion order) — NOT alphabetised — so the first
  // genre is a deterministic default-open target and packs keep their authored
  // ordering. Composite "genre/world" slug keeps rows unique across genres
  // that ship same-slug worlds.
  const accordionGenres: AccordionGenre[] = useMemo(() => {
    const out: AccordionGenre[] = [];
    for (const [gSlug, gMeta] of Object.entries(genres)) {
      const worlds: AccordionWorld[] = [];
      let here = 0;
      for (const w of gMeta.worlds) {
        const composite = `${gSlug}/${w.slug}`;
        const count = worldPresence[composite] ?? 0;
        here += count;
        worlds.push({
          slug: composite,
          label: w.name || prettify(w.slug),
          annotation: count > 0 ? `${count} here` : undefined,
        });
      }
      if (worlds.length === 0) continue;
      out.push({
        slug: gSlug,
        label: gMeta.name || prettify(gSlug),
        worlds,
        here,
      });
    }
    return out;
  }, [genres, worldPresence]);

  const worldCount = useMemo(
    () => accordionGenres.reduce((n, g) => n + g.worlds.length, 0),
    [accordionGenres],
  );
  const genreCount = accordionGenres.length;

  const allWorldItems = useMemo(
    () => accordionGenres.flatMap((g) => g.worlds),
    [accordionGenres],
  );

  const firstGenreSlug = accordionGenres[0]?.slug ?? null;

  // Composite slug used by the accordion to track the active row.
  const selectedComposite =
    genreSlug && worldSlug ? `${genreSlug}/${worldSlug}` : null;

  // A saved genre whose pack has since been removed from the catalogue must
  // not drive selection/accent/archetype: it crashes getArchetypeForGenre and
  // wedges the accordion open on a genre that no longer exists. Sanitise once
  // and use the validated slug for every derived/presentation lookup (story
  // 83-2 AC3d). The raw genreSlug state is kept for the start/save paths, which
  // only fire on a user selection of a live world.
  const validGenreSlug = genreSlug && genres[genreSlug] ? genreSlug : null;

  // Effective open genre: the explicit pin, else the selected (live) world's
  // genre, else the first genre. Derived (not stored) so it self-corrects when
  // the catalogue arrives asynchronously or a saved pack was removed.
  const effectiveOpenGenre =
    openGenre === undefined ? (validGenreSlug ?? firstGenreSlug) : openGenre;

  const handleToggleGenre = (slug: string) => {
    // Reuse the already-derived effective-open value rather than recomputing
    // the default-open fallback chain. Event handlers see the current render's
    // state, so effectiveOpenGenre is up to date here.
    setOpenGenre(effectiveOpenGenre === slug ? null : slug);
  };

  const handleSelectWorld = useCallback((composite: string) => {
    const slash = composite.indexOf("/");
    if (slash < 0) return;
    setGenreSlug(composite.slice(0, slash));
    setWorldSlug(composite.slice(slash + 1));
  }, []);

  const currentPack: GenreMeta | null =
    validGenreSlug ? genres[validGenreSlug] : null;

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
    if (allWorldItems.length === 1 && selectedComposite === null) {
      handleSelectWorld(allWorldItems[0].slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWorldItems.length]);

  // If saved state references a world that no longer exists in the
  // catalog (pack removed since last visit), clear the stale selection
  // so the picker doesn't sit in an invalid state.
  useEffect(() => {
    if (
      selectedComposite &&
      allWorldItems.length > 0 &&
      !allWorldItems.some((item) => item.slug === selectedComposite)
    ) {
      setGenreSlug(null);
      setWorldSlug(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWorldItems]);

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
      // Legacy fallback: prefill only. Reset the open-genre pin to undefined
      // so the accordion opens the prefilled genre by the default rule.
      setPlayerName(entry.player_name);
      setGenreSlug(entry.genre);
      setWorldSlug(entry.world);
      setOpenGenre(undefined);
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

  const genresEmpty = Object.keys(genres).length === 0;
  // Only a genuine fetch failure shows the error. App sets `genreError` on a
  // failed request AND on a successful-but-empty response, so an empty
  // catalogue with `genreError === false` is the in-flight cold-mount state —
  // show a neutral loading state, not "the server is down" (story 83-2 AC4).
  const showGenreError = genreError;
  const showWorldsLoading = !genreError && genresEmpty;

  return (
    <div
      className="lobby-folio flex flex-col items-center min-h-screen px-6 py-10"
      data-testid="lobby-accent-root"
      data-genre={validGenreSlug ?? undefined}
      style={{ "--accent": getGenreArt(validGenreSlug).accent } as CSSProperties}
    >
      <div className="w-full max-w-5xl">
        {/* ── Masthead — the opening ritual ── */}
        <div className="text-center mb-8">
          <span
            aria-hidden="true"
            className="text-muted-foreground/30 text-sm tracking-[0.5em] select-none"
          >
            ── ◇ ──
          </span>
          <h1 className="lobby-wordmark mt-4 mb-1 text-5xl md:text-6xl leading-none tracking-wide text-foreground/95">
            SideQuest
          </h1>
          <p className="italic text-muted-foreground/70 text-base">
            An evening's adventure, told by lamplight.
          </p>

          {/* Name ritual */}
          <div className="mt-6 mx-auto max-w-sm text-center">
            <label
              htmlFor="player-name"
              className="block text-base italic text-muted-foreground/60 mb-2"
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
                         focus:outline-none focus:border-[var(--accent)]
                         placeholder:text-muted-foreground/40"
              placeholder="Enter your name…"
              disabled={isConnecting}
            />
          </div>
        </div>

        {showGenreError ? (
          <div className="text-center w-full max-w-sm mx-auto">
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
        ) : showWorldsLoading ? (
          <div
            data-testid="lobby-worlds-loading"
            role="status"
            className="text-center w-full max-w-sm mx-auto"
          >
            <p className="text-sm italic text-muted-foreground/60 animate-pulse motion-reduce:animate-none">
              Gathering the worlds…
            </p>
          </div>
        ) : (
          <>
            {/* ── Folio card — two-pane: genre accordion index + preview ── */}
            <div
              data-testid="lobby-folio"
              className="grid grid-cols-[296px_1fr] max-[880px]:grid-cols-1 border border-[var(--accent)]/25
                         bg-[linear-gradient(180deg,rgba(34,26,16,0.5),rgba(26,20,13,0.5))]
                         shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            >
              {/* World index */}
              <div className="min-[881px]:border-r border-b min-[881px]:border-b-0 border-[var(--accent)]/20 py-4 flex flex-col min-w-0">
                <div className="flex items-baseline justify-between px-5 pb-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground/60">
                  <span className="text-foreground/90 font-semibold">Worlds</span>
                  <span
                    data-testid="lobby-world-count"
                    className="opacity-70 normal-case tracking-normal"
                  >
                    {worldCount} {worldCount === 1 ? "world" : "worlds"} across{" "}
                    {genreCount} {genreCount === 1 ? "genre" : "genres"}
                  </span>
                </div>
                <GenreAccordion
                  genres={accordionGenres}
                  selected={selectedComposite}
                  openGenre={effectiveOpenGenre}
                  onToggleGenre={handleToggleGenre}
                  onSelectWorld={handleSelectWorld}
                  disabled={isConnecting}
                />
              </div>

              {/* Preview + commit row */}
              <div className="flex flex-col min-w-0">
                <WorldPreview
                  pack={currentPack}
                  world={currentWorld}
                  archetype={validGenreSlug ? getArchetypeForGenre(validGenreSlug) : null}
                  genreSlug={validGenreSlug}
                  loreHref={
                    validGenreSlug && worldSlug
                      ? `/reference/lore/${validGenreSlug}/${worldSlug}`
                      : null
                  }
                />

                {/* Commit row — mode + reference links + start. Always present
                    so Start is reachable (disabled) before a world is chosen. */}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-[var(--accent)]/20 max-[560px]:flex-col max-[560px]:items-stretch">
                  <div className="min-w-[12rem]">
                    <ModePicker value={mode} onChange={setMode} />
                  </div>
                  <div className="flex items-center gap-5 max-[560px]:w-full max-[560px]:flex-col max-[560px]:items-stretch">
                    {validGenreSlug && (
                      <a
                        href={`/reference/rules/${validGenreSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm underline underline-offset-4 text-muted-foreground/70 hover:text-foreground"
                      >
                        Rules
                      </a>
                    )}
                    <button
                      type="button"
                      data-testid="lobby-start-button"
                      onClick={handleStart}
                      disabled={!canStart || isConnecting || isStarting}
                      title={!canStart ? "Choose a world to begin" : undefined}
                      className="font-semibold uppercase tracking-[0.22em] whitespace-nowrap max-[560px]:w-full
                                 text-[var(--primary-foreground)] bg-[var(--accent)]
                                 hover:shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_45%,transparent)]
                                 disabled:bg-muted/40 disabled:text-muted-foreground/40
                                 disabled:cursor-default disabled:shadow-none
                                 transition-all border-0
                                 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60
                                 focus-visible:outline-none
                                 px-7 py-3 cursor-pointer
                                 shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_28%,transparent)]"
                    >
                      {isStarting
                        ? "Starting..."
                        : mode === "multiplayer"
                          ? "Start or Join Adventure"
                          : "Start Adventure"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Below the fold ── */}
            <div className="mt-8 grid min-[881px]:grid-cols-2 gap-x-10 gap-y-8">
              {/* Live presence panel — who else is in the selected world. */}
              <CurrentSessions sessions={sessionsForWorld} />

              {/* Past journeys — localStorage-backed resume convenience. */}
              <JourneyHistory
                onSelect={handleSelectHistory}
                prettyGenre={prettyGenreName}
                prettyWorld={prettyWorldName}
              />
            </div>
          </>
        )}

        {/* Scene Library — fixture picker for quick scene loading. */}
        <section className="w-full mt-8">
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
                             hover:border-[var(--accent)]/50 hover:bg-muted/20
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
          <p role="alert" className="mt-6 text-center text-sm italic text-destructive/70">
            {[error, startError].filter(Boolean).join(" — ")}
          </p>
        )}

        {/* Connecting state */}
        {isConnecting && (
          <p
            role="status"
            className="mt-6 text-center text-sm italic text-muted-foreground/50 animate-pulse motion-reduce:animate-none"
          >
            The pages are turning…
          </p>
        )}

        {/* Closing ornament */}
        <div className="text-center mt-10">
          <span
            aria-hidden="true"
            className="text-muted-foreground/30 text-sm tracking-[0.5em]"
          >
            ── ◇ ──
          </span>
        </div>
      </div>
    </div>
  );
}
