/**
 * Two-scale MapWidget — ADR-141 / epic 98 / story 98-3 (U1).
 *
 * RED-phase contract (TEA, 2026-06-09). The `orbital: boolean` whole-Map
 * toggle from playtest fix #748 is retired as a *router* and replaced by a
 * campaign ↔ local scale/drill state:
 *
 *   - Cluster world (multi-region cartography) → default Map = the shared
 *     d3-dag cartography graph (100-10's CartographyMap, testid
 *     `map-region-graph`) — NOT the orrery (AC1).
 *   - Drill-down is from the node the party occupies (ADR-141: "drilled
 *     into from the node the party occupies"); clicking the current region
 *     node enters local scale and fetches the orrery; a back affordance
 *     (testid `map-drill-back`) returns to campaign scale (AC2).
 *   - `orbital` no longer routes the whole Map; it announces capability
 *     only (AC3 — #748's orrery-as-Map survives ONLY where the two scales
 *     collapse).
 *   - Single-system world (≤1 graph node, or no cartography) keeps
 *     orrery-as-Map (AC4 — #748 non-regression).
 *   - Current region with no authored systems/<id>.yaml: the server fails
 *     loud (98-2); the widget renders a legible "no local chart" state
 *     (testid `map-panel-no-local-chart`), never a crash or an eternal
 *     spinner (AC5).
 *
 * New prop seam defined by this contract:
 *   lastOrbitalError?: { code: string; message: string } | null
 * — the ERROR surfaced for a rejected ORBITAL_INTENT (e.g. the 98-2
 * missing-system fail-loud), threaded the same way lastOrbitalChart is.
 */
import { fireEvent, render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MapWidget } from "../MapWidget";
import type { MapState } from "@/components/MapOverlay";
import type { OrbitalIntentResponse } from "@/types/orbital-intent";

/** perseus_cloud-shaped cluster: 3 region nodes, party at yula. */
function clusterMapState(): MapState {
  return {
    current_location: "yula",
    region: "Perseus Cloud",
    explored: [
      { id: "yula", name: "Yula", x: 0, y: 0, type: "region", connections: [] },
    ],
    fog_bounds: { width: 10, height: 10 },
    cartography: {
      navigation_mode: "region",
      starting_region: "yula",
      regions: {
        yula: { name: "Yula", adjacent: ["forma", "ceron"] },
        forma: { name: "Forma", adjacent: ["yula"] },
        ceron: { name: "Ceron", adjacent: ["yula"] },
      },
      routes: [],
    },
  };
}

/** coyote_star-shaped single system: one region node. */
function singleSystemMapState(): MapState {
  return {
    current_location: "coyote",
    region: "Coyote Star",
    explored: [
      {
        id: "coyote",
        name: "Coyote",
        x: 0,
        y: 0,
        type: "region",
        connections: [],
      },
    ],
    fog_bounds: { width: 10, height: 10 },
    cartography: {
      navigation_mode: "region",
      starting_region: "coyote",
      regions: { coyote: { name: "Coyote", adjacent: [] } },
      routes: [],
    },
  };
}

function chartFixture(scopeCenter = "yula"): OrbitalIntentResponse {
  return {
    scope_center: scopeCenter,
    svg: `<svg><g id="viewport"><circle data-body-id="${scopeCenter}_prime"/></g></svg>`,
    t_hours: 0,
    epoch_days: 0,
    party_at: null,
    next_conjunction: null,
    plotted_course: null,
  };
}

describe("two-scale MapWidget (ADR-141 / 98-3)", () => {
  describe("AC1 — cluster world defaults to the campaign cartography graph", () => {
    it("renders the shared d3-dag graph, not the orrery (wiring test)", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      // The shared CartographyMap (100-10) is the only emitter of this
      // testid — its presence proves the d3-dag render path is wired in
      // as the cluster default, per the epic verification spine.
      expect(getByTestId("map-region-graph")).toBeInTheDocument();
      expect(queryByTestId("map-panel-orbital")).not.toBeInTheDocument();
      expect(
        queryByTestId("map-panel-orbital-loading")
      ).not.toBeInTheDocument();
    });

    it("does not eagerly fetch the orbital chart at campaign scale", () => {
      const sendOrbitalIntent = vi.fn();
      render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(sendOrbitalIntent).not.toHaveBeenCalled();
    });

    it("marks the party's current region node on the campaign graph", () => {
      const { getByTestId } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={vi.fn()}
        />
      );
      expect(getByTestId("map-region-node-yula").getAttribute("data-current")).toBe(
        "true"
      );
    });

    it("stays at campaign scale even when a stale chart response exists (AC3: orbital no longer routes the whole Map)", () => {
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={chartFixture()}
          sendOrbitalIntent={vi.fn()}
        />
      );
      expect(getByTestId("map-region-graph")).toBeInTheDocument();
      expect(queryByTestId("map-panel-orbital")).not.toBeInTheDocument();
    });
  });

  describe("AC2 — drill-down into the occupied system's orrery and back", () => {
    it("clicking the current region node drills to local scale and fetches the chart", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-region-node-yula"));

      // Server resolves systems/<current_region>.yaml from system_root
      // scope (98-2) — the drill fetch is the standard initial view_map.
      expect(sendOrbitalIntent).toHaveBeenCalledWith({
        kind: "view_map",
        scope: "system_root",
      });
      // Local scale: orrery loading state replaces the graph.
      expect(getByTestId("map-panel-orbital-loading")).toBeInTheDocument();
      expect(queryByTestId("map-region-graph")).not.toBeInTheDocument();
      // The player must never be trapped at local scale — back affordance
      // exists even while the chart is still loading.
      expect(getByTestId("map-drill-back")).toBeInTheDocument();
    });

    it("renders the orrery once the chart arrives at local scale", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId, rerender } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-region-node-yula"));
      rerender(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={chartFixture()}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(getByTestId("map-panel-orbital")).toBeInTheDocument();
      expect(
        getByTestId("orbital-chart-container").getAttribute("data-scope-center")
      ).toBe("yula");
      expect(queryByTestId("map-region-graph")).not.toBeInTheDocument();
    });

    it("back affordance returns from the orrery to the campaign graph", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId, rerender } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-region-node-yula"));
      rerender(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={chartFixture()}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-drill-back"));

      expect(getByTestId("map-region-graph")).toBeInTheDocument();
      expect(queryByTestId("map-panel-orbital")).not.toBeInTheDocument();
      expect(queryByTestId("map-drill-back")).not.toBeInTheDocument();
    });

    it("clicking a non-occupied node does not drill (ADR-141: drill is from the node the party occupies)", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-region-node-forma"));

      expect(sendOrbitalIntent).not.toHaveBeenCalled();
      expect(getByTestId("map-region-graph")).toBeInTheDocument();
      expect(
        queryByTestId("map-panel-orbital-loading")
      ).not.toBeInTheDocument();
    });
  });

  describe("AC4 — single-system world keeps orrery-as-Map (#748 collapse)", () => {
    it("one graph node collapses the two scales: orrery is the Map, fetched eagerly", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={singleSystemMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(getByTestId("map-panel-orbital-loading")).toBeInTheDocument();
      expect(queryByTestId("map-region-graph")).not.toBeInTheDocument();
      expect(sendOrbitalIntent).toHaveBeenCalledWith({
        kind: "view_map",
        scope: "system_root",
      });
    });

    it("single-system orrery has no back affordance (there is no campaign scale)", () => {
      const { queryByTestId } = render(
        <MapWidget
          mapData={singleSystemMapState()}
          orbital
          lastOrbitalChart={chartFixture("coyote")}
          sendOrbitalIntent={vi.fn()}
        />
      );
      expect(queryByTestId("map-drill-back")).not.toBeInTheDocument();
    });

    it("orbital world with empty cartography regions falls back to orrery-as-Map", () => {
      const sendOrbitalIntent = vi.fn();
      const mapData: MapState = {
        ...singleSystemMapState(),
        cartography: {
          navigation_mode: "region",
          starting_region: "",
          regions: {},
          routes: [],
        },
      };
      const { getByTestId } = render(
        <MapWidget
          mapData={mapData}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(getByTestId("map-panel-orbital-loading")).toBeInTheDocument();
      expect(sendOrbitalIntent).toHaveBeenCalledWith({
        kind: "view_map",
        scope: "system_root",
      });
    });
  });

  describe("AC5 — unauthored system shows a legible no-local-chart state", () => {
    it("renders the no-local-chart state when the drill fetch is rejected", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId, rerender } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-region-node-yula"));
      // Server 98-2 fail-loud: no systems/yula.yaml → ERROR, not a chart.
      rerender(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          lastOrbitalError={{
            code: "orbital_unavailable",
            message:
              "No orbital system file authored for region 'yula' (systems/yula.yaml)",
          }}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      const panel = getByTestId("map-panel-no-local-chart");
      expect(panel).toBeInTheDocument();
      // Legible, not blank: the state must carry visible explanatory text.
      expect(panel.textContent ?? "").not.toBe("");
      // The spinner must not survive the rejection.
      expect(
        queryByTestId("map-panel-orbital-loading")
      ).not.toBeInTheDocument();
      expect(queryByTestId("map-panel-orbital")).not.toBeInTheDocument();
    });

    it("no-local-chart state retains the back affordance to the campaign graph", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId, rerender } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-region-node-yula"));
      rerender(
        <MapWidget
          mapData={clusterMapState()}
          orbital
          lastOrbitalChart={null}
          lastOrbitalError={{
            code: "orbital_unavailable",
            message: "No orbital system file authored for region 'yula'",
          }}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-drill-back"));
      expect(getByTestId("map-region-graph")).toBeInTheDocument();
      expect(
        queryByTestId("map-panel-no-local-chart")
      ).not.toBeInTheDocument();
    });
  });

  describe("non-orbital worlds — capability gate unchanged", () => {
    it("non-orbital cluster world renders the graph but node clicks never drill", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={clusterMapState()}
          orbital={false}
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(getByTestId("map-region-graph")).toBeInTheDocument();
      fireEvent.click(getByTestId("map-region-node-yula"));
      expect(sendOrbitalIntent).not.toHaveBeenCalled();
      expect(
        queryByTestId("map-panel-orbital-loading")
      ).not.toBeInTheDocument();
    });
  });
});
