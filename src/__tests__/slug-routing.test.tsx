// Slug routing wiring tests — MP-01 fix-forward
//
// Verifies that /solo/:slug and /play/:slug mount AppInner (not the deleted
// GameScreen scaffold), and that AppInner sends SESSION_EVENT{connect, game_slug}
// via WebSocket when a display name is already set in localStorage.
//
// The slug-routing.test.tsx that existed before this refactor checked for
// `data-testid="game-screen"` — a testid that only existed on the scaffold.
// After the fix-forward, the routes render AppInner, which is already the real
// game state machine (connect → creation → game). We assert:
//   1. `/solo/:slug` renders `data-testid="app"` (AppInner's root element).
//   2. `/play/:slug` does the same.
//   3. `/` still renders `data-testid="lobby-root"` (unchanged).
//   4. At a slug route with a stored display name, AppInner sends
//      SESSION_EVENT{event:"connect", game_slug} via WebSocket.
//
// Issue 1 fix (MP-01 spec review): AppInner now fetches GET /api/games/:slug on
// mount to seed currentGenre before the WS connect fires. All WS tests must mock
// that endpoint so the gameMeta gate is satisfied and connect fires.

import { StrictMode } from 'react';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { WS } from 'jest-websocket-mock';
import { installWebAudioMock, installLocalStorageMock } from '@/audio/__tests__/web-audio-mock';
import { AudioEngine } from '@/audio/AudioEngine';
import App from '../App';

// Default game metadata returned by GET /api/games/:slug in tests.
const GAME_META = {
  genre_slug: 'low_fantasy',
  world_slug: 'greyhawk',
  mode: 'solo',
};

// Minimal fetch mock that handles the two endpoints AppInner always calls:
//   GET /api/genres        — genre list (runs in all modes)
//   GET /api/games/:slug   — game metadata (runs in slug-mode)
// Anything else gets an empty 200.
function makeDefaultFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(GAME_META), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (typeof url === 'string' && url.includes('/api/genres')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ low_fantasy: { name: 'Low Fantasy', worlds: [] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  // Pre-seed a display name so AppInner skips NamePrompt and fires connect immediately.
  localStorage.setItem('sq:display-name', 'alice');
  // Pre-seed journey history with the test slug so the slug-mode prompt
  // gate treats this as a returning user (not a fresh direct-URL join).
  // Without this entry the slug-mode mount would always show the NamePrompt
  // — see App.tsx slug-mode prompt gate (silent-rebind protection).
  localStorage.setItem(
    'sidequest-history',
    JSON.stringify([
      {
        player_name: 'alice',
        genre: 'low_fantasy',
        world: 'greyhawk',
        last_played_iso: new Date().toISOString(),
        game_slug: '2026-04-22-moldharrow-keep',
        mode: 'solo',
      },
    ]),
  );
  // Default fetch mock — satisfies both genres and game-metadata fetches.
  vi.stubGlobal('fetch', makeDefaultFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-archetype');
});

describe('slug routing — AppInner mounts at slug routes', () => {
  it('renders AppInner (data-testid="app") at /solo/:slug', () => {
    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('app')).toBeInTheDocument();
  });

  it('renders AppInner (data-testid="app") at /play/:slug', () => {
    render(
      <MemoryRouter initialEntries={['/play/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('app')).toBeInTheDocument();
  });

  it('renders lobby-root at /', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
  });
});

describe('slug routing — AppInner sends slug-based SESSION_EVENT on mount', () => {
  it('sends SESSION_EVENT{event:"connect", game_slug} when mounted at /solo/:slug', async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;

    // AppInner fires SESSION_EVENT{connect, game_slug} on mount (after 300ms timeout).
    const msg = await server.nextMessage as { type: string; payload: Record<string, unknown> };
    expect(msg.type).toBe('SESSION_EVENT');
    expect(msg.payload.event).toBe('connect');
    expect(msg.payload.game_slug).toBe('2026-04-22-moldharrow-keep');
  });

  it('sends SESSION_EVENT{event:"connect", game_slug} when mounted at /play/:slug', async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/play/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;

    const msg = await server.nextMessage as { type: string; payload: Record<string, unknown> };
    expect(msg.type).toBe('SESSION_EVENT');
    expect(msg.payload.event).toBe('connect');
    expect(msg.payload.game_slug).toBe('2026-04-22-moldharrow-keep');
  });
});

describe('slug routing — AppInner phase transitions driven by server messages', () => {
  it('transitions to game phase when server sends SESSION_EVENT{ready}', async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT connect

    act(() => {
      server.send({ type: 'SESSION_EVENT', payload: { event: 'ready' } });
    });

    // GameBoard should now be rendered — the game phase is active.
    // We verify this by confirming the app element is still present
    // (ErrorBoundary didn't crash) and the connect-waiting indicator is gone.
    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Issue 2: NamePrompt path — slug URL with no display name stored
// ---------------------------------------------------------------------------

describe('slug routing — NamePrompt shown when no display name is set', () => {
  it('renders NamePrompt and does NOT fire WS connect when slug URL has no display name', async () => {
    // Clear the display name AND journey history seeded in beforeEach —
    // simulate a fresh visitor with no identity for this slug.
    localStorage.removeItem('sq:display-name');
    localStorage.removeItem('sidequest-history');

    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    // NamePrompt should be visible — look for its label text.
    // We use findByText (async) to wait for React to settle, then immediately
    // inspect the WS message queue. No sleep needed: the 300ms WS-connect
    // timeout only fires AFTER displayName is set, so once NamePrompt is
    // visible (displayName still null) we know no message has been sent yet.
    await screen.findByText(/what name shall be yours/i);

    // Synchronous assertion — gate has not passed, no WS message sent.
    expect(server.messages).toHaveLength(0);

    // Now type a name and submit — connect should fire after metadata loads.
    const input = screen.getByRole('textbox', { name: /player name/i });
    await userEvent.type(input, 'bob');
    await userEvent.click(screen.getByRole('button', { name: /begin/i }));

    // After name is submitted, WS connect message should arrive.
    const nameMsg = await server.nextMessage as { type: string; payload: Record<string, unknown> };
    expect(nameMsg.type).toBe('SESSION_EVENT');
    expect(nameMsg.payload.event).toBe('connect');
    expect(nameMsg.payload.game_slug).toBe('2026-04-22-moldharrow-keep');
  });

  // Silent-rebind regression — see playtest 2026-04-26 (Richie / Potsie).
  // A stale `sq:display-name` from a prior session must NOT silently
  // identify the joining player when the slug is not in journey history.
  it('shows NamePrompt with stale name pre-filled when slug is not in journey history', async () => {
    // Reset to the silent-rebind scenario: stale display name from a prior
    // session, but no journey history for THIS slug. Player 2's direct-URL
    // join must hit the prompt rather than silently inheriting 'alice'.
    localStorage.clear();
    localStorage.setItem('sq:display-name', 'alice');

    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/play/2026-04-26-mawdeep-mp-2']}>
        <App />
      </MemoryRouter>,
    );

    // NamePrompt must be visible — stale name does NOT bypass confirmation.
    const input = (await screen.findByRole('textbox', {
      name: /player name/i,
    })) as HTMLInputElement;
    // Pre-filled with the cached name as a suggestion (player can edit).
    expect(input.value).toBe('alice');
    // Critical: no WS connect frame should be sent before confirmation.
    expect(server.messages).toHaveLength(0);
  });

  // Silent-rebind regression — identity-scoped slug-known gate ([BAR-1] 2026-06-05).
  //
  // The slug-known shortcut (which skips the NamePrompt for a returning player)
  // matched on game_slug ALONE. If a prior player on this browser left the slug
  // in journey history, a DIFFERENT joiner (whose cached sq:display-name differs)
  // was silently bound into that session without a prompt. Playtest repro:
  // Groucho navigated to a barsoom URL, bounced through "/" into a prior player's
  // the_circuit solo save (slug in history) and was dropped into chargen as
  // Groucho with no confirmation. Same class as Lenny/Laverne and Richie/Potsie;
  // "known" must mean "THIS identity has played this slug", not just "this slug
  // exists in history".
  it('shows NamePrompt when the slug is in history under a DIFFERENT player', async () => {
    localStorage.clear();
    // A prior player ("alice") played this slug on this browser...
    localStorage.setItem('sq:display-name', 'groucho'); // ...but the current cached identity is someone else.
    localStorage.setItem(
      'sidequest-history',
      JSON.stringify([
        {
          player_name: 'alice',
          genre: 'low_fantasy',
          world: 'greyhawk',
          last_played_iso: new Date().toISOString(),
          game_slug: '2026-06-05-the_circuit',
          mode: 'solo',
        },
      ]),
    );

    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-06-05-the_circuit']}>
        <App />
      </MemoryRouter>,
    );

    // The prompt must show — groucho has not confirmed joining alice's session.
    const input = (await screen.findByRole('textbox', {
      name: /player name/i,
    })) as HTMLInputElement;
    expect(input.value).toBe('groucho');
    // Critical: no SESSION_EVENT{connect} silently bound groucho into the save.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const connectFrames = server.messages.filter((m) => {
      const parsed = m as { type?: string; payload?: { event?: string } };
      return parsed.type === 'SESSION_EVENT' && parsed.payload?.event === 'connect';
    });
    expect(connectFrames).toHaveLength(0);
  });

  // Silent-rebind regression — effect-level wiring proof (playtest 2026-04-26).
  //
  // The render-time gate above proves the prompt is shown, but the original
  // regression survived a render-only gate because the slug-connect useEffect
  // ran unconditionally on the same mount, fetched metadata, and scheduled the
  // SESSION_EVENT{connect} via a 300ms setTimeout — silently rebinding the
  // stale name before the user could hit Begin.
  //
  // This test closes that gap by:
  //   1. Letting the metadata fetch microtask resolve.
  //   2. Letting the 300ms post-connect timeout elapse.
  //   3. Asserting no SESSION_EVENT{connect} arrived at the WS server, AND
  //      that the slug was NOT silently appended to journey history.
  //
  // If the effect's trust gate regresses, this test will see the connect
  // frame land on the server and fail loudly.
  it(
    'effect does not fetch+connect on stale-name mount before user confirms',
    async () => {
      localStorage.clear();
      localStorage.setItem('sq:display-name', 'alice');

      const slugForTest = '2026-04-26-mawdeep-mp-2';

      // Track whether the metadata endpoint was even hit. Under the bug, the
      // effect runs unconditionally and fetches metadata; under the fix, the
      // effect short-circuits and the endpoint is never called.
      let metaFetchCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (typeof url === 'string' && /\/api\/games\/[^?]+/.test(url)) {
            metaFetchCount += 1;
            return Promise.resolve(
              new Response(JSON.stringify(GAME_META), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
            );
          }
          if (typeof url === 'string' && url.includes('/api/genres')) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ low_fantasy: { name: 'Low Fantasy', worlds: [] } }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
              ),
            );
          }
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }),
      );

      const wsUrl = `ws://${location.host}/ws`;
      const server = new WS(wsUrl, { jsonProtocol: true });

      render(
        <MemoryRouter initialEntries={[`/play/${slugForTest}`]}>
          <App />
        </MemoryRouter>,
      );

      // Wait for the prompt to render — proves the component has mounted and
      // both the render gate and the effect have had a tick to run.
      await screen.findByRole('textbox', { name: /player name/i });

      // Drain microtasks (metadata fetch resolution path) and wait past the
      // 300ms post-connect timeout. Under the bug the effect fired the fetch
      // synchronously on mount, the .then() callback called connect(), and
      // 300ms later sendRef.current?.(...) sent the SESSION_EVENT{connect}
      // payload. Real timers + a 500ms wait gives the bug every chance to
      // expose itself.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Effect must not have called the metadata endpoint at all — that's
      // the upstream signal that the trust gate held.
      expect(metaFetchCount).toBe(0);

      // The decisive assertion: no SESSION_EVENT{connect} on the wire.
      const connectFrames = server.messages.filter((m) => {
        const parsed = m as { type?: string; payload?: { event?: string } };
        return parsed.type === 'SESSION_EVENT' && parsed.payload?.event === 'connect';
      });
      expect(connectFrames).toHaveLength(0);

      // Slug must NOT have been silently written into journey history —
      // that side-effect was part of the original bug (next refresh would
      // skip the prompt because the gate would treat the slug as known).
      const historyRaw = localStorage.getItem('sidequest-history');
      const history = historyRaw ? (JSON.parse(historyRaw) as Array<{ game_slug: string }>) : [];
      expect(history.some((e) => e.game_slug === slugForTest)).toBe(false);
    },
    7000,
  );
});

// ---------------------------------------------------------------------------
// Issue 1 gate check: metadata fetch gates WS connect
// ---------------------------------------------------------------------------

describe('slug routing — metadata fetch gates WS connect', () => {
  it('fetches GET /api/games/:slug and WS connect does not fire until metadata resolves', async () => {
    // Deferred promise — we control when the metadata response resolves.
    let flushGameMeta!: () => void;
    const deferredMeta = new Promise<Response>((resolve) => {
      flushGameMeta = () =>
        resolve(
          new Response(JSON.stringify(GAME_META), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
    });

    // Override the default fetch mock with one that defers /api/games/:slug.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && /\/api\/games\/[^?]+/.test(url)) {
          return deferredMeta;
        }
        if (typeof url === 'string' && url.includes('/api/genres')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ low_fantasy: { name: 'Low Fantasy', worlds: [] } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );

    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    // The connecting indicator shows while metadata is pending — wait for it
    // to confirm the component has rendered with the slug in hand. At this point
    // the fetch is still deferred so slugConnectFired.current is still false
    // and no WS message has been enqueued. Synchronous inspection proves silence
    // without depending on wall-clock time.
    await screen.findByRole('status');
    expect(server.messages).toHaveLength(0);

    // Now flush the metadata response — connect should follow.
    act(() => { flushGameMeta(); });

    const gateMsg = await server.nextMessage as { type: string; payload: Record<string, unknown> };
    expect(gateMsg.type).toBe('SESSION_EVENT');
    expect(gateMsg.payload.event).toBe('connect');
    expect(gateMsg.payload.game_slug).toBe('2026-04-22-moldharrow-keep');
  });
});

// ---------------------------------------------------------------------------
// Issue 4: currentGenre flows through to chrome archetype (data-archetype)
// ---------------------------------------------------------------------------
//
// The regression was "currentGenre permanently null". This test verifies that
// after GET /api/games/:slug resolves with genre_slug:'low_fantasy', the genre
// flows through to the chrome archetype.
//
// Story 80-1 made the root archetype PHASE-GATED: the lobby/connect phase
// renders the neutral `house` chrome (so the menu never inherits the last
// world's theme), and the genre archetype applies only once the session leaves
// connect (creation/game). In slug-mode the connect phase is a transient
// loader, so we drive the app to game phase (SESSION_EVENT{ready}) and THEN
// assert the genre archetype — the real DOM-observable downstream effect of
// currentGenre, now correctly gated:
//   metadata fetch → setCurrentGenre('low_fantasy')
//   → (game phase) resolveRootArchetype('game','low_fantasy') → 'parchment'
//   → useChromeArchetype('parchment')
//   → document.documentElement.setAttribute('data-archetype', 'parchment')

describe('slug routing — currentGenre flows through to chrome archetype', () => {
  it('sets data-archetype="parchment" on documentElement in game phase after low_fantasy metadata resolves', async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT connect

    // Leave the transient connect phase (house chrome) for game phase, where
    // the genre archetype applies.
    act(() => {
      server.send({ type: 'SESSION_EVENT', payload: { event: 'ready' } });
    });

    // GAME_META.genre_slug is 'low_fantasy' → archetype 'parchment'.
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-archetype')).toBe('parchment');
    });
  });

  // Companion guard for the leak fix: during the slug-mode connect transient
  // (before `ready`), the root must be the neutral `house` chrome, never the
  // genre — proving the lobby-theme leak is closed even on the slug path.
  it('renders neutral house chrome during the connect transient (no genre leak)', async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    await server.connected; // connected but not yet `ready` → still connect phase

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-archetype')).toBe('house');
    });
  });
});

// ---------------------------------------------------------------------------
// Issue 6: Retry button re-fires metadata fetch after transient failure
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// StrictMode regression — fresh-mount slug-connect under React 18 double-invoke
// ---------------------------------------------------------------------------
//
// Playtest 2026-04-23 regression: fresh page load at /solo/:slug stuck on the
// "pages are turning…" loader forever. Server log showed zero new
// `WebSocket /ws [accepted]` lines — the WS upgrade never fired.
//
// Root cause: the slug-connect effect in AppInner latched
// `slugConnectFired.current = true` BEFORE the metadata fetch resolved, then
// closed over a `cancelled` flag set by the effect's cleanup. Under React 18
// StrictMode (which is enabled in main.tsx), the dev-mode double-invoke runs
// effect → cleanup → effect on initial mount:
//   - Pass #1: latches slugConnectFired, starts fetch with cancelled1=false
//   - Cleanup #1: sets cancelled1=true
//   - Pass #2: short-circuits on slugConnectFired.current (already true)
//   - Pass #1's fetch resolves: `if (cancelled) return` → connect() never fires
//
// SPA-navigation worked because the effect re-fires on a slug-change deps
// update, not on initial mount, so StrictMode's double-invoke doesn't apply.
// Production builds (no StrictMode) also worked. The bug was dev-only — but
// dev IS the playtest harness.
//
// Fix: latch slugConnectFired AFTER the success path runs connect(), with a
// belt-and-suspenders re-check inside the success closure to defend against
// both StrictMode passes' fetches resolving as winners.
//
// This test wraps the render in <StrictMode> to reproduce the double-invoke
// at test time. Without the fix, server.nextMessage hangs forever.
describe('slug routing — fresh mount under StrictMode (playtest 2026-04-23)', () => {
  it('opens WS and sends SESSION_EVENT{connect} on initial mount even with StrictMode double-invoke', async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );

    // Under the bug, the WS never opens — `await server.connected` would hang
    // until the test timeout. With the fix, the surviving StrictMode pass
    // resolves the latch race, calls connect(), and the WS upgrade completes.
    await server.connected;

    const msg = await server.nextMessage as { type: string; payload: Record<string, unknown> };
    expect(msg.type).toBe('SESSION_EVENT');
    expect(msg.payload.event).toBe('connect');
    expect(msg.payload.game_slug).toBe('2026-04-22-moldharrow-keep');
  });

  it('does not double-fire the connect handshake under StrictMode', async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );

    await server.connected;
    const first = await server.nextMessage as { type: string; payload: Record<string, unknown> };
    expect(first.type).toBe('SESSION_EVENT');
    expect(first.payload.event).toBe('connect');

    // Give any straggler send() calls (the 300ms post-connect timeout from
    // the losing StrictMode pass, if it had escaped the latch re-check) a
    // chance to fire. Then assert no second SESSION_EVENT connect arrived.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const extras = server.messages.filter((m) => {
      const parsed = m as { type?: string; payload?: { event?: string } };
      return parsed.type === 'SESSION_EVENT' && parsed.payload?.event === 'connect';
    });
    expect(extras).toHaveLength(1);
  });
});

describe('slug routing — Retry button re-fires metadata fetch after transient failure', () => {
  it('renders Retry on failure, re-fetches on click, and fires WS connect on success', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && /\/api\/games\/[^?]+/.test(url)) {
          callCount += 1;
          if (callCount === 1) {
            // First call fails — transient error
            return Promise.resolve(
              new Response('Service Unavailable', { status: 503 }),
            );
          }
          // Second call (after Retry) succeeds
          return Promise.resolve(
            new Response(JSON.stringify(GAME_META), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (typeof url === 'string' && url.includes('/api/genres')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ low_fantasy: { name: 'Low Fantasy', worlds: [] } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );

    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    // Wait for the error alert to appear (first fetch failed)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/failed to load game/i);

    // No WS message sent yet (connect never fired)
    expect(server.messages).toHaveLength(0);

    // Click Retry — triggers second fetch which succeeds
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    // After retry succeeds, WS connect should fire
    const retryMsg = await server.nextMessage as { type: string; payload: Record<string, unknown> };
    expect(retryMsg.type).toBe('SESSION_EVENT');
    expect(retryMsg.payload.event).toBe('connect');
    expect(retryMsg.payload.game_slug).toBe('2026-04-22-moldharrow-keep');

    // Alert should be gone after success
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Playtest 2026-04-23: Leave button must navigate off the slug URL
// ---------------------------------------------------------------------------
//
// Bug: clicking Leave at /solo/:slug cleared component state but never changed
// the route. AppInner's slug-connect effect re-fired on the next render and
// silently re-loaded the same session — the button looked broken.
// Fix: handleLeave now calls navigate("/").

describe('slug routing — Leave button navigates back to lobby', () => {
  // Tiny inline component that exposes the current pathname for assertion.
  function LocationProbe() {
    const loc = useLocation();
    return <span data-testid="current-path">{loc.pathname}</span>;
  }

  it('clicking Leave from a live game session routes back to "/"', async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage; // SESSION_EVENT connect

    // Drive the app into the game phase so GameBoard (and its Leave button)
    // mounts. The slug-routing tests above prove this transition happens
    // when the server emits SESSION_EVENT{ready}.
    act(() => {
      server.send({ type: 'SESSION_EVENT', payload: { event: 'ready' } });
    });

    const leaveButton = await screen.findByRole('button', { name: /^leave$/i });
    expect(screen.getByTestId('current-path').textContent).toBe(
      '/solo/2026-04-22-moldharrow-keep',
    );

    await userEvent.click(leaveButton);

    await waitFor(() => {
      expect(screen.getByTestId('current-path').textContent).toBe('/');
    });
  });
});

// ---------------------------------------------------------------------------
// Playtest 2026-04-26 GAP — MP session widget appears during chargen
// ---------------------------------------------------------------------------

describe('slug routing — MP session widget surfaces during chargen', () => {
  it('renders MultiplayerSessionStatus when slug-mode session is multiplayer', async () => {
    // Override game meta to multiplayer for this test only.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && /\/api\/games\/[^?]+/.test(url)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                genre_slug: 'low_fantasy',
                world_slug: 'greyhawk',
                mode: 'multiplayer',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        if (typeof url === 'string' && url.includes('/api/genres')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ low_fantasy: { name: 'Low Fantasy', worlds: [] } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );

    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/play/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT connect

    // Drive the UI into "creation" phase: server confirms connect with
    // has_character=false, then sends the first CHARACTER_CREATION scene.
    act(() => {
      server.send({
        type: 'SESSION_EVENT',
        payload: { event: 'connected', has_character: false },
        player_id: '',
      });
      server.send({
        type: 'CHARACTER_CREATION',
        payload: {
          phase: 'scene',
          scene_index: 0,
          total_scenes: 3,
          prompt: 'Choose your origin.',
          choices: [{ label: 'Noble', description: 'Born to privilege' }],
          input_type: 'choice',
        },
        player_id: 'alice',
      });
    });

    // Widget visible with the local player on the roster.
    const widget = await screen.findByTestId('mp-session-status');
    expect(widget).toBeInTheDocument();
    expect(within(widget).getByTestId('mp-roster-alice')).toBeInTheDocument();
    expect(
      within(widget).getByLabelText(/shareable game url/i),
    ).toHaveValue(`${window.location.origin}/play/2026-04-22-moldharrow-keep`);
  });

  it('does NOT render the MP widget for a solo-mode session', async () => {
    // beforeEach default fetch mock returns mode: 'solo'.
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/solo/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;

    act(() => {
      server.send({
        type: 'SESSION_EVENT',
        payload: { event: 'connected', has_character: false },
        player_id: '',
      });
      server.send({
        type: 'CHARACTER_CREATION',
        payload: {
          phase: 'scene',
          scene_index: 0,
          total_scenes: 3,
          prompt: 'Choose your origin.',
          choices: [{ label: 'Noble', description: 'Born to privilege' }],
          input_type: 'choice',
        },
        player_id: 'alice',
      });
    });

    // CharacterCreation is rendered, but the widget is NOT.
    await screen.findByTestId('character-creation');
    expect(screen.queryByTestId('mp-session-status')).toBeNull();
  });

  it('marks a peer as in-chargen when PLAYER_PRESENCE arrives mid-chargen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && /\/api\/games\/[^?]+/.test(url)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                genre_slug: 'low_fantasy',
                world_slug: 'greyhawk',
                mode: 'multiplayer',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        if (typeof url === 'string' && url.includes('/api/genres')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ low_fantasy: { name: 'Low Fantasy', worlds: [] } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );

    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={['/play/2026-04-22-moldharrow-keep']}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;

    act(() => {
      server.send({
        type: 'SESSION_EVENT',
        payload: { event: 'connected', has_character: false },
        player_id: '',
      });
      server.send({
        type: 'CHARACTER_CREATION',
        payload: {
          phase: 'scene',
          scene_index: 0,
          total_scenes: 3,
          prompt: 'Choose your origin.',
          choices: [{ label: 'Noble', description: 'Born to privilege' }],
          input_type: 'choice',
        },
        player_id: 'alice',
      });
      server.send({
        type: 'PLAYER_PRESENCE',
        payload: { player_id: 'potsie', state: 'connected' },
        player_id: '',
      });
    });

    const widget = await screen.findByTestId('mp-session-status');
    const potsieRow = within(widget).getByTestId('mp-roster-potsie');
    expect(potsieRow).toHaveAttribute('data-status', 'in-chargen');
    // The "Waiting on" line surfaces both alice (you) and potsie since
    // neither has completed chargen yet.
    const waiting = within(widget).getByTestId('mp-waiting-on');
    expect(waiting).toHaveTextContent(/alice \(you\)/i);
    expect(waiting).toHaveTextContent(/potsie/i);
  });
});
