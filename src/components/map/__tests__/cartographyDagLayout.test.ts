/**
 * Story 100-10 (Phase 3, RED) — shared d3-dag cartography layout module.
 *
 * This is the determinism contract (C4) for the SHARED layout engine that
 * replaces `src/lib/cartographyLayout.ts`. The Python byte-identical contract
 * (`reference_map.py`) is retired at cutover; what remains is a self-consistent,
 * client-side deterministic Sugiyama (d3-dag) layout shared by BOTH the
 * reference Map section and the in-game `MapOverlay` `RegionNodeGraph`.
 *
 * Pinned contract (Dev implements in `../cartographyDagLayout.ts`):
 *
 *   export function computeCartographyDagLayout(
 *     cart: CartographyMetadata
 *   ): CartographyDagLayout
 *
 *   interface CartographyDagLayout {
 *     nodes: { id: string; name: string; x: number; y: number }[];
 *     edges: { a: string; b: string }[];   // sorted endpoints, de-duplicated
 *     dangling: { source: string; missing: string }[];
 *     width: number;
 *     height: number;
 *   }
 *
 * Deliberately NOT pinned: exact pixel coordinates / width / height (those are
 * d3-dag Sugiyama outputs, not the old BFS-column numbers). Only TOPOLOGY
 * (node id set/order, sorted-endpoint edge set, dangling drops) and DETERMINISM
 * are pinned — the prettier layout is free to move the dots, but never
 * non-deterministically.
 *
 * RED reason: `../cartographyDagLayout` does not exist yet (and `d3-dag` is not
 * installed). Import resolution fails → every test in this file fails.
 */

import { describe, it, expect } from "vitest";
import type { CartographyMetadata } from "@/components/MapOverlay";
import { computeCartographyDagLayout } from "../cartographyDagLayout";

/**
 * Diamond graph: start → {b, c} → d. Region keys are intentionally NOT in BFS
 * order to prove the layout is independent of key insertion order (C4).
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

/** Project a layout down to its topology (the part the contract pins). */
function topology(layout: ReturnType<typeof computeCartographyDagLayout>) {
  return {
    nodeIds: layout.nodes.map((n) => n.id),
    nodeNames: layout.nodes.map((n) => n.name),
    edges: layout.edges.map((e) => `${e.a}--${e.b}`).sort(),
    dangling: [...layout.dangling]
      .map((d) => `${d.source}->${d.missing}`)
      .sort(),
  };
}

describe("computeCartographyDagLayout — node set", () => {
  it("emits exactly one node per region", () => {
    const layout = computeCartographyDagLayout(DIAMOND);
    expect(layout.nodes.map((n) => n.id).sort()).toEqual([
      "b",
      "c",
      "d",
      "start",
    ]);
  });

  it("carries the region display name on each node", () => {
    const layout = computeCartographyDagLayout(DIAMOND);
    const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n.name]));
    expect(byId.start).toBe("Start");
    expect(byId.b).toBe("Bravo");
    expect(byId.c).toBe("Charlie");
    expect(byId.d).toBe("Delta");
  });

  it("gives every node finite numeric coordinates (no NaN dots)", () => {
    const layout = computeCartographyDagLayout(DIAMOND);
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("reports a finite positive viewBox size", () => {
    const layout = computeCartographyDagLayout(DIAMOND);
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(Number.isFinite(layout.height)).toBe(true);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

describe("computeCartographyDagLayout — edges", () => {
  it("de-duplicates reciprocal adjacency into one sorted-endpoint edge", () => {
    const { edges } = computeCartographyDagLayout(DIAMOND);
    // start↔b, start↔c, b↔d, c↔d — reciprocal pairs collapse, endpoints sorted.
    expect(edges.map((e) => `${e.a}--${e.b}`).sort()).toEqual([
      "b--d",
      "b--start",
      "c--d",
      "c--start",
    ]);
  });

  it("emits each edge with lexicographically sorted endpoints (a <= b)", () => {
    const { edges } = computeCartographyDagLayout(DIAMOND);
    for (const e of edges) {
      expect(e.a <= e.b).toBe(true);
    }
  });

  it("drops an adjacency to an unknown region and reports it dangling", () => {
    const cart: CartographyMetadata = {
      navigation_mode: "region",
      starting_region: "start",
      regions: {
        start: { name: "Start", adjacent: ["ghost"] },
      },
      routes: [],
    };
    const { edges, dangling } = computeCartographyDagLayout(cart);
    expect(edges).toEqual([]);
    expect(dangling).toEqual([{ source: "start", missing: "ghost" }]);
  });

  it("treats only `adjacent` as layout topology — `routes` membership is NOT an edge", () => {
    // Spec edge-shape cross-ref (2026-06-08): `adjacent` is connectivity (the
    // ONLY layout input); `routes` are mechanics annotations. A `routes` entry
    // must never introduce a graph edge, and an `adjacent` pair with no matching
    // `routes` entry is still a real navigable edge.
    const cart: CartographyMetadata = {
      navigation_mode: "region",
      starting_region: "alpha",
      regions: {
        alpha: { name: "Alpha", adjacent: ["beta"] },
        beta: { name: "Beta", adjacent: ["alpha"] },
        gamma: { name: "Gamma", adjacent: [] },
      },
      // A route referencing gamma must NOT manufacture an alpha/beta→gamma edge.
      routes: [
        { name: "Smuggler Run", from_id: "beta", to_id: "gamma" },
      ],
    };
    const { edges } = computeCartographyDagLayout(cart);
    expect(edges.map((e) => `${e.a}--${e.b}`).sort()).toEqual(["alpha--beta"]);
  });
});

describe("computeCartographyDagLayout — determinism (C4)", () => {
  it("yields identical output across repeated runs (no per-load jiggle)", () => {
    const a = computeCartographyDagLayout(DIAMOND);
    const b = computeCartographyDagLayout(DIAMOND);
    expect(a).toEqual(b);
  });

  it("is independent of region key insertion order (topology byte-stable)", () => {
    const reordered: CartographyMetadata = {
      ...DIAMOND,
      regions: {
        b: DIAMOND.regions.b,
        start: DIAMOND.regions.start,
        d: DIAMOND.regions.d,
        c: DIAMOND.regions.c,
      },
    };
    // Full layout (including the d3-dag coordinates) must be identical, not just
    // the topology — C4 requires "identical output ... independent of region key
    // order", which means the module sorts its inputs before laying out.
    expect(computeCartographyDagLayout(reordered)).toEqual(
      computeCartographyDagLayout(DIAMOND)
    );
  });

  it("preserves topology under key reorder even if coordinates were to differ", () => {
    // Defense-in-depth: even read purely as topology, reorder must be a no-op.
    const reordered: CartographyMetadata = {
      ...DIAMOND,
      regions: {
        c: DIAMOND.regions.c,
        d: DIAMOND.regions.d,
        b: DIAMOND.regions.b,
        start: DIAMOND.regions.start,
      },
    };
    expect(topology(computeCartographyDagLayout(reordered))).toEqual(
      topology(computeCartographyDagLayout(DIAMOND))
    );
  });
});
