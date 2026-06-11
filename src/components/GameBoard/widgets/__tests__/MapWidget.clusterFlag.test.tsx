/**
 * MapWidget cluster detection — Story 104-2 (M-B), spec
 * docs/superpowers/specs/2026-06-11-space-opera-map-playtest-addendum.md §5.
 *
 * RED-phase contract (TEA / Fezzik, 2026-06-11). This story amends ADR-141's
 * "cluster = >1 region node" heuristic. The single-vs-cluster decision is now
 * a **server flag** — `cartography.is_cluster` (Story 104-1 / M-A) — which
 * rides INSIDE the cartography payload of every MAP_UPDATE (see
 * sidequest-server session_helpers.py:1483, ALWAYS a concrete bool on the
 * wire). The client must read that flag, NOT `Object.keys(regions).length > 1`.
 *
 * The playtest falsifier (why the count heuristic is wrong): `coyote_star`
 * authors EIGHT regions in cartography.yaml (Far Landing, Deep Root, Red
 * Prospect, Grand Gate, Turning Hub, Mendes' Post, The Broken Drift, The Last
 * Drift) but is ONE system — those 8 regions are the *bodies* in its single
 * orrery. `regionCount > 1` mis-flags it as a cluster, forcing a campaign
 * graph whose other 7 nodes are dead clicks. The fix keys cluster on the
 * server flag so a multi-region single-system world collapses to orrery-as-Map.
 *
 * The two divergence cases — where the flag and the node count DISAGREE — are
 * the load-bearing RED tests:
 *   - multi-region (8) + is_cluster:false  → orrery-as-Map (NOT cluster graph)
 *   - single-region (1) + is_cluster:true  → cluster graph (NOT orrery)
 * A fix that still keys on node count cannot pass both.
 *
 * NOTE FOR DEV (GREEN): `is_cluster` is not yet on the `CartographyMetadata`
 * type (src/components/MapOverlay.tsx). Add `is_cluster?: boolean` (or a
 * required boolean — the server always sends it) there before/while wiring
 * MapWidget.tsx:97, or the typecheck/build gate fails. Vitest (esbuild) does
 * not typecheck, so these tests RUN at RED and fail on behavior.
 */
import { fireEvent, render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MapWidget } from "../MapWidget";
import type { MapState } from "@/components/MapOverlay";
import type { OrbitalIntentResponse } from "@/types/orbital-intent";

/**
 * coyote_star-shaped world: EIGHT region nodes but ONE system. The 8 regions
 * are bodies in a single orrery; the server flags it single (is_cluster:false).
 * This is the multi-region/single-system trap the node-count heuristic fails.
 */
function coyoteMultiRegionState(): MapState {
  const regions = {
    far_landing: { name: "Far Landing", adjacent: ["deep_root", "grand_gate"] },
    deep_root: { name: "Deep Root", adjacent: ["far_landing"] },
    red_prospect: { name: "Red Prospect", adjacent: ["grand_gate"] },
    grand_gate: { name: "Grand Gate", adjacent: ["far_landing", "turning_hub"] },
    turning_hub: { name: "Turning Hub", adjacent: ["grand_gate", "mendes_post"] },
    mendes_post: { name: "Mendes' Post", adjacent: ["turning_hub"] },
    broken_drift: { name: "The Broken Drift", adjacent: ["last_drift"] },
    last_drift: { name: "The Last Drift", adjacent: ["broken_drift"] },
  };
  return {
    current_location: "far_landing",
    region: "Coyote Star",
    explored: [
      { id: "far_landing", name: "Far Landing", x: 0, y: 0, type: "region", connections: [] },
    ],
    fog_bounds: { width: 10, height: 10 },
    cartography: {
      navigation_mode: "region",
      starting_region: "far_landing",
      regions,
      routes: [],
      // Story 104-1 / M-A flag: ONE system → single, despite 8 region nodes.
      is_cluster: false,
    },
  } as MapState;
}

/**
 * aureate_span-shaped world: has cartography but no systems/ dir yet → the
 * server flags it single. AC2 names it alongside coyote_star for regression.
 */
function aureateSingleState(): MapState {
  return {
    current_location: "corona_prime",
    region: "Aureate Span",
    explored: [
      { id: "corona_prime", name: "Corona Prime", x: 0, y: 0, type: "region", connections: [] },
    ],
    fog_bounds: { width: 10, height: 10 },
    cartography: {
      navigation_mode: "region",
      starting_region: "corona_prime",
      regions: { corona_prime: { name: "Corona Prime", adjacent: [] } },
      routes: [],
      is_cluster: false,
    },
  } as MapState;
}

/**
 * Inverse divergence: ONE region node but the server flags it a CLUSTER
 * (is_cluster:true). Proves the client honors the flag, not the count — a
 * naive `regionCount > 1` fix renders the orrery here and fails.
 */
function singleRegionClusterState(): MapState {
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
      regions: { yula: { name: "Yula", adjacent: [] } },
      routes: [],
      is_cluster: true,
    },
  } as MapState;
}

/** perseus_cloud-shaped true cluster: 3 regions + is_cluster:true (AC3). */
function perseusClusterState(): MapState {
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
      is_cluster: true,
    },
  } as MapState;
}

function chartFixture(scopeCenter = "far_landing"): OrbitalIntentResponse {
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

describe("MapWidget cluster flag (104-2 / M-B)", () => {
  describe("AC1 — isCluster reads the server flag, not regionCount", () => {
    it("multi-region single-system world (8 nodes, is_cluster:false) does NOT render the cluster graph", () => {
      const { queryByTestId } = render(
        <MapWidget
          mapData={coyoteMultiRegionState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={vi.fn()}
        />
      );
      // regionCount=8 would flag this a cluster under the retired heuristic;
      // the flag says single, so the campaign graph must NOT appear.
      expect(queryByTestId("map-region-graph")).not.toBeInTheDocument();
      // The orrery collapse branch renders instead (loading, no chart yet).
      expect(queryByTestId("map-panel-orbital-loading")).toBeInTheDocument();
    });

    it("single-region cluster world (1 node, is_cluster:true) renders the cluster graph, not the orrery", () => {
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={singleRegionClusterState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={vi.fn()}
        />
      );
      // regionCount=1 would collapse to orrery under the retired heuristic;
      // the flag says cluster, so the campaign graph wins.
      expect(getByTestId("map-region-graph")).toBeInTheDocument();
      expect(queryByTestId("map-panel-orbital")).not.toBeInTheDocument();
      expect(queryByTestId("map-panel-orbital-loading")).not.toBeInTheDocument();
    });

    it("does not eagerly fetch the orbital chart for a single-region cluster (still at campaign scale)", () => {
      const sendOrbitalIntent = vi.fn();
      render(
        <MapWidget
          mapData={singleRegionClusterState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(sendOrbitalIntent).not.toHaveBeenCalled();
    });
  });

  describe("AC2 / AC4 — single-system world collapses to orrery-as-Map (no cluster graph, no drill)", () => {
    it("coyote_star (multi-region, is_cluster:false) collapses to the orrery, fetched eagerly", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={coyoteMultiRegionState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      expect(getByTestId("map-panel-orbital-loading")).toBeInTheDocument();
      expect(queryByTestId("map-region-graph")).not.toBeInTheDocument();
      // Two scales collapsed → eager initial view_map at system_root (#748).
      expect(sendOrbitalIntent).toHaveBeenCalledWith({
        kind: "view_map",
        scope: "system_root",
      });
    });

    it("AC4: single-system multi-region fixture asserts no cluster graph + no drill + orrery direct", () => {
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={coyoteMultiRegionState()}
          orbital
          lastOrbitalChart={chartFixture("far_landing")}
          sendOrbitalIntent={vi.fn()}
        />
      );
      // Orrery rendered directly as the Map…
      expect(getByTestId("map-panel-orbital")).toBeInTheDocument();
      expect(
        getByTestId("orbital-chart-container").getAttribute("data-scope-center")
      ).toBe("far_landing");
      // …no cluster campaign graph…
      expect(queryByTestId("map-region-graph")).not.toBeInTheDocument();
      // …and no drill: there is no campaign scale to return to, and none of
      // the 8 regions is a clickable cluster node.
      expect(queryByTestId("map-drill-back")).not.toBeInTheDocument();
      expect(queryByTestId("map-region-node-far_landing")).not.toBeInTheDocument();
      expect(queryByTestId("map-region-node-grand_gate")).not.toBeInTheDocument();
    });

    it("aureate_span (is_cluster:false) regression — collapses to orrery, no cluster graph", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={aureateSingleState()}
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
  });

  describe("AC3 — cluster world (perseus_cloud) unchanged: campaign graph default + drill", () => {
    it("perseus_cloud (is_cluster:true) defaults to the campaign graph, not the orrery", () => {
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={perseusClusterState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={vi.fn()}
        />
      );
      expect(getByTestId("map-region-graph")).toBeInTheDocument();
      expect(queryByTestId("map-panel-orbital")).not.toBeInTheDocument();
      expect(queryByTestId("map-panel-orbital-loading")).not.toBeInTheDocument();
    });

    it("perseus_cloud drill from the occupied node still reaches the orrery (unchanged)", () => {
      const sendOrbitalIntent = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <MapWidget
          mapData={perseusClusterState()}
          orbital
          lastOrbitalChart={null}
          sendOrbitalIntent={sendOrbitalIntent}
        />
      );
      fireEvent.click(getByTestId("map-region-node-yula"));
      expect(sendOrbitalIntent).toHaveBeenCalledWith({
        kind: "view_map",
        scope: "system_root",
      });
      expect(getByTestId("map-panel-orbital-loading")).toBeInTheDocument();
      expect(getByTestId("map-drill-back")).toBeInTheDocument();
      expect(queryByTestId("map-region-graph")).not.toBeInTheDocument();
    });
  });
});
