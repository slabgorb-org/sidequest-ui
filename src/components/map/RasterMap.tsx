import { useRef, useState, useCallback } from "react";
import type { MapState, RasterTreatment } from "@/components/MapOverlay";

/**
 * RasterMap — genre-true main-map treatment renderer (Story 163-5,
 * spec §4 A1). Renders the world's public-domain scan (Glenross OS-sheet,
 * Années Folles Baedeker, the_circuit highway map) as an <img> with an SVG
 * overlay: one pin per anchored region, the party's current region marked,
 * route lines between anchored endpoints. Pan/zoom is an imperative
 * translate/scale on a wrapping transform (mechanism lifted from
 * OrbitalChartView): wheel zoom clamped [0.25, 8], drag-pan via client-XY
 * deltas.
 *
 * Image load failure is an EXPLICIT error state (spec §5, No Silent
 * Fallbacks) — never a dag/generated fallback render.
 *
 * Style branches key off `treatment.style_hints` (Track B touchpoint):
 * `routes: "highway_tracing"` draws emphasized dashed route tracings,
 * `faction_layer: "wasteland_defacement"` flags pins for defacement
 * styling. Data-driven — never keyed off genre strings.
 */
export interface RasterMapProps {
  treatment: RasterTreatment;
  mapData: MapState;
  onNodeSelect?: (regionId: string) => void;
}

const PIN_R = 7;
const SCALE_MIN = 0.25;
const SCALE_MAX = 8;

export function RasterMap({ treatment, mapData, onNodeSelect }: RasterMapProps) {
  const vpRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const apply = useCallback((s: number, p: { x: number; y: number }) => {
    const vp = vpRef.current;
    if (vp) vp.style.transform = `translate(${p.x}px, ${p.y}px) scale(${s})`;
  }, []);

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const next = Math.max(
      SCALE_MIN,
      Math.min(SCALE_MAX, scale * (e.deltaY < 0 ? 1.1 : 0.9))
    );
    setScale(next);
    apply(next, panRef.current);
  }
  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    dragRef.current = {
      startX: e.clientX - panRef.current.x,
      startY: e.clientY - panRef.current.y,
    };
    setDragging(true);
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    panRef.current = {
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    };
    apply(scale, panRef.current);
  }
  function onMouseUp() {
    dragRef.current = null;
    setDragging(false);
  }

  if (imgFailed) {
    return (
      <div
        data-testid="map-panel-raster-error"
        className="flex items-center justify-center h-full text-sm p-4 text-muted-foreground/60"
      >
        Map scan unavailable. Check the R2 upload for this world's map image.
      </div>
    );
  }

  const anchors = treatment.node_anchors ?? {};
  const routeTracing = treatment.style_hints?.routes === "highway_tracing";
  const defaced =
    treatment.style_hints?.faction_layer === "wasteland_defacement";
  const routes = mapData.cartography?.routes ?? [];

  return (
    <div
      data-testid="map-panel-raster"
      className="relative overflow-hidden w-full h-full bg-[var(--surface)]"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ cursor: dragging ? "grabbing" : "grab" }}
    >
      <div
        ref={vpRef}
        style={{ transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}
      >
        <img
          data-testid="raster-scan"
          src={treatment.image_url ?? ""}
          alt="World map"
          className="block max-w-none select-none"
          draggable={false}
          onError={() => setImgFailed(true)}
        />
        <svg
          className="absolute top-0 left-0 overflow-visible"
          aria-label="Map overlay"
        >
          {routes.map((rt) => {
            const a = rt.from_id ? anchors[rt.from_id] : undefined;
            const b = rt.to_id ? anchors[rt.to_id] : undefined;
            if (!a || !b) return null;
            return (
              <line
                key={`${rt.from_id}-${rt.to_id}-${rt.name}`}
                data-route-tracing={routeTracing ? "true" : "false"}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="var(--accent)"
                strokeWidth={routeTracing ? 3 : 1.5}
                strokeDasharray={routeTracing ? "6 3" : undefined}
              />
            );
          })}
          {Object.entries(anchors).map(([regionId, [x, y]]) => {
            const isCurrent = regionId === mapData.current_location;
            return (
              <g
                key={regionId}
                data-region-id={regionId}
                data-current={isCurrent ? "true" : undefined}
                data-defaced={defaced ? "true" : undefined}
                onClick={() => onNodeSelect?.(regionId)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={PIN_R}
                  fill={isCurrent ? "var(--accent)" : "var(--surface-2)"}
                  stroke="var(--text)"
                  strokeWidth={isCurrent ? 3 : 1.5}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
