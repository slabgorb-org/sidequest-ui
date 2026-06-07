import { useCallback, useEffect, useState } from 'react';

// Single source of truth for the persisted display-name key. AppInner and
// ConnectScreen both mount useDisplayName instances; the custom event below
// keeps them synchronized within one tab (the native `storage` event only
// fires across tabs). Cross-tab edits still propagate via `storage`.
const KEY = 'sq:display-name';
const EVENT = 'sq:display-name-changed';

function readName(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useDisplayName() {
  const [name, setState] = useState<string | null>(() => readName());

  useEffect(() => {
    // Same-tab sync: the event CARRIES the new name. Never read it back from
    // localStorage here — on browsers where storage writes fail or throw
    // (Safari private mode / Lockdown, site-data blocked for a tunnel
    // domain), a read-back returns null/stale and synchronously WIPES the
    // name the user just typed. That wipe blocked the slug-route connect
    // effect forever: POST /api/games returned 201 but the client never
    // fetched the game or opened the WebSocket (playtest 2026-06-07,
    // flickering_reach — four zero-turn sessions from one remote player).
    const syncFromEvent = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string') setState(detail);
    };
    // Cross-tab sync: the native storage event only fires when localStorage
    // actually works, and it carries the new value — no read-back needed.
    const syncFromStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(e.newValue);
    };
    window.addEventListener(EVENT, syncFromEvent);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener(EVENT, syncFromEvent);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  const setName = useCallback((n: string) => {
    try {
      localStorage.setItem(KEY, n);
    } catch (err) {
      // Persistence is best-effort, but say so loudly (No Silent Fallbacks):
      // the in-memory name still works for this tab; it just won't survive
      // a reload.
      console.warn('[display-name] failed to persist player name', err);
    }
    setState(n);
    window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: n }));
  }, []);

  return { name, setName };
}
