/**
 * MapWidget wiring — verifies the panel renders the graphical Automapper
 * room graph when MAP_UPDATE carries room_exits, falls back to MapOverlay
 * for cartography/region mode, and handles the empty case.
 *
 * Background (sq-playtest 2026-04-09): before this fix MapWidget only
 * imported MapOverlay and rendered the room list as text. DungeonMapRenderer
 * and Automapper had been built (stories 29-8, 19-8) but never wired into
 * the dock — classic "infrastructure exists but not wired" per CLAUDE.md.
 */
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MapWidget } from "../MapWidget";
import type { MapState } from "@/components/MapOverlay";
import type { OrbitalIntentResponse } from "@/types/orbital-intent";

function roomGraphMapState(): MapState {
  // Shape matches MAP_UPDATE emitted by build_room_graph_explored in
  // sidequest-game/src/room_movement.rs for caverns_and_claudes/mawdeep.
  // Note: `current_location` is the RoomDef slug (matches `state.location`
  // on the server), NOT the display name.
  return {
    current_location: "mouth",
    region: "Mawdeep",
    explored: [
      {
        id: "mouth",
        name: "The Mouth",
        x: 0,
        y: 0,
        type: "entrance",
        connections: ["throat", "antechamber"],
        room_exits: [
          { target: "throat", exit_type: "corridor" },
          { target: "antechamber", exit_type: "corridor" },
        ],
        room_type: "entrance",
        is_current_room: true,
      },
      {
        id: "throat",
        name: "The Throat",
        x: 0,
        y: 0,
        type: "normal",
        connections: ["mouth"],
        room_exits: [{ target: "mouth", exit_type: "corridor" }],
        room_type: "normal",
        is_current_room: false,
      },
      {
        id: "antechamber",
        name: "The Antechamber",
        x: 0,
        y: 0,
        type: "normal",
        connections: ["mouth"],
        room_exits: [{ target: "mouth", exit_type: "corridor" }],
        room_type: "normal",
        is_current_room: false,
      },
    ],
    fog_bounds: { width: 10, height: 10 },
  };
}

describe("MapWidget", () => {
  it("renders empty state when mapData is null", () => {
    const { getByTestId } = render(<MapWidget mapData={null} />);
    expect(getByTestId("map-panel-empty")).toBeInTheDocument();
  });

  describe("room graph mode (room_exits populated)", () => {
    it("renders the Automapper room graph, not MapOverlay", () => {
      const { container, queryByTestId } = render(
        <MapWidget mapData={roomGraphMapState()} />
      );
      expect(queryByTestId("map-panel-room-graph")).toBeInTheDocument();
      // MapOverlay must NOT render when we're in room graph mode.
      expect(queryByTestId("map-overlay")).not.toBeInTheDocument();

      // Automapper renders one rect[data-room-id] per discovered room.
      const rects = container.querySelectorAll("rect[data-room-id]");
      expect(rects).toHaveLength(3);
    });

    it("highlights the current room using the is_current flag", () => {
      const { container } = render(<MapWidget mapData={roomGraphMapState()} />);
      // ExploredRoom.id is taken from ExploredLocation.name in the adapter,
      // so the current room's rect has data-room-id equal to the display name.
      const current = container.querySelector(
        'rect[data-room-id="mouth"].current-room'
      );
      expect(current).toBeInTheDocument();
    });

    it("renders exit lines between connected rooms", () => {
      const { container } = render(<MapWidget mapData={roomGraphMapState()} />);
      const connections = container.querySelectorAll("[data-connection]");
      // The Mouth connects to 2 neighbors; dedup within the graph keeps both edges.
      expect(connections.length).toBeGreaterThanOrEqual(2);
    });

    it("places rooms in distinct positions via layered BFS layout", () => {
      const { container } = render(<MapWidget mapData={roomGraphMapState()} />);
      const rects = Array.from(
        container.querySelectorAll("rect[data-room-id]")
      );
      // Regression guard: before the layoutRoomsLayered fallback, all
      // direction-less rooms collapsed to the same x,y. Every room must
      // occupy a unique (x,y) so they're actually visible as distinct boxes.
      const coords = rects.map(
        (r) => `${r.getAttribute("x")},${r.getAttribute("y")}`
      );
      const unique = new Set(coords);
      expect(unique.size).toBe(coords.length);
    });
  });

  describe("cartography/region mode (no room_exits)", () => {
    it("falls back to MapOverlay when explored has no room_exits", () => {
      const regionMapState: MapState = {
        current_location: "The Dust Barrens",
        region: "Flickering Reach",
        explored: [
          {
            name: "The Dust Barrens",
            x: 0,
            y: 0,
            type: "region",
            connections: [],
          },
        ],
        fog_bounds: { width: 10, height: 10 },
      };
      const { queryByTestId } = render(<MapWidget mapData={regionMapState} />);
      expect(queryByTestId("map-overlay")).toBeInTheDocument();
      expect(queryByTestId("map-panel-room-graph")).not.toBeInTheDocument();
    });
  });

  describe("wiring — imports", () => {
    it("MapWidget module imports Automapper (not just MapOverlay)", async () => {
      // Raw source check: ensures the wiring isn't accidentally reverted.
      const src = (await import("../MapWidget?raw")) as unknown as {
        default: string;
      };
      expect(src.default).toContain("@/components/Automapper");
    });

    it("MapWidget module imports OrbitalChartView (orbital map Task 16)", async () => {
      const src = (await import("../MapWidget?raw")) as unknown as {
        default: string;
      };
      expect(src.default).toContain("@/components/OrbitalChart");
      expect(src.default).toContain("@/hooks/useOrbitalChart");
    });
  });

  // Orbital routing is gated on the server-announced `orbital` prop
  // (GameResponse.orbital — world ships orbits.yaml), not a per-world slug
  // allowlist (sq-playtest 2026-06-07: perseus_cloud orrery unreachable).
  describe("orbital chart routing (orbital prop)", () => {
    it("renders the loading state before any chart arrives", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId } = render(
        <MapWidget
          mapData={null}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(getByTestId("map-panel-orbital-loading")).toBeInTheDocument();
      // The hook auto-fetches the initial system_root view.
      expect(sendOrbitalIntent).toHaveBeenCalledWith({
        kind: "view_map",
        scope: "system_root",
      });
    });

    it("renders the chart panel once a server response arrives", () => {
      const sendOrbitalIntent = vi.fn();
      const chart: OrbitalIntentResponse = {
        scope_center: "coyote",
        svg: '<svg data-testid="orbital-svg"><g id="viewport"><circle data-body-id="red_prospect"/></g></svg>',
        t_hours: 0,
        epoch_days: 0,
        party_at: "turning_hub",
        next_conjunction: null,
        plotted_course: null,
      };
      const { getByTestId } = render(
        <MapWidget
          mapData={null}
          orbital
          lastOrbitalChart={chart}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(getByTestId("map-panel-orbital")).toBeInTheDocument();
      expect(
        getByTestId("orbital-chart-container").getAttribute("data-scope-center")
      ).toBe("coyote");
    });

    it("non-orbital world falls through to existing routing", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId } = render(
        <MapWidget
          mapData={null}
          orbital={false}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      // Empty-state, not the orbital panel.
      expect(getByTestId("map-panel-empty")).toBeInTheDocument();
      expect(sendOrbitalIntent).not.toHaveBeenCalled();
    });
  });

});
// Note: The "tactical grid mode (single room with wire-format tactical_grid)" describe
// block tested the old SVG-cell renderer path (cells: string[][], features sidecar).
// That path was deleted in ADR-096 (image-mode renderer). The new wire format delivers
// cavern_image_url + mask instead of string cells. Tests removed 2026-05-10.
