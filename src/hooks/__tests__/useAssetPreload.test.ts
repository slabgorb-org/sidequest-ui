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

// Story 65-4 AC4 — hook hardening carried over from the 65-2 review:
// `encodeURIComponent(slug)` on the fetch path, and an `onError` callback so
// the mount site can surface a failed preload instead of the hook swallowing
// it with a bare console.error + return.
describe("useAssetPreload — 65-4 hardening (encode + onError)", () => {
  it("percent-encodes the slug in the fetch URL", async () => {
    // A session slug can carry characters that are not URL-path-safe. The hook
    // must encode them, or the request lands on the wrong route (or 404s).
    const onAssets = vi.fn();
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useAssetPreload({
          slug: "2026-04-25/flickering reach",
          connected,
          onAssets,
        }),
      { initialProps: { connected: false } },
    );

    await act(async () => {
      rerender({ connected: true });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/sessions/2026-04-25%2Fflickering%20reach/assets",
    );
  });

  it("invokes onError (and NOT onAssets) on a non-ok response", async () => {
    // A failed preload must reach the mount site, not vanish. The current hook
    // logs + returns; AC4 requires an onError hand-off.
    const onAssets = vi.fn();
    const onError = vi.fn();
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 503,
      json: async () => [],
    }));

    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        // onError is the AC4 addition to UseAssetPreloadArgs — absent on the
        // current type, so this is a RED contract assertion until Dev adds it.
        useAssetPreload({ slug: "s", connected, onAssets, onError }),
      { initialProps: { connected: false } },
    );

    await act(async () => {
      rerender({ connected: true });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onAssets).not.toHaveBeenCalled();
  });

  it("invokes onError when the fetch itself rejects", async () => {
    const onAssets = vi.fn();
    const onError = vi.fn();
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("network down");
    });

    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useAssetPreload({ slug: "s", connected, onAssets, onError }),
      { initialProps: { connected: false } },
    );

    await act(async () => {
      rerender({ connected: true });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onAssets).not.toHaveBeenCalled();
  });
});

// Story 65-16 AC2a — re-preload on a slug change WHILE CONNECTED.
//
// 65-4 only fired on the rising edge of `connected`. A modal can navigate
// between sessions without dropping the socket, so the slug changes while
// `connected` stays true — no `connected` flip, so the rising-edge guard never
// re-arms and the new session's assets are silently never fetched (the prior
// session's backfill leaks until the first live image of the new session).
// These are RED against the current hook (which keys solely on the connected
// edge) and GREEN once the effect also re-preloads on a distinct slug.
describe("useAssetPreload — 65-16 slug-change re-preload (AC2a)", () => {
  it("re-preloads for the NEW slug when the slug changes while staying connected", async () => {
    const onAssets = vi.fn();
    const { rerender } = renderHook(
      ({ slug }: { slug: string }) =>
        useAssetPreload({ slug, connected: true, onAssets }),
      { initialProps: { slug: "game1" } },
    );

    // First mount with connected=true is itself a rising edge → fires for game1.
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sessions/game1/assets");

    // Slug flips to game2 while the socket stays connected. RED today: no
    // `connected` rising edge, so the hook never re-fetches.
    await act(async () => {
      rerender({ slug: "game2" });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The second fetch must target the NEW slug, not re-fetch the stale one.
    expect(fetchMock.mock.calls[1][0]).toBe("/api/sessions/game2/assets");
  });

  it("does NOT re-preload on a slug change while DISCONNECTED (over-fire guard)", async () => {
    // The AC2a fix must not become an always-fire effect: with no live socket
    // there is nothing to back-fill, so a slug change while disconnected must
    // stay silent. Passes today and must keep passing after the fix.
    const onAssets = vi.fn();
    const { rerender } = renderHook(
      ({ slug }: { slug: string }) =>
        useAssetPreload({ slug, connected: false, onAssets }),
      { initialProps: { slug: "game1" } },
    );

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ slug: "game2" });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAssets).not.toHaveBeenCalled();
  });

  it("does NOT re-preload when the slug is unchanged across a connected re-render", async () => {
    // Guards the other direction: a re-render that does NOT change the slug
    // (unrelated parent state) must not trigger a duplicate fetch even after
    // the slug-aware fix lands.
    const onAssets = vi.fn();
    const { rerender } = renderHook(
      ({ slug }: { slug: string }) =>
        useAssetPreload({ slug, connected: true, onAssets }),
      { initialProps: { slug: "game1" } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ slug: "game1" }); // same slug, still connected
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
