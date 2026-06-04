import { useEffect, useRef } from "react";

/**
 * Asset-ledger row as returned by GET /api/sessions/{slug}/assets (Story 65-2).
 * `url` is the resolved CDN URL the server attaches for client preload.
 */
export interface SessionAsset {
  r2_key: string;
  asset_type: string;
  entity_ref: string;
  created_turn: number;
  url?: string;
}

export interface UseAssetPreloadArgs {
  /** Durable session slug; null/empty until a session is active. */
  slug: string | null;
  /** WebSocket connection state (owned by GameStateProvider / useGameSocket). */
  connected: boolean;
  /** Receives the prior-turn assets to feed into the image pipeline. */
  onAssets: (assets: SessionAsset[]) => void;
  /**
   * Invoked when the preload fetch fails — a non-ok response or a thrown/
   * rejected request. Lets the mount site surface the failure instead of the
   * hook swallowing it. `onAssets` is NOT called on failure (Story 65-4 AC4).
   */
  onError?: (error: unknown) => void;
}

/**
 * Fetch the session's asset ledger and hand the rows to `onAssets` so the UI
 * can rehydrate prior-turn imagery from R2 without triggering new daemon
 * renders. Fires on the rising edge of `connected` (initial connect OR
 * reconnect) AND whenever the `slug` changes while connected — a modal can
 * navigate between sessions without dropping the socket, so the new session's
 * backfill must reload even though `connected` never flipped (Story 65-16 AC2a).
 *
 * Lives at the WebSocket-owning level — ImageBusProvider stays a pure reducer
 * (context-story-65-2.md, AC5). Fires once per (re)connect edge or distinct
 * slug, never on unrelated re-renders.
 */
export function useAssetPreload({
  slug,
  connected,
  onAssets,
  onError,
}: UseAssetPreloadArgs): void {
  const wasConnected = useRef(false);
  // The slug we last fired a preload for, so a slug change while staying
  // connected re-fires but an unrelated re-render with the same slug does not.
  const lastPreloadedSlug = useRef<string | null>(null);

  useEffect(() => {
    const isRisingEdge = connected && !wasConnected.current;
    wasConnected.current = connected;

    // No live socket → nothing to back-fill. Never fire on a slug change while
    // disconnected (Story 65-16 AC2a guard).
    if (!connected || !slug) {
      return;
    }

    const slugChanged = slug !== lastPreloadedSlug.current;
    if (!isRisingEdge && !slugChanged) {
      return;
    }
    lastPreloadedSlug.current = slug;

    let cancelled = false;
    void (async () => {
      try {
        // encodeURIComponent: a session slug can carry characters that are not
        // URL-path-safe; without encoding the request lands on the wrong route.
        const resp = await fetch(`/api/sessions/${encodeURIComponent(slug)}/assets`);
        if (!resp.ok) {
          // Loud, not silent — a failed preload must surface, not be swallowed.
          console.error(
            `useAssetPreload: GET /api/sessions/${slug}/assets failed (${resp.status})`,
          );
          if (!cancelled) onError?.(new Error(`asset preload failed: ${resp.status}`));
          return;
        }
        const rows = (await resp.json()) as SessionAsset[];
        if (!cancelled) {
          onAssets(rows);
        }
      } catch (err) {
        // A thrown/rejected fetch (network down, abort) is loud too, and the
        // mount site is notified via onError so it can react.
        console.error("useAssetPreload: asset preload request threw", err);
        if (!cancelled) onError?.(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, connected, onAssets, onError]);
}
