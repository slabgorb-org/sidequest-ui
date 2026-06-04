/**
 * Unit tests for the deterministic cartography node-graph layout.
 *
 * These pin the TS port of `reference_map.py` (_layout_order / _positions /
 * _edges_and_dangling) so the in-game Map tab graph stays topologically
 * identical to the lore reference page: BFS order seeded at starting_region,
 * neighbours in sorted-id order, depth-layered positions, de-duplicated
 * sorted-endpoint edges, dangling adjacencies dropped.
 */

import { describe, it, expect } from "vitest";
import type { CartographyMetadata } from "@/components/MapOverlay";
import {
  computeCartographyLayout,
  edgesAndDangling,
  layoutOrder,
  positions,
  MARGIN,
  COL_W,
  ROW_H,
} from "../cartographyLayout";

/**
 * A diamond graph: start → {b, c} → d. Region keys are intentionally NOT in
 * BFS order to prove the layout is independent of key insertion order.
 */
const DIAMOND: CartographyMetadata = {
  navigation_mode: "region",
  starting_region: "start",
  regions: {
    d: { name: "Delta", adjacent: ["b", "c"] },
    c: { name: "Charlie", adjacent: ["start", "d"] },
    b: { name: "Bravo", adjacent: ["start", "d"] },
    start: { name: "Start", adjacent: ["c", "b"] },
  },
  routes: [],
};

describe("layoutOrder", () => {
  it("BFS-walks from starting_region with neighbours in sorted-id order", () => {
    const { order, depth } = layoutOrder(DIAMOND);
    // start (depth 0) → b, c (depth 1, sorted) → d (depth 2)
    expect(order).toEqual(["start", "b", "c", "d"]);
    expect(depth).toEqual({ start: 0, b: 1, c: 1, d: 2 });
  });

  it("appends regions unreachable from start in sorted-id order at depth 0", () => {
    const cart: CartographyMetadata = {
      navigation_mode: "region",
      starting_region: "start",
      regions: {
        start: { name: "Start", adjacent: [] },
        zeta: { name: "Zeta", adjacent: [] },
        alpha: { name: "Alpha", adjacent: [] },
      },
      routes: [],
    };
    const { order, depth } = layoutOrder(cart);
    expect(order).toEqual(["start", "alpha", "zeta"]);
    expect(depth).toEqual({ start: 0, alpha: 0, zeta: 0 });
  });

  it("falls back to all regions in sorted order when starting_region is invalid", () => {
    const cart: CartographyMetadata = {
      navigation_mode: "region",
      starting_region: "nonexistent",
      regions: {
        gamma: { name: "Gamma", adjacent: [] },
        beta: { name: "Beta", adjacent: [] },
      },
      routes: [],
    };
    const { order } = layoutOrder(cart);
    expect(order).toEqual(["beta", "gamma"]);
  });
});

describe("positions", () => {
  it("places nodes at depth columns and per-layer rows", () => {
    const { order, depth } = layoutOrder(DIAMOND);
    const pos = positions(order, depth);
    expect(pos.start).toEqual({ x: MARGIN, y: MARGIN });
    expect(pos.b).toEqual({ x: MARGIN + COL_W, y: MARGIN }); // depth 1, row 0
    expect(pos.c).toEqual({ x: MARGIN + COL_W, y: MARGIN + ROW_H }); // depth 1, row 1
    expect(pos.d).toEqual({ x: MARGIN + 2 * COL_W, y: MARGIN }); // depth 2, row 0
  });
});

describe("edgesAndDangling", () => {
  it("de-duplicates reciprocal adjacency into one sorted-endpoint edge", () => {
    const { edges } = edgesAndDangling(DIAMOND);
    // start↔b, start↔c, b↔d, c↔d — reciprocal pairs collapse, sorted overall
    expect(edges).toEqual([
      { a: "b", b: "d" },
      { a: "b", b: "start" },
      { a: "c", b: "d" },
      { a: "c", b: "start" },
    ]);
  });

  it("drops adjacencies pointing at a missing region and reports them dangling", () => {
    const cart: CartographyMetadata = {
      navigation_mode: "region",
      starting_region: "start",
      regions: {
        start: { name: "Start", adjacent: ["ghost"] },
      },
      routes: [],
    };
    const { edges, dangling } = edgesAndDangling(cart);
    expect(edges).toEqual([]);
    expect(dangling).toEqual([{ source: "start", missing: "ghost" }]);
  });
});

describe("computeCartographyLayout", () => {
  it("produces deterministic nodes with names and positions", () => {
    const layout = computeCartographyLayout(DIAMOND);
    expect(layout.nodes.map((n) => n.id)).toEqual(["start", "b", "c", "d"]);
    expect(layout.nodes.map((n) => n.name)).toEqual([
      "Start",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
    const start = layout.nodes.find((n) => n.id === "start")!;
    expect(start.x).toBe(MARGIN);
    expect(start.y).toBe(MARGIN);
  });

  it("is independent of region key order (byte-stable topology)", () => {
    const reordered: CartographyMetadata = {
      ...DIAMOND,
      regions: {
        b: DIAMOND.regions.b,
        start: DIAMOND.regions.start,
        d: DIAMOND.regions.d,
        c: DIAMOND.regions.c,
      },
    };
    expect(computeCartographyLayout(reordered)).toEqual(
      computeCartographyLayout(DIAMOND)
    );
  });

  it("sizes the viewBox to span the deepest column and widest layer", () => {
    const layout = computeCartographyLayout(DIAMOND);
    // maxDepth 2, maxRows 2 (depth-1 layer has b + c)
    expect(layout.width).toBeGreaterThan(2 * COL_W);
    expect(layout.height).toBeGreaterThan(ROW_H);
  });
});
