/**
 * Shared, deterministic cartography layout engine (Story 100-10, Phase 3).
 *
 * This is the SINGLE layout source for the region adjacency graph, consumed by
 * BOTH the reference Map section and the in-game `MapOverlay` `RegionNodeGraph`
 * (via `<CartographyMap>`). It replaces the hand-kept verbatim TS port of the
 * Python renderer (`src/lib/cartographyLayout.ts` ↔ `reference_map.py`), ending
 * that split-brain: there is now one client-side layout, deterministic and
 * key-order-independent (C4).
 *
 * The prettier layout uses **d3-dag** (Sugiyama layered layout) for node
 * positions. Unlike the old BFS-column math, exact pixel coordinates are an
 * implementation detail — only TOPOLOGY (node set, sorted-endpoint edge set,
 * dangling drops) and DETERMINISM are contractual.
 *
 * Determinism (C4): cartography is an UNDIRECTED adjacency graph that may
 * contain cycles, but Sugiyama needs a DAG. We direct every de-duplicated edge
 * from its lexicographically smaller endpoint to its larger one — a strict
 * total order on region ids, so the directed graph is guaranteed acyclic. Nodes
 * and edges are fed to d3-dag in sorted order, so the same cartography always
 * yields byte-identical output regardless of region key insertion order.
 *
 * Topology model (per the 2026-06-08 spec edge cross-ref): `regions[].adjacent`
 * is the ONLY layout input. `routes` are mechanics annotations and never
 * introduce a graph edge. An adjacency to an unknown region is dropped and
 * reported as dangling.
 */

import { graph, sugiyama } from "d3-dag";

import type { CartographyMetadata } from "@/components/MapOverlay";
import type { MapPin } from "@/types/reference";

/** Half-radius of a rendered region node (px), exported for the component. */
export const NODE_R = 10;

// d3-dag node box (px). Generous horizontal spacing leaves room for the
// right-hand text labels; vertical spacing keeps sibling regions legible.
const NODE_W = 200;
const NODE_H = 90;
// Outer padding around the laid-out graph; the right pad also gives the
// far-column labels room before the viewBox edge.
const MARGIN = 32;
const LABEL_PAD = 140;

export interface DagLayoutNode {
  /** Region id (the key into `cartography.regions`). */
  id: string;
  /** Display name from the region entry (falls back to the id). */
  name: string;
  /** Pixel x of the node centre in the SVG coordinate space. */
  x: number;
  /** Pixel y of the node centre in the SVG coordinate space. */
  y: number;
  /** NPC portrait pins on this region (Story 104-3 / M-C). Empty when none. */
  pins: MapPin[];
}

export interface DagLayoutEdge {
  /** Sorted-first endpoint region id (a <= b). */
  a: string;
  /** Sorted-second endpoint region id. */
  b: string;
}

export interface CartographyDagLayout {
  nodes: DagLayoutNode[];
  edges: DagLayoutEdge[];
  /** Adjacencies pointing at a region not present in `regions` (dropped). */
  dangling: { source: string; missing: string }[];
  /** Overall SVG viewBox width. */
  width: number;
  /** Overall SVG viewBox height. */
  height: number;
}

/**
 * De-duplicated, sorted-endpoint edges + dangling refs from `adjacent` only.
 *
 * An adjacency to a region id not in `regions` is dropped and reported as
 * dangling. Reciprocal adjacency (A lists B and B lists A) collapses to one
 * edge via a sorted-endpoint key. Region ids are iterated in sorted order so
 * the output is independent of key insertion order.
 */
function edgesAndDangling(cart: CartographyMetadata): {
  edges: DagLayoutEdge[];
  dangling: { source: string; missing: string }[];
} {
  const regions = cart.regions ?? {};
  const edgeSet = new Set<string>();
  const dangling: { source: string; missing: string }[] = [];
  for (const rid of Object.keys(regions).sort()) {
    for (const nb of regions[rid]?.adjacent ?? []) {
      if (!Object.prototype.hasOwnProperty.call(regions, nb)) {
        dangling.push({ source: rid, missing: nb });
        continue;
      }
      const [a, b] = [rid, nb].sort();
      edgeSet.add(`${a} ${b}`);
    }
  }
  const edges: DagLayoutEdge[] = [...edgeSet].sort().map((key) => {
    const [a, b] = key.split(" ");
    return { a, b };
  });
  return { edges, dangling };
}

/**
 * Compute the full deterministic layout (nodes with d3-dag positions, edges,
 * viewBox). Topology is derived purely from `adjacent`; positions come from a
 * Sugiyama layered layout over the acyclic-directed edge set.
 */
export function computeCartographyDagLayout(
  cart: CartographyMetadata
): CartographyDagLayout {
  const regions = cart.regions ?? {};
  const ids = Object.keys(regions).sort();
  const { edges, dangling } = edgesAndDangling(cart);

  // Build the d3-dag graph. Add every region as a node (in sorted order) so
  // isolated regions still lay out; direct each edge a -> b (a < b) to keep the
  // directed graph acyclic. Self-adjacency (a === b) is skipped — it cannot be
  // a layered edge and would introduce a cycle.
  const g = graph<DagLayoutNode, undefined>();
  const byId = new Map<string, ReturnType<typeof g.node>>();
  for (const id of ids) {
    byId.set(
      id,
      g.node({ id, name: regions[id]?.name ?? id, x: 0, y: 0, pins: regions[id]?.pins ?? [] }),
    );
  }
  for (const { a, b } of edges) {
    if (a === b) continue;
    const na = byId.get(a);
    const nb = byId.get(b);
    if (na && nb) na.child(nb);
  }

  let width = MARGIN * 2 + LABEL_PAD;
  let height = MARGIN * 2;
  if (ids.length > 0) {
    const layout = sugiyama().nodeSize([NODE_W, NODE_H]);
    const { width: lw, height: lh } = layout(g);
    width = lw + MARGIN * 2 + LABEL_PAD;
    height = lh + MARGIN * 2;
  }

  const nodes: DagLayoutNode[] = ids.map((id) => {
    const gn = byId.get(id)!;
    return {
      id,
      name: regions[id]?.name ?? id,
      x: MARGIN + (gn.x ?? 0),
      y: MARGIN + (gn.y ?? 0),
      pins: regions[id]?.pins ?? [],
    };
  });

  return { nodes, edges, dangling, width, height };
}
