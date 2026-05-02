import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { OrbitalIntent } from "@/types/orbital-intent";

interface OrbitalChartViewProps {
  svg: string;
  scopeCenter: string;
  onIntent: (intent: OrbitalIntent) => void;
}

/**
 * Thin SVG host. Mounts server-rendered SVG, listens at root for clicks,
 * routes data-action and data-body-id attributes to intent messages.
 * Pan/zoom is pure CSS transform on the container.
 *
 * Per spec §6.4: pan/zoom is client-only and never round-trips. Only
 * scope changes (drill_in / drill_out) trigger server requests.
 */
export function OrbitalChartView({
  svg,
  scopeCenter,
  onIntent,
}: OrbitalChartViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Inject SVG markup directly. Server is the only producer; sanitization
  // happens server-side via svgwrite. Per project policy, server output is
  // trusted; UI does not parse or modify SVG content.
  useEffect(() => {
    if (hostRef.current) {
      hostRef.current.innerHTML = svg;
    }
  }, [svg]);

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
    setScale((s) =>
      Math.max(0.25, Math.min(8, s * (e.deltaY < 0 ? 1.1 : 0.9)))
    );
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setIsDragging(true);
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setPan({
      x: e.clientX - dragRef.current.x,
      y: e.clientY - dragRef.current.y,
    });
  }
  function onMouseUp() {
    dragRef.current = null;
    setIsDragging(false);
  }

  function onReset() {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
      data-testid="orbital-chart-container"
      data-scope-center={scopeCenter}
    >
      <button
        onClick={onReset}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          zIndex: 1,
          background: "transparent",
          color: "yellow",
          border: "1px solid yellow",
          fontFamily: "monospace",
          fontSize: 10,
          padding: "2px 6px",
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
          width: "100%",
          height: "100%",
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "center",
          cursor: isDragging ? "grabbing" : "grab",
        }}
      />
    </div>
  );
}
