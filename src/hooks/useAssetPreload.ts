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
}

/**
 * On the rising edge of `connected` (initial connect OR reconnect) with a
 * known slug, fetch the session's asset ledger and hand the rows to
 * `onAssets` so the UI can rehydrate prior-turn imagery from R2 without
 * triggering new daemon renders.
 *
 * Lives at the WebSocket-owning level — ImageBusProvider stays a pure reducer
 * (context-story-65-2.md, AC5). Fires once per (re)connect edge, never on
 * unrelated re-renders.
 */
export function useAssetPreload({ slug, connected, onAssets }: UseAssetPreloadArgs): void {
  const wasConnected = useRef(false);

  useEffect(() => {
    const isRisingEdge = connected && !wasConnected.current;
    wasConnected.current = connected;

    if (!isRisingEdge || !slug) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const resp = await fetch(`/api/sessions/${slug}/assets`);
      if (!resp.ok) {
        // Loud, not silent — a failed preload must surface, not be swallowed.
        console.error(
          `useAssetPreload: GET /api/sessions/${slug}/assets failed (${resp.status})`,
        );
        return;
      }
      const rows = (await resp.json()) as SessionAsset[];
      if (!cancelled) {
        onAssets(rows);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, connected, onAssets]);
}
