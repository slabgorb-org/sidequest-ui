// App → useAssetPreload → ImageBus wiring — Story 65-4 (AC5 follow-up from 65-2).
//
// 65-2 shipped the `useAssetPreload` hook and the GET /api/sessions/{slug}/assets
// endpoint, but the hook has NO production consumer — a half-wired feature. This
// suite is the mandatory App-level wiring test (CLAUDE.md "Every Test Suite Needs
// a Wiring Test"): it proves the hook is actually MOUNTED in AppInner and that the
// fetched CDN URLs reach the ImageBus gallery end-to-end.
//
// Mechanism-agnostic by design: the AC2 feed mechanism (synthetic IMAGE messages
// vs. a second pure ImageBus input) is an OPEN design decision for Dev. Every
// assertion here reads the OBSERVABLE boundary — `useImageBus()` — so it holds
// whichever mechanism Dev picks. The GameBoard stub serializes the gallery URLs
// into a data attribute the DOM-level assertions read.
//
// Pattern mirrors companions-app-wire-integration.test.tsx — mock GameBoard,
// drive the WebSocket with jest-websocket-mock, render <App/> under MemoryRouter.
//
// SHARP EDGE pinned here (Architect, context-story-65-4 §Reconnect-ordering): on
// the resume path the hook fires on the `connected` rising edge BEFORE the
// `ready` SESSION_EVENT, and that `ready` PURGES `messages` to SESSION_EVENT-only
// (isReconnect=true). A naive synthetic-message inject lands pre-purge and is
// silently wiped. The "survives the resume purge" test reproduces exactly that.

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";

// Async mock factory so the stub can consume the REAL ImageBus context — it is
// rendered inside the un-mocked ImageBusProvider, so `useImageBus()` returns the
// production reducer output. Serialize the gallery URLs (in order, newest-first)
// into a data attribute the DOM assertions parse.
vi.mock("@/components/GameBoard/GameBoard", async () => {
  const { useImageBus } = await import("@/providers/ImageBusProvider");
  return {
    GameBoard: () => {
      const images = useImageBus();
      return (
        <div
          data-testid="gameboard-stub"
          data-image-urls={JSON.stringify(images.map((i) => i.url))}
        />
      );
    },
  };
});

import App from "../App";

const SUNDEN_META = {
  genre_slug: "caverns_and_claudes",
  world_slug: "sunden",
  mode: "solo",
};

// Two prior-turn assets the ledger endpoint hands back on reconnect.
const PRELOAD_ROWS = [
  {
    r2_key: "artifacts/sunden/s1/portrait/aaa.png",
    asset_type: "portrait",
    entity_ref: "gruk",
    created_turn: 1,
    url: "https://cdn.slabgorb.com/artifacts/sunden/s1/portrait/aaa.png",
  },
  {
    r2_key: "artifacts/sunden/s1/illustration/bbb.png",
    asset_type: "illustration",
    entity_ref: "scene-2",
    created_turn: 2,
    url: "https://cdn.slabgorb.com/artifacts/sunden/s1/illustration/bbb.png",
  },
];

// fetch router: games-meta + genres + the asset ledger + catch-all. `assetsBody`
// lets individual tests vary the ledger payload (dedupe / ordering / url-less).
function makeFetchMock(assetsBody: unknown = PRELOAD_ROWS) {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && /\/api\/sessions\/[^/]+\/assets$/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(assetsBody), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(SUNDEN_META), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            caverns_and_claudes: { name: "Caverns & Claudes", worlds: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

let slugCounter = 0;
function freshSlug(): string {
  slugCounter += 1;
  const slug = `sunden-preload-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "carl",
    genre: "caverns_and_claudes",
    world: "sunden",
    last_played_iso: new Date().toISOString(),
    game_slug: slug,
    mode: "solo",
  });
  localStorage.setItem("sidequest-history", JSON.stringify(existing));
  return slug;
}

function galleryUrls(stub: HTMLElement): Array<string | undefined> {
  return JSON.parse(stub.getAttribute("data-image-urls") ?? "[]") as Array<
    string | undefined
  >;
}

// Stand up the WS, render App at /solo/:slug, drain the connect frame, and send
// a resume `ready` (has_character) — which flips sessionPhase to "game" (mounts
// the gallery) AND triggers the reconnect purge.
async function bootResume(slug: string): Promise<WS> {
  const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
  render(
    <MemoryRouter initialEntries={[`/solo/${slug}`]}>
      <App />
    </MemoryRouter>,
  );
  await server.connected;
  await server.nextMessage; // SESSION_EVENT{connect}
  server.send({
    type: "SESSION_EVENT",
    payload: { event: "ready", has_character: true },
  });
  return server;
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "carl");
  vi.stubGlobal("fetch", makeFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

describe("Story 65-4 — App mounts useAssetPreload (wiring)", () => {
  it("fetches GET /api/sessions/{slug}/assets exactly once on connect", async () => {
    // Proves the hook is actually mounted in the tree (not merely importable).
    // RED today: the hook has no production consumer, so the endpoint is never hit.
    const slug = freshSlug();
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    await bootResume(slug);

    await waitFor(() => {
      const assetCalls = fetchMock.mock.calls.filter(
        (c) =>
          typeof c[0] === "string" &&
          (c[0] as string).endsWith(`/api/sessions/${slug}/assets`),
      );
      expect(assetCalls).toHaveLength(1);
    });
  });

  it("does NOT fetch the asset ledger when there is no session slug (lobby)", async () => {
    // Guards against an always-on mount. At "/" the slug is null → no preload.
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    // Let connect-phase effects (genres fetch etc.) settle, then assert the
    // assets endpoint was never touched.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled(); // genres fetch fired
    });
    const assetCalls = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && /\/api\/sessions\/[^/]+\/assets$/.test(c[0] as string),
    );
    expect(assetCalls).toHaveLength(0);
  });
});

describe("Story 65-4 — preloaded URLs reach the ImageBus gallery (AC2)", () => {
  it("feeds prior-turn CDN URLs into the gallery, surviving the resume purge", async () => {
    // The load-bearing wiring assertion: onAssets → (chosen seam) → useImageBus().
    // Also pins the reconnect-ordering hazard — the `ready` in bootResume purges
    // `messages`, so a pre-purge synthetic inject that is not re-landed is lost.
    const slug = freshSlug();
    await bootResume(slug);

    const stub = await waitFor(() => screen.getByTestId("gameboard-stub"));
    await waitFor(() => {
      const urls = galleryUrls(stub);
      expect(urls).toContain(PRELOAD_ROWS[0].url);
      expect(urls).toContain(PRELOAD_ROWS[1].url);
    });
  });

  it("dedupes a preloaded asset against a live IMAGE of the same URL", async () => {
    // A preloaded asset that ALSO arrives as a live render this session must
    // surface as ONE gallery card, not two. render_id and r2_key are different
    // namespaces, so the cross-source key must be the URL.
    const slug = freshSlug();
    const server = await bootResume(slug);

    // Live render for the SAME url as PRELOAD_ROWS[0].
    server.send({
      type: "IMAGE",
      payload: {
        url: PRELOAD_ROWS[0].url,
        render_id: "live-render-1",
        turn_number: 7,
      },
    });

    const stub = await waitFor(() => screen.getByTestId("gameboard-stub"));
    await waitFor(() => {
      const urls = galleryUrls(stub);
      // The shared url appears exactly once...
      expect(urls.filter((u) => u === PRELOAD_ROWS[0].url)).toHaveLength(1);
      // ...and the preload-only url is still present (proves the feed is wired).
      expect(urls).toContain(PRELOAD_ROWS[1].url);
    });
  });

  it("orders backfilled assets behind live current-turn images (newest first)", async () => {
    // Gallery is newest-first. A backfilled created_turn=1 asset must not sort
    // ahead of a live turn_number=40 image. Index-based ordering breaks this;
    // the sort must key on turn.
    const slug = freshSlug();
    const server = await bootResume(slug);

    const liveUrl = "https://cdn.slabgorb.com/artifacts/sunden/s1/illustration/live40.png";
    server.send({
      type: "IMAGE",
      payload: { url: liveUrl, render_id: "live-40", turn_number: 40 },
    });

    const stub = await waitFor(() => screen.getByTestId("gameboard-stub"));
    await waitFor(() => {
      const urls = galleryUrls(stub);
      const liveIdx = urls.indexOf(liveUrl);
      const backfillIdx = urls.indexOf(PRELOAD_ROWS[0].url); // created_turn 1
      expect(liveIdx).toBeGreaterThanOrEqual(0);
      expect(backfillIdx).toBeGreaterThanOrEqual(0);
      // Live turn-40 image is newer → appears before the turn-1 backfill.
      expect(liveIdx).toBeLessThan(backfillIdx);
    });
  });

  it("loud-fails (does not silently gallery-add) a preload row with no URL", async () => {
    // No-Silent-Fallbacks / typescript-review #4: a url-less ledger row is a
    // server-contract violation. It must be logged loudly and NOT become a blank
    // gallery card.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const urlless = [
      {
        r2_key: "artifacts/sunden/s1/portrait/ccc.png",
        asset_type: "portrait",
        entity_ref: "blank",
        created_turn: 3,
        // url intentionally absent
      },
    ];
    vi.stubGlobal("fetch", makeFetchMock(urlless));

    const slug = freshSlug();
    await bootResume(slug);

    const stub = await waitFor(() => screen.getByTestId("gameboard-stub"));
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    // No blank/empty-url card slipped into the gallery.
    const urls = galleryUrls(stub);
    expect(urls.filter((u) => !u)).toHaveLength(0);
  });
});
