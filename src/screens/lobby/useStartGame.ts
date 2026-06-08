import { useCallback } from 'react';

export type StartGameInput = {
  genreSlug: string;
  worldSlug: string;
  mode: 'solo' | 'multiplayer';
  /**
   * Display name typed into the lobby. Sent through to the server as
   * `player_name` so it can disambiguate slug collisions when the typed
   * name does not match the existing session's player (playtest
   * 2026-04-25 BLOCKING bug — typing "Lenny" silently resumed Laverne).
   *
   * Optional only for backward-compat with callers that legitimately do
   * not collect a name — production lobby always passes it.
   */
  playerName?: string;
  /**
   * When true, signal the server that the lobby decided this should be a
   * fresh session even if a same-day same-mode same-world slug already
   * exists. Used after a (genre, world, mode, typed_name) miss against
   * the local Past Journeys list — see ConnectScreen.handleStart.
   *
   * The server is free to honor this by minting a disambiguated slug.
   * No silent fallbacks: if the server ignores the flag and returns the
   * colliding slug, the user lands in the prior session — that is a
   * server-side fix to file separately, not a UI workaround to add.
   */
  forceNew?: boolean;
};

export type StartGameResult = {
  /** Pre-built navigation target (e.g. "/solo/2026-04-24-flickering_reach"). */
  url: string;
  /** Server-assigned game slug — needed by callers that record history. */
  slug: string;
  /** Game mode echoed back from the server. */
  mode: 'solo' | 'multiplayer';
  /**
   * True when the server re-attached to an existing same-slug session
   * instead of creating a fresh one (200 vs 201). Silent-MP-resume
   * masquerade (sq-playtest 2026-06-07): the lobby must announce the
   * resume instead of presenting it as a fresh creation.
   */
  resumed: boolean;
  /**
   * Names of the characters already in the resumed session (server #754
   * `existing_characters`). Empty for fresh games and for resumed
   * sessions with no persisted snapshot yet.
   */
  existingCharacters: string[];
};

export function useStartGame() {
  const start = useCallback(async (input: StartGameInput): Promise<StartGameResult> => {
    // Trim the typed name once; an empty string after trimming should not
    // be sent (the server treats an empty player_name as "no signal").
    const trimmedName = input.playerName?.trim();
    const requestBody: Record<string, unknown> = {
      genre_slug: input.genreSlug,
      world_slug: input.worldSlug,
      mode: input.mode,
    };
    if (trimmedName) requestBody.player_name = trimmedName;
    if (input.forceNew) requestBody.force_new = true;
    const resp = await fetch('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!resp.ok) throw new Error(`start game failed: ${resp.status}`);
    const body = await resp.json();
    const mode: 'solo' | 'multiplayer' = body.mode === 'multiplayer' ? 'multiplayer' : 'solo';
    const prefix = mode === 'solo' ? '/solo' : '/play';
    return {
      url: `${prefix}/${body.slug}`,
      slug: body.slug,
      mode,
      resumed: body.resumed === true,
      existingCharacters: Array.isArray(body.existing_characters)
        ? body.existing_characters.filter((n: unknown): n is string => typeof n === 'string')
        : [],
    };
  }, []);
  return { start };
}
