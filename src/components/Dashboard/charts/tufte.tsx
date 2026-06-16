// Shared Tufte chart primitives — mirrors the spark()/svg() helpers from the
// SideQuest Inspector design handoff. Plain SVG, no chartjunk: hairline
// range-frame axes, no gridlines, no fills behind the data.
import { THEME, SERIF } from "../shared/constants";

/** Section title color — slightly brighter than `muted`, per the design. */
const SECTION = "#9a988f";

/**
 * Serif small-caps section title over a hairline rule. The structural unit
 * that replaces card chrome in the redesigned tabs. `right` renders an
 * optional baseline-aligned element on the far side (e.g. a bottleneck note).
 */
export function SectionTitle({
  children,
  right,
  marginBottom = 6,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  marginBottom?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: right ? "space-between" : "flex-start",
        paddingBottom: 5,
        marginBottom,
        borderBottom: `1px solid ${THEME.rule}`,
      }}
    >
      <span
        style={{
          fontFamily: SERIF,
          fontVariant: "small-caps",
          letterSpacing: "0.1em",
          color: SECTION,
          fontSize: 13,
        }}
      >
        {children}
      </span>
      {right}
    </div>
  );
}

/**
 * Word-sized inline sparkline (Tufte). A bare polyline with a dot on the last
 * point. Returns null for <2 values so callers can drop it inline.
 */
export function Sparkline({
  values,
  color = THEME.muted,
  width = 66,
  height = 16,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rg = mx - mn || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (width - 2) + 1,
    height - 2 - ((v - mn) / rg) * (height - 4),
  ]);
  const d = "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
  const last = pts[pts.length - 1];
  return (
    <svg
      width={width}
      height={height}
      style={{ display: "inline-block", verticalAlign: "middle", overflow: "visible" }}
    >
      <path d={d} fill="none" stroke={color} strokeWidth={1} />
      <circle cx={last[0]} cy={last[1]} r={1.6} fill={color} />
    </svg>
  );
}

/** Responsive chart <svg> — fixed viewBox, fluid width, height auto. */
export function ChartSvg({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: "block", height: "auto", overflow: "visible" }}
    >
      {children}
    </svg>
  );
}
