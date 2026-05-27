import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// RED test for Story 65-2 AC5 — UI reconnect preload.
//
// On (re)connect to a saved session, the client fetches
// GET /api/sessions/{slug}/assets and feeds the prior-turn CDN URLs into the
// image pipeline WITHOUT triggering new daemon renders. Per context-story-65-2
// the fetch lives at the WebSocket-owning level (App/GameStateProvider), NOT
// inside ImageBusProvider (a pure reducer). This hook encapsulates that effect.
//
// Targets the not-yet-existing hook @/hooks/useAssetPreload.
import { useAssetPreload } from "@/hooks/useAssetPreload";

const SAMPLE_ROWS = [
  {
    r2_key: "artifacts/flickering_reach/s1/portrait/aaa.png",
    asset_type: "portrait",
    entity_ref: "gruk",
    created_turn: 1,
    url: "https://cdn.slabgorb.com/artifacts/flickering_reach/s1/portrait/aaa.png",
  },
  {
    r2_key: "artifacts/flickering_reach/s1/illustration/bbb.png",
    asset_type: "illustration",
    entity_ref: "scene-2",
    created_turn: 2,
    url: "https://cdn.slabgorb.com/artifacts/flickering_reach/s1/illustration/bbb.png",
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => SAMPLE_ROWS,
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useAssetPreload (AC5)", () => {
  it("fetches the session asset ledger on (re)connect", async () => {
    const onAssets = vi.fn();
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useAssetPreload({ slug: "2026-04-25-flickering_reach", connected, onAssets }),
      { initialProps: { connected: false } },
    );

    // No connection yet → no fetch.
    expect(fetchMock).not.toHaveBeenCalled();

    // Connection (or reconnection) establishes.
    await act(async () => {
      rerender({ connected: true });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/sessions/2026-04-25-flickering_reach/assets",
    );
  });

  it("feeds the fetched CDN URLs to the preload callback", async () => {
    const onAssets = vi.fn();
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useAssetPreload({ slug: "2026-04-25-flickering_reach", connected, onAssets }),
      { initialProps: { connected: false } },
    );

    await act(async () => {
      rerender({ connected: true });
    });
    // Allow the fetch promise + state update to flush.
    await act(async () => {
      await Promise.resolve();
    });

    expect(onAssets).toHaveBeenCalledTimes(1);
    const rows = onAssets.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { r2_key: string }) => r.r2_key)).toContain(
      "artifacts/flickering_reach/s1/portrait/aaa.png",
    );
  });

  it("does not fetch without a slug", async () => {
    const onAssets = vi.fn();
    renderHook(() =>
      useAssetPreload({ slug: null, connected: true, onAssets }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not re-fetch on re-render while staying connected", async () => {
    const onAssets = vi.fn();
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useAssetPreload({ slug: "s", connected, onAssets }),
      { initialProps: { connected: false } },
    );

    await act(async () => {
      rerender({ connected: true });
    });
    // Stays connected across an unrelated re-render — must not refetch.
    await act(async () => {
      rerender({ connected: true });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches on a reconnect edge (connected false→true again)", async () => {
    const onAssets = vi.fn();
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useAssetPreload({ slug: "s", connected, onAssets }),
      { initialProps: { connected: false } },
    );

    await act(async () => rerender({ connected: true })); // first connect
    await act(async () => rerender({ connected: false })); // drop
    await act(async () => rerender({ connected: true })); // reconnect

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
