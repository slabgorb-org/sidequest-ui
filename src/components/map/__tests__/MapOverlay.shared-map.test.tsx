/**
 * Story 100-10 (Phase 3, RED) — split-brain unification + MapOverlay wiring.
 *
 * THE load-bearing safety test for this story. Two surfaces draw the cartography
 * graph: the reference Map section (standalone <CartographyMap>) and the in-game
 * MapOverlay (RegionNodeGraph). Before this story they shared a hand-kept
 * verbatim TS port (`cartographyLayout.ts`) of the Python renderer — a split
 * brain. After it, BOTH render through the same <CartographyMap>, so the same
 * cartography MUST produce identical graph topology on both surfaces.
 *
 * This file is also the WIRING test (per repo CLAUDE.md "Every Test Suite Needs
 * a Wiring Test"): it proves <CartographyMap> has a real non-test consumer — the
 * in-game MapOverlay — by rendering MapOverlay and asserting the shared graph
 * comes out. A passing unit test for CartographyMap in isolation is not enough;
 * MapOverlay must actually adopt it.
 *
 * RED reason: `@/components/map/CartographyMap` does not exist yet → import
 * fails → file fails to collect. After GREEN (component built + MapOverlay
 * rewired to use it) this file must pass.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MapOverlay, type MapState } from "@/components/MapOverlay";
import type { CartographyMetadata } from "@/components/MapOverlay";
import { CartographyMap } from "@/components/map/CartographyMap";

/** Shared cartography fixture exercised through BOTH surfaces. */
const CART: CartographyMetadata = {
  navigation_mode: "region",
  starting_region: "eldergrove",
  regions: {
    // Deliberately NOT in BFS order — proves both surfaces are key-order stable.
    shadowlands: { name: "Shadowlands", adjacent: ["eldergrove", "mire"] },
    mire: { name: "The Sunken Mire", adjacent: ["shadowlands"] },
    eldergrove: { name: "Eldergrove", adjacent: ["shadowlands"] },
  },
  routes: [],
};

const MAP_DATA: MapState = {
  current_location: "eldergrove",
  region: "Eldergrove Reach",
  explored: [],
  fog_bounds: { width: 10, height: 10 },
  cartography: CART,
};

/** Collect the node ids + edge keys rendered inside a graph container. */
function graphTopology(root: HTMLElement) {
  const nodeIds = within(root)
    .getAllByTestId(/^map-region-node-/)
    .map((el) => el.getAttribute("data-region-id") ?? el.dataset.regionId ?? "")
    .sort();
  const edgeKeys = within(root)
    .getAllByTestId(/^map-region-edge-/)
    .map((el) => (el.getAttribute("data-testid") ?? "").replace("map-region-edge-", ""))
    .sort();
  return { nodeIds, edgeKeys };
}

describe("split-brain guard — one shared map renderer", () => {
  it("renders identical graph topology in the reference and in-game contexts", () => {
    // Reference-page context: standalone shared component, no session.
    const ref = render(<CartographyMap cartography={CART} />);
    const refGraph = ref.getByTestId("map-region-graph");
    const refTopo = graphTopology(refGraph);
    ref.unmount();

    // In-game context: the same cartography via MapOverlay.
    render(<MapOverlay mapData={MAP_DATA} onClose={() => {}} />);
    const gameGraph = screen.getByTestId("map-region-graph");
    const gameTopo = graphTopology(gameGraph);

    expect(gameTopo.nodeIds).toEqual(refTopo.nodeIds);
    expect(gameTopo.edgeKeys).toEqual(refTopo.edgeKeys);
    // Sanity: the topology is the real one (3 nodes, 2 de-duped edges).
    expect(refTopo.nodeIds).toEqual(["eldergrove", "mire", "shadowlands"]);
    expect(refTopo.edgeKeys).toEqual([
      "eldergrove--shadowlands",
      "mire--shadowlands",
    ]);
  });
});

describe("regression — in-game MapOverlay after adopting the shared component", () => {
  it("still renders the region node-graph for region-mode cartography", () => {
    render(<MapOverlay mapData={MAP_DATA} onClose={() => {}} />);
    expect(screen.getByTestId("map-region-graph")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^map-region-node-/)).toHaveLength(3);
    expect(screen.getAllByTestId(/^map-region-edge-/)).toHaveLength(2);
  });

  it("still flags the current region ('you are here') through the shared component", () => {
    render(<MapOverlay mapData={MAP_DATA} onClose={() => {}} />);
    expect(screen.getByTestId("map-region-node-eldergrove")).toHaveAttribute(
      "data-current",
      "true"
    );
  });

  it("does not render a region graph for room_graph cartography (empty regions)", () => {
    const roomGraph: MapState = {
      current_location: "entry_hall",
      region: "Dungeon",
      explored: [{ name: "Entry Hall", x: 0, y: 0, type: "room", connections: [] }],
      fog_bounds: { width: 10, height: 10 },
      cartography: {
        navigation_mode: "room_graph",
        starting_region: "entry_hall",
        regions: {},
        routes: [],
      },
    };
    render(<MapOverlay mapData={roomGraph} onClose={() => {}} />);
    expect(screen.queryByTestId("map-region-graph")).not.toBeInTheDocument();
  });
});
