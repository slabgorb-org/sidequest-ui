// Story 153-25 — DUNGEON_MAP client wiring (sq-playtest 2026-06-20/21, epic 153).
//
// FINDING (verbatim): "while standing in exp002.r2 (discovered=2/15), the Map
// tab still renders only the 2 surface cartography region nodes (Ropefoot, The
// Dropmouth) + the 'Down the Rope' route. The dungeon.map_emitted room-graph
// (entrance + discovered rooms + the three passages) is never drawn. The player
// exploring the maze has no map of it."
//
// ROOT CAUSE: a message-wiring gap, NOT a missing renderer. The server already
// broadcasts a DUNGEON_MAP frame (sidequest-server .../map_emit.py:957
// `emit_fn(msg, "DUNGEON_MAP")`) carrying the discovered room graph, and the
// Automapper that draws room graphs already exists and is already routed by
// MapWidget. The client just never names `MessageType.DUNGEON_MAP` and has no
// handler branch for it (App.tsx handles only MAP_UPDATE), so the frame falls
// through to `setMessages([...prev, msg])` and is dropped — `mapData` never
// becomes the room graph.
//
// This proves the END-TO-END wire through the REAL App: a DUNGEON_MAP frame over
// the socket → App handler → `mapData` → MapWidget routes the room-graph payload
// to the Automapper (rect[data-room-id] room nodes + current-room marker), NOT
// the surface cartography region nodes. Per CLAUDE.md "Verify Wiring, Not Just
// Existence" and AC-6: a pure Automapper render test is NOT sufficient — the
// message must be NAMED, DISPATCHED through the real App, and REACH the renderer.
//
// jsdom reports the mobile breakpoint (test-setup.ts), so GameBoard renders via
// MobileTabView; the Map tab is a role="tab" button and clicking it mounts
// <MapWidget mapData={mapData}/>. Harness modeled on death-banner-wiring.test.tsx.

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

const GAME_SLUG = "2026-06-20-beneath_sunden-1";
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

// Surface cartography frame (the ONLY thing the player sees today while in the
// dungeon). Region nodes with NO room_exits → MapWidget routes to MapOverlay.
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

// Dungeon room-graph frame in the SERVER'S EXACT wire shape
// (map_emit.py `_build_dungeon_map_payload` → DungeonMapPayload/DungeonMapLocation):
//   - top level: current_location, region, explored[]  (NO fog_bounds)
//   - each location: id, name, type:"region", connections, room_exits[]
//     (target/exit_type/bearing), room_type, is_current_room  (NO x / NO y)
// The omission of x/y/fog_bounds is deliberate — it mirrors the real wire and
// guards AC-4 (the consumption must tolerate the server shape, not require the
// MAP_UPDATE-only x/y/fog_bounds fields). discovered = 2 (matches the finding's
// discovered=2/15); current room = exp002.r2.
const DUNGEON_MAP_FRAME = {
  type: "DUNGEON_MAP",
  player_id: "p-alice",
  payload: {
    current_location: "exp002.r2",
    region: "exp002.r2",
    explored: [
      {
        id: "exp002.r1",
        name: "The Dropmouth Descent",
        type: "region",
        connections: ["exp002.r2"],
        room_exits: [
          { target: "exp002.r2", exit_type: "corridor", bearing: "north" },
        ],
        room_type: "entrance",
        is_current_room: false,
      },
      {
        id: "exp002.r2",
        name: "The Rope Gallery",
        type: "region",
        connections: ["exp002.r1"],
        room_exits: [
          { target: "exp002.r1", exit_type: "corridor", bearing: "south" },
        ],
        room_type: "normal",
        is_current_room: true,
      },
    ],
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

  // jsdom → MobileTabView. The Map tab is always available; click it so the
  // MapWidget mounts and reacts to mapData.
  const mapTab = await screen.findByRole("tab", { name: /map/i });
  fireEvent.click(mapTab);
}

function roomRects(): NodeListOf<Element> {
  return document.body.querySelectorAll("rect[data-room-id]");
}

describe("DUNGEON_MAP wiring (153-25) — message → mapData → Automapper", () => {
  it("draws the dungeon room-graph in the Map tab when a DUNGEON_MAP frame arrives (AC-2, AC-6)", async () => {
    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    await renderToMapTab(server);

    // Before any map frame: the Map tab shows the empty state, no room nodes.
    expect(roomRects()).toHaveLength(0);

    act(() => {
      server.send(DUNGEON_MAP_FRAME);
    });

    // The room-graph panel (Automapper) renders one rect[data-room-id] per
    // discovered room — and is NOT the surface cartography overlay.
    await waitFor(() => {
      expect(screen.queryByTestId("map-panel-room-graph")).toBeInTheDocument();
    });
    expect(roomRects()).toHaveLength(2);
    expect(screen.queryByTestId("map-overlay")).not.toBeInTheDocument();

    // The current room (exp002.r2) is marked.
    const current = document.body.querySelector(
      'rect[data-room-id="exp002.r2"].current-room',
    );
    expect(current).not.toBeNull();
    // The entrance room is present but NOT marked current.
    const entrance = document.body.querySelector(
      'rect[data-room-id="exp002.r1"]',
    );
    expect(entrance).not.toBeNull();
    expect(entrance!.classList.contains("current-room")).toBe(false);
  });

  it("flips surface → dungeon → surface as MAP_UPDATE and DUNGEON_MAP arrive (AC-3 coexistence)", async () => {
    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    await renderToMapTab(server);

    // 1) Surface cartography → MapOverlay region nodes, no room graph.
    act(() => {
      server.send(SURFACE_MAP_UPDATE);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("map-overlay")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("map-panel-room-graph")).not.toBeInTheDocument();
    expect(roomRects()).toHaveLength(0);

    // 2) DUNGEON_MAP supersedes the surface view — the player standing in the
    //    dungeon now sees the room graph, NOT the 2 surface nodes.
    act(() => {
      server.send(DUNGEON_MAP_FRAME);
    });
    await waitFor(() => {
      expect(roomRects()).toHaveLength(2);
    });
    expect(screen.queryByTestId("map-overlay")).not.toBeInTheDocument();

    // 3) Back to the surface (e.g. climbing out) → cartography view returns,
    //    the room graph is gone. Locks the coexistence rule both directions.
    act(() => {
      server.send(SURFACE_MAP_UPDATE);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("map-overlay")).toBeInTheDocument();
    });
    expect(roomRects()).toHaveLength(0);
  });

  it("consumes the server's exact DUNGEON_MAP wire shape — no x/y/fog_bounds required (AC-4)", async () => {
    // DUNGEON_MAP_FRAME omits x, y, and fog_bounds exactly as the server emits
    // (DungeonMapLocation has no x/y; DungeonMapPayload has no fog_bounds). If
    // the handler blindly reuses the MAP_UPDATE typing/cast in a way that
    // requires those fields, the frame would be dropped or crash. It must not.
    const frameLoc = DUNGEON_MAP_FRAME.payload.explored[0] as Record<string, unknown>;
    expect("x" in frameLoc).toBe(false);
    expect("y" in frameLoc).toBe(false);
    expect("fog_bounds" in DUNGEON_MAP_FRAME.payload).toBe(false);

    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    await renderToMapTab(server);

    act(() => {
      server.send(DUNGEON_MAP_FRAME);
    });

    await waitFor(() => {
      expect(roomRects()).toHaveLength(2);
    });
  });

  it("emits a client-side consumption marker when it applies a DUNGEON_MAP frame (AC-5)", async () => {
    // The server proves it SENT via the dungeon.map_emitted span (map_emit.py:940).
    // The client must prove it RECEIVED AND APPLIED so a playtest can confirm the
    // frame is consumed rather than dropped — a lightweight trace marker tagged
    // `[dungeon-map]` carrying the discovered room count and the current room id.
    // Format is the dev's choice (info or debug) but the tag, count, and current
    // room are the contract, e.g. console.info("[dungeon-map] applied rooms=2 current=exp002.r2").
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    await renderToMapTab(server);

    act(() => {
      server.send(DUNGEON_MAP_FRAME);
    });

    await waitFor(() => {
      const markers = [...info.mock.calls, ...debug.mock.calls]
        .map((args) => args.map((a) => String(a)).join(" "))
        .filter((line) => /\[dungeon[- ]?map\]/i.test(line));
      expect(markers.length).toBeGreaterThanOrEqual(1);
    });

    const markers = [...info.mock.calls, ...debug.mock.calls]
      .map((args) => args.map((a) => String(a)).join(" "))
      .filter((line) => /\[dungeon[- ]?map\]/i.test(line));
    const joined = markers.join(" || ");
    // Current room id (unambiguous) ...
    expect(joined).toContain("exp002.r2");
    // ... and the discovered room count as a standalone "2" (the embedded "2"
    // inside "exp002.r2"/"exp002.r1" is NOT a \b2\b match, so this isolates the count).
    expect(joined).toMatch(/\b2\b/);
  });
});
