// Story 100-9 (Phase 2) — session-free theme injector (Concern C3).
//
// The reference projection JSON carries a FLAT CSS-variable token dict at
// `doc["theme"]` (`{ "--primary": "#c0392b", ... }` — see 100-7 server +
// `src/types/reference.ts` `ReferenceTheme`). This hook applies those tokens
// onto a DOM element via `element.style.setProperty(name, value)` — the same
// var-application primitive the in-game `useGenreTheme` uses on `:root` — but
// fed from the REST projection JSON, NOT the in-game WebSocket `theme_css`
// SESSION_EVENT channel. It works on the `/reference/*` pages where there is NO
// WebSocket session, no GameStateProvider, and no auth.
//
// Cleanup is the load-bearing part. The default target is the shared
// `document.documentElement`, so a leaked var would bleed across packs and back
// into the lobby / in-game theme. The effect removes exactly the vars it set:
// React runs the previous effect's cleanup before re-running on a theme change,
// so a pack switch drops vars absent from the new dict (and updates shared ones)
// and unmount removes everything — without tracking diffs by hand.

import { useEffect } from "react";
import type { ReferenceTheme } from "@/types/reference";

/**
 * Apply a flat CSS-variable token dict to a DOM element for the lifetime of the
 * calling component, cleaning the vars up on unmount or theme change.
 *
 * @param theme   Flat `{ "--var": "value" }` dict from the projection JSON.
 *                `undefined` (theme is optional on the projection) is a safe
 *                no-op.
 * @param target  Element to apply the vars to. Defaults to
 *                `document.documentElement` (`:root`).
 */
export function useThemeTokens(theme: ReferenceTheme | undefined, target?: HTMLElement): void {
  useEffect(() => {
    if (!theme) return;
    const el = target ?? document.documentElement;
    const names = Object.keys(theme);
    if (names.length === 0) return;

    for (const name of names) {
      el.style.setProperty(name, theme[name]);
    }

    return () => {
      for (const name of names) {
        el.style.removeProperty(name);
      }
    };
  }, [theme, target]);
}
