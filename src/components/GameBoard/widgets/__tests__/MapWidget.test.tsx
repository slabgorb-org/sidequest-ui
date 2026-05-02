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

  describe("orbital chart routing (worldSlug=coyote_star)", () => {
    it("renders the loading state before any chart arrives", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId } = render(
        <MapWidget
          mapData={null}
          worldSlug="coyote_star"
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
        svg: '<svg data-testid="orbital-svg"><circle data-body-id="red_prospect"/></svg>',
        t_hours: 0,
        party_at: "turning_hub",
      };
      const { getByTestId } = render(
        <MapWidget
          mapData={null}
          worldSlug="coyote_star"
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
          worldSlug="flickering_reach"
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      // Empty-state, not the orbital panel.
      expect(getByTestId("map-panel-empty")).toBeInTheDocument();
      expect(sendOrbitalIntent).not.toHaveBeenCalled();
    });
  });

  describe("tactical grid mode (single room with wire-format tactical_grid)", () => {
    /**
     * Regression guard for the 2026-04-10 playtest: MapWidget was passing the
     * wire-format tactical_grid (`cells: string[][]` + features sidecar)
     * straight through to TacticalGridRenderer, which expects typed cells
     * with inline glyphs and a legend lookup. Every cell rendered with
     * fill=undefined and the panel was solid black with zero visible rects.
     *
     * The fixture below mirrors the actual MAP_UPDATE shape produced by
     * sidequest-game::room_movement::build_room_graph_explored when a room
     * has an ASCII grid — string cells, features as a positions sidecar,
     * no synthesized legend. If the adapter is missing or broken, the cells
     * count assertion will fail.
     */
    function singleRoomWithGrid(): MapState {
      return {
        current_location: "The Receiving Room",
        region: "Mawdeep",
        explored: [
          {
            // No `id` field — matches the actual wire format from
            // sidequest-protocol::ExploredLocation. Single-room fixture so
            // we don't depend on the room→neighbor join (which has its own
            // protocol mismatch tracked as a follow-up finding).
            name: "The Receiving Room",
            x: 0,
            y: 0,
            type: "normal",
            connections: [],
            room_exits: [
              { target: "antechamber", exit_type: "corridor" },
            ],
            room_type: "normal",
            is_current_room: true,
            tactical_grid: {
              width: 4,
              height: 3,
              // Wire format: string cells. The adapter must convert these
              // into typed `{type}` objects before the renderer can fill them.
              cells: [
                ["wall", "wall", "wall", "wall"],
                ["wall", "floor", "feature", "wall"],
                ["wall", "wall", "wall", "wall"],
              ],
              // Wire format: features as positions sidecar. The adapter
              // must invert this back into per-cell glyphs.
              features: [
                {
                  glyph: "P",
                  feature_type: "interactable",
                  label: "pedestal",
                  positions: [[2, 1]],
                },
              ],
            },
          },
        ],
        fog_bounds: { width: 10, height: 10 },
      };
    }

    it("renders tactical grid cells with valid fill colors (not solid black)", () => {
      const { container } = render(<MapWidget mapData={singleRoomWithGrid()} />);

      // The renderer draws one rect[data-cell-type] per cell. The widget
      // routed to the room-graph branch and Automapper delegated to
      // TacticalGridRenderer for the single-room-with-grid case.
      const cells = container.querySelectorAll("rect[data-cell-type]");
      expect(cells.length).toBe(12); // 4 wide × 3 tall

      // Every cell must have a non-empty fill — this is the regression guard.
      // Before the adapter, fill was undefined for every cell because
      // cellFill switched on `cell.type` and the cells were bare strings.
      for (const cell of Array.from(cells)) {
        const fill = cell.getAttribute("fill");
        expect(fill).toBeTruthy();
        expect(fill).not.toBe("undefined");
      }
    });

    it("re-attaches feature glyphs from the sidecar so legend lookup works", () => {
      const { container } = render(<MapWidget mapData={singleRoomWithGrid()} />);

      // The feature cell at (2, 1) must render as a feature, not a default
      // floor. TacticalGridRenderer marks feature cells with
      // data-cell-type="feature" and draws a marker glyph from the legend.
      const featureCells = container.querySelectorAll(
        'rect[data-cell-type="feature"]',
      );
      expect(featureCells.length).toBe(1);

      const featureCell = featureCells[0];
      expect(featureCell.getAttribute("data-x")).toBe("2");
      expect(featureCell.getAttribute("data-y")).toBe("1");
    });
  });
});
