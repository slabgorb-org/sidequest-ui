// Story 164-5 — SITE_MAP client wiring + scene-keyed mapData + breadcrumb.
// Supersedes the retired 153-25 DUNGEON_MAP wiring test (the server renamed the
// frame in 164-4; this completes the cutover on the client).
//
// TODAY'S BUG (the 158-36 fix): the server emits a SITE_MAP frame
// (sidequest-server .../map_emit.py `emit_fn(msg, "SITE_MAP")`) carrying the
// discovered site room graph + the site descriptor, but the client still only
// names/handles DUNGEON_MAP — so every SITE_MAP frame falls through to
// `setMessages([...prev, msg])` and is dropped. The player inside a site has no
// map of it and no breadcrumb back to the surface.
//
// This proves the END-TO-END wire through the REAL App (per CLAUDE.md "Verify
// Wiring, Not Just Existence" + AC-5 reachability): a SITE_MAP frame over the
// socket → App handler → scene-keyed `siteMap` state → MapWidget foregrounds the
// site room graph AND the breadcrumb. It also proves the scene split (AC-3): the
// world MAP_UPDATE and the SITE_MAP coexist — foregrounding the site does NOT
// clobber the world map; drilling out (view-only) reveals it intact.
//
// jsdom reports the mobile breakpoint (test-setup.ts), so GameBoard renders via
// MobileTabView; the Map tab is a role="tab" button and clicking it mounts the
// MapWidget. Harness modeled on the retired dungeon-map-wiring-153-25 test.

import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "../App";

const GAME_SLUG = "2026-07-10-beneath_sunden-1";
const GAME_META = {
  genre_slug: "caverns_and_claudes",
  world_slug: "beneath_sunden",
  mode: "single",
};

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(GAME_META), {
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

// ── Fixtures ────────────────────────────────────────────────────────────────

// Surface cartography frame (the world scene). Region nodes with NO room_exits
// → MapWidget routes to MapOverlay.
const SURFACE_MAP_UPDATE = {
  type: "MAP_UPDATE",
  player_id: "p-alice",
  payload: {
    current_location: "ropefoot",
    region: "Ropefoot",
    explored: [
      { name: "Ropefoot", x: 0, y: 0, type: "region", connections: ["the_dropmouth"] },
      { name: "The Dropmouth", x: 1, y: 0, type: "region", connections: ["ropefoot"] },
    ],
    fog_bounds: { width: 10, height: 10 },
  },
};

// SITE_MAP frame in the SERVER'S EXACT wire shape (map_emit.py
// `_build_site_map_payload` → SiteMapPayload/SiteMapLocation):
//   - top level: current_location, region, explored[], site_id, site_name,
//     archetype, extent  (NO fog_bounds)
//   - each location: id, name, type:"region", connections, room_exits[]
//     (target/exit_type/bearing), room_type, is_current_room  (NO x / NO y)
const SITE_MAP_FRAME = {
  type: "SITE_MAP",
  player_id: "p-alice",
  payload: {
    current_location: "frontier:entrance",
    region: "frontier:entrance",
    explored: [
      {
        id: "frontier:entrance",
        name: "The Dropmouth Descent",
        type: "region",
        connections: ["frontier:r2"],
        room_exits: [
          { target: "frontier:r2", exit_type: "corridor", bearing: "north" },
        ],
        room_type: "entrance",
        is_current_room: true,
      },
      {
        id: "frontier:r2",
        name: "The Rope Gallery",
        type: "region",
        connections: ["frontier:entrance"],
        room_exits: [
          { target: "frontier:entrance", exit_type: "corridor", bearing: "south" },
        ],
        room_type: "normal",
        is_current_room: false,
      },
    ],
    site_id: "frontier",
    site_name: "The Deep",
    archetype: "megadungeon",
    extent: "frontier",
  },
};

// ── Test harness ──────────────────────────────────────────────────────────────

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "alice");
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "alice",
        genre: "caverns_and_claudes",
        world: "beneath_sunden",
        last_played_iso: new Date().toISOString(),
        game_slug: GAME_SLUG,
        mode: "single",
      },
    ]),
  );
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

/** Render the App, drive to game phase, and select the Map tab. */
async function renderToMapTab(server: WS): Promise<void> {
  render(
    <MemoryRouter initialEntries={[`/play/${GAME_SLUG}`]}>
      <App />
    </MemoryRouter>,
  );

  await server.connected;
  await server.nextMessage; // consume the client's outbound connect frame

  act(() => {
    server.send({
      type: "SESSION_EVENT",
      payload: { event: "ready", has_character: true },
    });
  });

  // Game phase is up once the InputBar renders.
  await screen.findByPlaceholderText(/what do you do/i);

  // jsdom → MobileTabView. Click the Map tab so MapWidget mounts.
  const mapTab = await screen.findByRole("tab", { name: /map/i });
  fireEvent.click(mapTab);
}

function roomRects(): NodeListOf<Element> {
  return document.body.querySelectorAll("rect[data-room-id]");
}

describe("SITE_MAP wiring (164-5) — message → siteMap → Automapper + breadcrumb", () => {
  it("draws the site room graph AND the breadcrumb when a SITE_MAP frame arrives (AC-4, AC-5)", async () => {
    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    await renderToMapTab(server);

    // Before any map frame: the Map tab shows the empty state, no room nodes.
    expect(roomRects()).toHaveLength(0);

    act(() => {
      server.send(SITE_MAP_FRAME);
    });

    // The site room-graph panel (Automapper) renders one rect[data-room-id]
    // per discovered room — NOT the surface cartography overlay.
    await waitFor(() => {
      expect(screen.queryByTestId("map-panel-room-graph")).toBeInTheDocument();
    });
    expect(roomRects()).toHaveLength(2);
    expect(screen.queryByTestId("map-overlay")).not.toBeInTheDocument();

    // The breadcrumb (the visible 158-36 fix) names the site the player is in.
    const crumb = screen.getByTestId("map-site-breadcrumb");
    expect(crumb.textContent).toContain("The Deep");

    // The current room (frontier:entrance) is marked.
    const current = document.body.querySelector(
      'rect[data-room-id="frontier:entrance"].current-room',
    );
    expect(current).not.toBeNull();
  });

  it("world map and site map coexist — drilling out reveals the un-clobbered world (AC-3)", async () => {
    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    await renderToMapTab(server);

    // 1) World cartography arrives → MapOverlay region nodes, no room graph.
    act(() => {
      server.send(SURFACE_MAP_UPDATE);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("map-overlay")).toBeInTheDocument();
    });
    expect(roomRects()).toHaveLength(0);

    // 2) SITE_MAP arrives → the site room graph foregrounds. Crucially this is
    //    a SEPARATE scene slot: the world map is NOT overwritten.
    act(() => {
      server.send(SITE_MAP_FRAME);
    });
    await waitFor(() => {
      expect(roomRects()).toHaveLength(2);
    });
    expect(screen.queryByTestId("map-overlay")).not.toBeInTheDocument();

    // 3) Drill out (view-only) → the world cartography returns from its own
    //    slot, proving the SITE_MAP did not clobber it (the old single-slot
    //    bug). No new frame is sent; this is a pure client-side view toggle.
    fireEvent.click(screen.getByTestId("map-drill-out"));
    await waitFor(() => {
      expect(screen.queryByTestId("map-overlay")).toBeInTheDocument();
    });
    expect(roomRects()).toHaveLength(0);
  });

  it("consumes the server's exact SITE_MAP wire shape — no x/y/fog_bounds required (AC-2)", async () => {
    // SITE_MAP_FRAME omits x, y, and fog_bounds exactly as the server emits
    // (SiteMapLocation has no x/y; SiteMapPayload has no fog_bounds). If the
    // handler blindly reused the MAP_UPDATE typing/cast in a way that requires
    // those fields, the frame would be dropped or crash. It must not.
    const frameLoc = SITE_MAP_FRAME.payload.explored[0] as Record<string, unknown>;
    expect("x" in frameLoc).toBe(false);
    expect("y" in frameLoc).toBe(false);
    expect("fog_bounds" in SITE_MAP_FRAME.payload).toBe(false);

    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    await renderToMapTab(server);

    act(() => {
      server.send(SITE_MAP_FRAME);
    });

    await waitFor(() => {
      expect(roomRects()).toHaveLength(2);
    });
  });
});
