/**
 * Story 100-10 (Phase 3, RED) — shared <CartographyMap> component contract.
 *
 * ONE map renderer shared by the reference Map section AND the in-game
 * MapOverlay's RegionNodeGraph. It is a SELF-CONTAINED component: it takes
 * cartography + optional runtime overlay signals and draws the deterministic
 * d3-dag node-link graph. It must NOT reach for any session / WebSocket / game
 * state (C2 — it renders on the session-free reference route too), and it must
 * be DRILL-AWARE-READY for epic-98 / ADR-141 story 98-3: an `activeNodeId` prop
 * + an `onNodeSelect` callback, with no assumption that MapWidget's feed/toggle
 * is permanent.
 *
 * Pinned props (Dev implements in `../CartographyMap.tsx`):
 *
 *   interface CartographyMapProps {
 *     cartography: CartographyMetadata;
 *     activeNodeId?: string;            // "you are here" / drill-selected node
 *     visitedNodeIds?: Set<string>;     // runtime overlay (reference page omits)
 *     onNodeSelect?: (regionId: string) => void;  // drill-down hook for 98-3
 *   }
 *
 * Pinned DOM contract (REUSED from the existing RegionNodeGraph so the in-game
 * MapOverlay regression tests keep passing once it adopts this component):
 *   - testid `map-region-graph`     — the SVG root
 *   - testid `map-region-node-{id}` — one per region, with data-region-id={id}
 *   - testid `map-region-edge-{a}--{b}` — one per de-duplicated adjacency
 *   - data-current="true"  on the activeNodeId node
 *   - data-visited="true"  on visited nodes
 *   - node labels paint a stroke halo (paint-order="stroke")
 *
 * RED reason: `../CartographyMap` does not exist yet → import fails → every test
 * in this file fails (correct RED).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { CartographyMetadata } from "@/components/MapOverlay";
import { CartographyMap } from "../CartographyMap";

const CART: CartographyMetadata = {
  navigation_mode: "region",
  starting_region: "eldergrove",
  regions: {
    eldergrove: {
      name: "Eldergrove",
      description: "Ancient forest",
      adjacent: ["shadowlands"],
    },
    shadowlands: {
      name: "Shadowlands",
      description: "Dark lands",
      adjacent: ["eldergrove"],
    },
  },
  routes: [],
};

describe("CartographyMap — graph rendering", () => {
  it("renders the region graph SVG root", () => {
    render(<CartographyMap cartography={CART} />);
    expect(screen.getByTestId("map-region-graph")).toBeInTheDocument();
  });

  it("renders exactly one node per region", () => {
    render(<CartographyMap cartography={CART} />);
    expect(screen.getByTestId("map-region-node-eldergrove")).toBeInTheDocument();
    expect(screen.getByTestId("map-region-node-shadowlands")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^map-region-node-/)).toHaveLength(2);
  });

  it("renders one edge per de-duplicated reciprocal adjacency", () => {
    render(<CartographyMap cartography={CART} />);
    const edges = screen.getAllByTestId(/^map-region-edge-/);
    expect(edges).toHaveLength(1);
    expect(
      screen.getByTestId("map-region-edge-eldergrove--shadowlands")
    ).toBeInTheDocument();
  });

  it("paints a stroke halo behind node labels so edges don't cut through text", () => {
    const { container } = render(<CartographyMap cartography={CART} />);
    const graph = container.querySelector('[data-testid="map-region-graph"]');
    const labels = graph?.querySelectorAll("text") ?? [];
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label) => {
      expect(label.getAttribute("paint-order")).toBe("stroke");
    });
  });
});

describe("CartographyMap — runtime overlay signals", () => {
  it("marks the active node ('you are here') with data-current", () => {
    render(<CartographyMap cartography={CART} activeNodeId="shadowlands" />);
    expect(screen.getByTestId("map-region-node-shadowlands")).toHaveAttribute(
      "data-current",
      "true"
    );
    expect(
      screen.getByTestId("map-region-node-eldergrove")
    ).not.toHaveAttribute("data-current", "true");
  });

  it("marks visited nodes with data-visited and leaves the rest base-layer", () => {
    render(
      <CartographyMap
        cartography={CART}
        visitedNodeIds={new Set(["eldergrove"])}
      />
    );
    expect(screen.getByTestId("map-region-node-eldergrove")).toHaveAttribute(
      "data-visited",
      "true"
    );
    expect(
      screen.getByTestId("map-region-node-shadowlands")
    ).not.toHaveAttribute("data-visited", "true");
  });

  it("renders with no overlay props at all (reference-page context)", () => {
    // The session-free reference Map section passes only `cartography`. No
    // activeNodeId / visited / callback — must still draw the full graph.
    render(<CartographyMap cartography={CART} />);
    expect(screen.getByTestId("map-region-graph")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^map-region-node-/)).toHaveLength(2);
  });
});

describe("CartographyMap — drill-aware-ready (epic-98 / ADR-141 98-3)", () => {
  it("fires onNodeSelect with the region id when a node is clicked", () => {
    const onNodeSelect = vi.fn();
    render(<CartographyMap cartography={CART} onNodeSelect={onNodeSelect} />);
    fireEvent.click(screen.getByTestId("map-region-node-shadowlands"));
    expect(onNodeSelect).toHaveBeenCalledTimes(1);
    expect(onNodeSelect).toHaveBeenCalledWith("shadowlands");
  });

  it("does not throw when a node is clicked without an onNodeSelect callback", () => {
    render(<CartographyMap cartography={CART} />);
    expect(() =>
      fireEvent.click(screen.getByTestId("map-region-node-eldergrove"))
    ).not.toThrow();
  });
});

describe("CartographyMap — self-contained (C2, no session)", () => {
  it("renders bare with no provider/session context in scope", () => {
    // No GameStateProvider / WebSocket / ThemeProvider wrapper here. If the
    // component reaches for game state this render throws.
    expect(() => render(<CartographyMap cartography={CART} />)).not.toThrow();
    expect(screen.getByTestId("map-region-graph")).toBeInTheDocument();
  });

  it("produces no NaN coordinate attributes", () => {
    const { container } = render(<CartographyMap cartography={CART} />);
    const nan = container.querySelectorAll(
      '[x="NaN"], [y="NaN"], [cx="NaN"], [cy="NaN"], [x1="NaN"], [y1="NaN"], [x2="NaN"], [y2="NaN"]'
    );
    expect(nan).toHaveLength(0);
  });
});
