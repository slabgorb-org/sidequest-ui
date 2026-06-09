/**
 * Shared cartography map renderer (Story 100-10, Phase 3).
 *
 * ONE node-link graph component, drawn from the deterministic d3-dag layout
 * (`computeCartographyDagLayout`) and consumed by BOTH surfaces:
 *   - the session-free reference Map section (cartography only), and
 *   - the in-game `MapOverlay` `RegionNodeGraph` (cartography + runtime overlay).
 *
 * It is SELF-CONTAINED (C2): it never reaches for session / WebSocket / game
 * state, so it renders identically on the session-free reference route. It is
 * DRILL-AWARE-READY for epic-98 / ADR-141 story 98-3 via `activeNodeId` +
 * `onNodeSelect`, without assuming MapWidget's current feed/toggle is permanent.
 *
 * Edges paint first, then nodes paint over them. Labels carry a stroke halo
 * (`paint-order="stroke"`) so edges don't cut through the text.
 */

import {
  computeCartographyDagLayout,
  NODE_R,
} from "@/components/map/cartographyDagLayout";
import type { CartographyMetadata } from "@/components/MapOverlay";

export interface CartographyMapProps {
  /** The region adjacency graph to draw. */
  cartography: CartographyMetadata;
  /** Region id the player currently occupies ("you are here"), or undefined. */
  activeNodeId?: string;
  /** Region ids to mark visited (runtime overlay; reference page omits). */
  visitedNodeIds?: Set<string>;
  /** Drill-down hook (epic-98 / 98-3): fired with the clicked region id. */
  onNodeSelect?: (regionId: string) => void;
}

/**
 * The cartography region adjacency graph as a deterministic SVG node-link
 * diagram. Layout topology + positions come from the shared d3-dag layout
 * module, so the same `cartography` yields the same graph on every surface.
 */
export function CartographyMap({
  cartography,
  activeNodeId,
  visitedNodeIds,
  onNodeSelect,
}: CartographyMapProps) {
  const layout = computeCartographyDagLayout(cartography);
  const labelDx = NODE_R + 6;
  const visited = visitedNodeIds ?? new Set<string>();

  // Render at natural pixel size inside a scroll container rather than scaling a
  // long depth-chain into a fixed box; `overflow-auto` lets the player scroll to
  // the far edges and keeps labels readable at any chain length.
  return (
    <div className="overflow-auto max-h-80 bg-[var(--surface)] rounded">
      <svg
        data-testid="map-region-graph"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        className="block max-w-none"
        role="img"
        aria-label="World region map"
      >
        <g>
          {layout.edges.map(({ a, b }) => {
            const na = layout.nodes.find((n) => n.id === a);
            const nb = layout.nodes.find((n) => n.id === b);
            if (!na || !nb) return null;
            return (
              <line
                key={`${a}--${b}`}
                data-testid={`map-region-edge-${a}--${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke="var(--accent, #888)"
                strokeWidth={2}
                strokeOpacity={0.5}
              />
            );
          })}
        </g>
        <g>
          {layout.nodes.map((node) => {
            const isCurrent = node.id === activeNodeId;
            const isVisited = visited.has(node.id);
            return (
              <g
                key={node.id}
                data-testid={`map-region-node-${node.id}`}
                data-region-id={node.id}
                data-current={isCurrent ? "true" : undefined}
                data-visited={isVisited ? "true" : undefined}
                onClick={onNodeSelect ? () => onNodeSelect(node.id) : undefined}
                style={onNodeSelect ? { cursor: "pointer" } : undefined}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isCurrent ? NODE_R + 3 : NODE_R}
                  fill={
                    isCurrent
                      ? "var(--accent, gold)"
                      : isVisited
                        ? "var(--primary, #ccc)"
                        : "var(--surface, #333)"
                  }
                  stroke="var(--primary, #ccc)"
                  strokeWidth={isCurrent ? 2.5 : 1.5}
                  fillOpacity={isCurrent || isVisited ? 1 : 0.4}
                />
                <text
                  x={node.x + labelDx}
                  y={node.y + 4}
                  fontSize={13}
                  fill="var(--primary, white)"
                  fillOpacity={isVisited ? 1 : 0.55}
                  paintOrder="stroke"
                  stroke="var(--surface, #1a1a1a)"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeOpacity={isVisited ? 0.9 : 0.6}
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
