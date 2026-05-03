import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type {
  ConjunctionEventPayload,
  OrbitalIntent,
} from "@/types/orbital-intent";
import { HudBottomStrip } from "./HudBottomStrip";
import { HudTopStrip } from "./HudTopStrip";

interface OrbitalChartViewProps {
  svg: string;
  scopeCenter: string;
  tHours: number;
  epochDays: number;
  nextConjunction: ConjunctionEventPayload | null;
  onIntent: (intent: OrbitalIntent) => void;
}

const BRASS = "#f5d020";

/**
 * Server-rendered SVG host with chart-as-calendar HUD overlays.
 *
 * Outer wrapper exists only to key the inner impl by `svg` — when the
 * server pushes a fresh render (e.g. drill_in changes scope), the impl
 * remounts with fresh state. Cleaner than reset-state-in-effect.
 */
export function OrbitalChartView(props: OrbitalChartViewProps) {
  return <OrbitalChartImpl {...props} key={props.svg} />;
}

/**
 * Stateful chart impl. Pan/zoom is imperative on the inner `<g id="viewport">`
 * group's transform attribute (spec §10) — this is what render.py wraps the
 * three SVG layers in. Doing it on the inner group instead of the outer host
 * div means SVG geometry scales but click targets stay hit-testable, and
 * lets us do scale-aware label sizing in a future pass.
 *
 * Click events bubble; we walk parent chain looking for data-action attrs
 * to fire ORBITAL_INTENT messages back to the server (drill_in:* / drill_out).
 */
function OrbitalChartImpl({
  svg,
  scopeCenter,
  tHours,
  epochDays,
  nextConjunction,
  onIntent,
}: OrbitalChartViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<SVGGElement | null>(null);
  const [scale, setScale] = useState(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Inject server SVG and capture the viewport-group ref. Runs once per
  // mount; outer wrapper keys this impl by svg so a new push remounts.
  useEffect(() => {
    if (!hostRef.current) return;
    hostRef.current.innerHTML = svg;
    viewportRef.current = hostRef.current.querySelector<SVGGElement>("#viewport");
  }, [svg]);

  const applyTransform = useCallback(
    (nextScale: number, nextPan: { x: number; y: number }) => {
      const vp = viewportRef.current;
      if (!vp) return;
      vp.setAttribute(
        "transform",
        `translate(${nextPan.x} ${nextPan.y}) scale(${nextScale})`
      );
    },
    []
  );

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    let el: HTMLElement | null = e.target as HTMLElement;
    while (el && el !== hostRef.current) {
      const action = el.getAttribute?.("data-action");
      if (action) {
        if (action.startsWith("drill_in:")) {
          const bodyId = action.slice("drill_in:".length);
          onIntent({ kind: "drill_in", body_id: bodyId });
          return;
        }
        if (action === "drill_out") {
          onIntent({ kind: "drill_out" });
          return;
        }
      }
      el = el.parentElement;
    }
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const next = Math.max(0.25, Math.min(8, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    setScale(next);
    applyTransform(next, panRef.current);
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    dragRef.current = {
      startX: e.clientX - panRef.current.x,
      startY: e.clientY - panRef.current.y,
    };
    setIsDragging(true);
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    panRef.current = {
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    };
    applyTransform(scale, panRef.current);
  }
  function onMouseUp() {
    dragRef.current = null;
    setIsDragging(false);
  }

  function onReset() {
    panRef.current = { x: 0, y: 0 };
    setScale(1);
    applyTransform(1, panRef.current);
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#000000",
      }}
      data-testid="orbital-chart-container"
      data-scope-center={scopeCenter}
    >
      {/* CSS for drillable cluster hover state. Spec §10 drill affordance. */}
      <style>{`
        [data-testid="orbital-chart-host"] g.drillable { cursor: pointer; }
        [data-testid="orbital-chart-host"] g.drillable:hover {
          filter: drop-shadow(0 0 3px ${BRASS});
        }
      `}</style>

      <HudTopStrip tHours={tHours} epochDays={epochDays} />

      <button
        onClick={onReset}
        style={{
          position: "absolute",
          top: 4,
          right: 6,
          zIndex: 3,
          background: "transparent",
          color: BRASS,
          border: `1px solid ${BRASS}`,
          fontFamily: "Orbitron, monospace",
          fontSize: 9,
          letterSpacing: 1,
          padding: "2px 8px",
          cursor: "pointer",
        }}
      >
        RESET
      </button>

      <div
        ref={hostRef}
        data-testid="orbital-chart-host"
        onClick={onClick}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{
          position: "absolute",
          top: 28,
          bottom: 36,
          left: 0,
          right: 0,
          cursor: isDragging ? "grabbing" : "grab",
        }}
      />

      <HudBottomStrip nextConjunction={nextConjunction} zoom={scale} />
    </div>
  );
}
