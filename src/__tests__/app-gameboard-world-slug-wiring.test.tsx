// App → GameBoard worldSlug wiring — regression guard for the
// playtest 2026-04-29 Orrery bug, still load-bearing post-2026-05-02
// migration to the server-rendered orbital chart (Task 16).
//
// Pre-fix: App.tsx fetched both genre_slug AND world_slug from
// `/api/games/:slug`, but only stashed genre_slug in React state. The
// `<GameBoard>` call site forwarded `genreSlug={currentGenre}` and never
// passed `worldSlug` at all. Net effect on the Coyote Star session:
// MapWidget saw worldSlug=undefined, the orbital branch never activated,
// and the empty-state "No map data yet" fallback rendered instead.
//
// MapWidget.test.tsx already covers the GameBoard→MapWidget side (calling
// <MapWidget worldSlug="coyote_star" /> directly). The gap was at the
// App.tsx call site. This test mocks <GameBoard> to capture the
// worldSlug prop and asserts that, after the slug-connect handshake
// completes for a Coyote Star session, App actually forwards
// worldSlug="coyote_star" — the prop the production-fix added.
//
// Why mock GameBoard? Mounting the real GameBoard in jsdom would pull in
// Dockview + the full layout system for an assertion that's purely about
// prop wiring. Capturing the prop on a stub is the targeted, fast check
// that catches the call-site regression.

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";

// vi.mock must hoist before App is imported. The stub renders the genreSlug
// and worldSlug props it receives so the test can assert from the DOM —
// this is the same indirection trick the existing wiring tests use to
// avoid pulling in heavy widget trees.
vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: { genreSlug?: string; worldSlug?: string }) => (
    <div
      data-testid="gameboard-stub"
      data-genre-slug={props.genreSlug ?? ""}
      data-world-slug={props.worldSlug ?? ""}
    />
  ),
}));

import App from "../App";

const COYOTE_STAR_META = {
  genre_slug: "space_opera",
  world_slug: "coyote_star",
  mode: "solo",
};

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(COYOTE_STAR_META), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            space_opera: { name: "Space Opera", worlds: [] },
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
  const slug = `coyote-star-wiring-${Date.now()}-${slugCounter}`;
  // Seed journey history so AppInner's silent-rebind trust gate recognizes
  // the player as the creator of this slug — same helper pattern as
  // mp-03-event-sync-wiring.test.tsx and slug-connect-readystate-effect.test.tsx.
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "vex",
    genre: "space_opera",
    world: "coyote_star",
    last_played_iso: new Date().toISOString(),
    game_slug: slug,
    mode: "solo",
  });
  localStorage.setItem("sidequest-history", JSON.stringify(existing));
  return slug;
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "vex");
  vi.stubGlobal("fetch", makeFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

describe("App → GameBoard worldSlug wiring (Coyote Star)", () => {
  it("forwards worldSlug=coyote_star once the session reaches the game phase", async () => {
    const slug = freshSlug();
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <App />
      </MemoryRouter>,
    );

    // Wait for the WS handshake to complete and the SESSION_EVENT{connect}
    // payload to land on the server. Past this point AppInner is in
    // "connect" sessionPhase and the metadata fetch has already populated
    // currentGenre + currentWorld.
    await server.connected;
    await server.nextMessage;

    // SESSION_EVENT{event: "ready"} is the path that bypasses chargen and
    // transitions sessionPhase → "game" directly — see App.tsx ~line 522.
    // The server normally only sends "ready" when has_character=true
    // (existing-character resume); for the wiring test it's the cheapest
    // way to render <GameBoard> without driving five chargen scenes.
    server.send({
      type: "SESSION_EVENT",
      payload: { event: "ready", has_character: true },
    });

    const stub = await waitFor(() =>
      screen.getByTestId("gameboard-stub"),
    );
    expect(stub.getAttribute("data-genre-slug")).toBe("space_opera");
    expect(stub.getAttribute("data-world-slug")).toBe("coyote_star");
  });

  it("never forwards an empty worldSlug — pre-fix regression guard", async () => {
    // The pre-fix bug was data-world-slug="" (undefined coerced) on the
    // GameBoard call site. This assertion is the targeted catch: if a
    // future refactor drops the prop again, MapWidget would silently fall
    // back to the empty-state branch and the playtest bug returns. The
    // first assertion above covers the value; this one explicitly rejects
    // the regression shape so the failure message is unambiguous.
    const slug = freshSlug();
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;
    server.send({
      type: "SESSION_EVENT",
      payload: { event: "ready", has_character: true },
    });

    const stub = await waitFor(() =>
      screen.getByTestId("gameboard-stub"),
    );
    expect(stub.getAttribute("data-world-slug")).not.toBe("");
    expect(stub.getAttribute("data-world-slug")).not.toBeNull();
  });
});
