// Lobby → Start → slug-connect wiring test (playtest 2026-04-24 BLOCKING bug)
//
// Bug: after playing one game and clicking Leave, starting a fresh game from
// the lobby (any genre) hung on the post-POST navigate. POST /api/games
// returned 201 + the new slug, the URL flipped to /solo/<new-slug>, AppInner
// saw the slug param change — but the slug-connect effect short-circuited
// on the `if (slugConnectFired.current) return;` gate. No GET /api/games/:slug
// was issued, no WebSocket opened, the UI stuck on "The pages are turning…".
//
// Root cause: react-router-dom v6 reconciles routes by element type + position.
// "/" and "/solo/:slug" both render `<LobbyRoot />` from separate <Route>
// declarations — same type at the same reconciler slot inside <Routes> →
// React reuses the AppInner instance across navigate(). All refs survive,
// including `slugConnectFired.current` which is latched to `true` after the
// first session's successful connect. `handleLeave` reset several refs
// (autoReconnectAttempted, seenEventKeys, sessionPhaseRef) but missed this
// one. On the second game's slug-connect effect run, the latch blocks the
// fetch and WS connect — the only escape is a full page reload (typing the
// URL manually), which re-mounts AppInner with ref defaults.
//
// Fix: handleLeave explicitly clears `slugConnectFired.current`,
// `justConnectedRef.current`, `gameMetaError`, and `currentGenre` so the
// next game starts from a clean slate.
//
// This test drives the exact playtest sequence:
//   1. Fresh mount at /solo/:slug-A (simulates the first game in progress).
//   2. Server sends SESSION_EVENT{ready} → AppInner enters game phase.
//   3. Click Leave → navigates back to "/".
//   4. Lobby renders ConnectScreen with pre-filled genre/world.
//   5. Click Start → POST /api/games returns {slug: slug-B, ...}.
//   6. Assert: a NEW WebSocket connects AND SESSION_EVENT{connect, game_slug: slug-B}
//      arrives WITHOUT any manual re-navigation.

import { StrictMode } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WS } from 'jest-websocket-mock';
import { installWebAudioMock, installLocalStorageMock } from '@/audio/__tests__/web-audio-mock';
import { AudioEngine } from '@/audio/AudioEngine';
import App from '../App';

const LOBBY_STORAGE_KEY = 'sidequest-connect';

const GENRES_RESPONSE = {
  low_fantasy: {
    name: 'Low Fantasy',
    description: 'Gritty medieval adventures.',
    worlds: [
      {
        slug: 'greyhawk',
        name: 'Greyhawk',
        description: 'The Flanaess.',
        era: null,
        setting: null,
        inspirations: [],
        axis_snapshot: {},
        hero_image: null,
      },
    ],
  },
};

const FIRST_SLUG = '2026-04-24-first-session';
const SECOND_SLUG = '2026-04-24-second-session';

const GAME_META = {
  genre_slug: 'low_fantasy',
  world_slug: 'greyhawk',
  mode: 'solo',
};

// Fetch mock that returns SECOND_SLUG for every POST /api/games (the test
// only exercises one Start click on the lobby path, so a single slug is
// sufficient — FIRST_SLUG comes from the initial route entry).
function makeFetchMock() {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && /\/api\/games\/[^?]+/.test(url) && (!opts || opts.method !== 'POST')) {
      return Promise.resolve(
        new Response(JSON.stringify(GAME_META), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (typeof url === 'string' && url === '/api/games' && opts?.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ slug: SECOND_SLUG, mode: 'solo' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (typeof url === 'string' && url.startsWith('/api/sessions')) {
      return Promise.resolve(
        new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (typeof url === 'string' && url.includes('/api/genres')) {
      return Promise.resolve(
        new Response(JSON.stringify(GENRES_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  vi.stubGlobal('fetch', makeFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-archetype');
});

describe('lobby → slug navigation — Leave + Start fresh game (playtest 2026-04-24 hang bug)', () => {
  it('fresh lobby Start opens WebSocket + sends SESSION_EVENT{connect} for the new slug', async () => {
    // Initial sanity: on a clean page load, the very first Start click must
    // open the WS. This is the "first game of the session" smoke case.
    localStorage.setItem(
      LOBBY_STORAGE_KEY,
      JSON.stringify({
        playerName: 'Keith',
        genre: 'low_fantasy',
        world: 'greyhawk',
      }),
    );

    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    const user = userEvent.setup();

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );

    const startBtn = await screen.findByRole('button', { name: /start/i });
    await user.click(startBtn);

    await server.connected;
    const msg = (await server.nextMessage) as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(msg.type).toBe('SESSION_EVENT');
    expect(msg.payload.event).toBe('connect');
    expect(msg.payload.game_slug).toBe(SECOND_SLUG);
    expect(msg.payload.player_name).toBe('Keith');
  });

  it('Leave + Start opens a new WebSocket for the new slug (no manual re-navigate)', async () => {
    // Playtest 2026-04-24 exact repro: finish a game, click Leave (which
    // navigates to "/"), pick a world in the lobby, click Start. Must open
    // a WS and send SESSION_EVENT{connect} for the NEW slug — not hang on
    // the "pages are turning" loader because slugConnectFired is stale.
    localStorage.setItem(
      LOBBY_STORAGE_KEY,
      JSON.stringify({
        playerName: 'Keith',
        genre: 'low_fantasy',
        world: 'greyhawk',
      }),
    );
    localStorage.setItem('sq:display-name', 'Keith');
    // Seed journey history with FIRST_SLUG so the slug-connect trust gate
    // (App.tsx, slug-mode "is this slug known?" check) recognizes us as the
    // client that created this game. As of the 2026-06-05 [BAR-1] tightening
    // the gate requires BOTH a matching slug AND a matching player_name, so
    // the seeded entry's player_name MUST equal the `sq:display-name` this
    // mount runs under ('Keith'). A non-matching name (the historical 'Tarn'
    // seed) fails the gate, the slug-connect effect returns early, the
    // NamePrompt stays up, no WebSocket is ever built, and the first
    // `await firstServer.connected` hangs to the 5s timeout.
    //
    // In the real playtest flow this history entry is written by
    // ConnectScreen.handleStart before it navigates to /solo/<slug>; the test
    // mounts directly at /solo/<slug> and so must seed it here.
    //
    // The matching-journey resume short-circuit in ConnectScreen.handleStart
    // (typed name that matches a past journey resumes that slug instead of
    // POSTing) is NOT a concern for the second Start click: history is wiped
    // via removeItem('sidequest-history') below, so no entry can match and the
    // lobby POSTs for a fresh slug — exactly the scenario this test covers.
    localStorage.setItem(
      'sidequest-history',
      JSON.stringify([
        {
          player_name: 'Keith',
          genre: 'low_fantasy',
          world: 'greyhawk',
          game_slug: FIRST_SLUG,
          mode: 'solo',
          last_played_iso: new Date().toISOString(),
        },
      ]),
    );

    const wsUrl = `ws://${location.host}/ws`;
    const firstServer = new WS(wsUrl, { jsonProtocol: true });

    const user = userEvent.setup();

    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/solo/${FIRST_SLUG}`]}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );

    // Boot the first session through connect → ready so GameBoard (and its
    // Leave button) mounts. This mirrors the real playtest state.
    await firstServer.connected;
    const firstConnect = (await firstServer.nextMessage) as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(firstConnect.payload.game_slug).toBe(FIRST_SLUG);

    act(() => {
      firstServer.send({ type: 'SESSION_EVENT', payload: { event: 'ready' } });
    });

    // Leave button lives in the running header. Click it — AppInner should
    // disconnect and navigate("/") so ConnectScreen renders.
    const leaveBtn = await screen.findByRole('button', { name: /^leave$/i });
    await user.click(leaveBtn);

    // Back at "/" — ConnectScreen's Start button must be reachable.
    const startBtn = await screen.findByTestId('lobby-start-button');

    // Clear journey history before the second Start click. By now the
    // first-mount slug-connect effect has appended a (Keith, low_fantasy,
    // greyhawk, FIRST_SLUG) entry that would otherwise match the lobby's
    // prefill — the matching-journey resume short-circuit (ConnectScreen,
    // commit 1436ebd) would then re-navigate to FIRST_SLUG instead of
    // POSTing for a new one, which neuters the regression coverage. Wiping
    // history mirrors the realistic "user decides to start fresh, not
    // resume" path; the seeded Keith entry was only needed for the
    // first-mount trust gate.
    localStorage.removeItem('sidequest-history');

    // Stand up a SECOND WS server — the first one is closed via disconnect().
    // A fresh WS object is about to be created by the slug-connect effect
    // for the new slug. `jest-websocket-mock` doesn't queue handshakes across
    // two sequential WS servers at the same URL cleanly, so we close the
    // first and build the second before the click.
    firstServer.close();
    WS.clean();
    const secondServer = new WS(wsUrl, { jsonProtocol: true });

    await user.click(startBtn);

    // THE GATE: this is where the bug hit. Without the fix,
    // `slugConnectFired.current` is still true from the first session, the
    // slug-connect effect short-circuits, and `secondServer.connected` never
    // resolves — the test times out.
    await secondServer.connected;
    const secondConnect = (await secondServer.nextMessage) as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(secondConnect.type).toBe('SESSION_EVENT');
    expect(secondConnect.payload.event).toBe('connect');
    expect(secondConnect.payload.game_slug).toBe(SECOND_SLUG);
    expect(secondConnect.payload.player_name).toBe('Keith');
  });
});
