import type { TurnSpan } from "@/types/watcher";
import { SPAN_COLORS, THEME, MONO } from "../shared/constants";
import { ChartSvg } from "./tufte";

interface Props {
  spans: TurnSpan[];
  totalMs: number;
}

const W = 900;
const ROW_H = 24;
const LABEL_W = 132;
const DUR_W = 64;
const TOP = 6;
const AXIS_H = 22;
const INDENT = 14; // left inset per depth level — shows caller▸callee nesting
const CONTAINER_OPACITY = 0.34; // faded container (non-leaf) work
const LEAF_OPACITY = 0.82; // solid leaf work

// Span timeline for one turn. When the server emits dependency hierarchy
// (depth + leaf per span, 124-2) each row is left-inset by its depth so a
// caller's children nest beneath it, and container spans (leaf=false) are
// faded against solid leaf work (Tufte layering); the slowest LEAF stays
// outlined in accent. Older servers emit flat spans (no depth) — every span
// then renders at depth 0, reproducing the original one-row-per-span Gantt.
// The bar's right edge is always the true end time; only its left edge is
// inset, so durations stay honest. depth/leaf are read with `??`/`=== false`
// (never `||`) so a real depth-0 / leaf-false span is not defaulted away.
export function FlameChart({ spans, totalMs }: Props) {
  if (spans.length === 0) {
    return <div style={{ color: THEME.muted, fontSize: 12, fontStyle: "italic" }}>Select a turn to view spans</div>;
  }

  const maxTime = Math.max(totalMs, ...spans.map((s) => (s.start_ms || 0) + (s.duration_ms || 0))) || 1;
  const plotW = W - LABEL_W - DUR_W;
  const x = (v: number) => LABEL_W + (v / maxTime) * plotW;
  const H = TOP + spans.length * ROW_H + AXIS_H;

  // Critical span = longest LEAF (honest bottleneck). The turn-root container
  // is the whole turn, so it must never be flagged as the bottleneck.
  let critIdx = -1;
  let critDur = -1;
  spans.forEach((s, i) => {
    if (s.leaf !== false && (s.duration_ms || 0) > critDur) {
      critDur = s.duration_ms || 0;
      critIdx = i;
    }
  });

  const axisY = TOP + spans.length * ROW_H + 2;

  return (
    <ChartSvg width={W} height={H}>
      {spans.map((s, i) => {
        const isCrit = i === critIdx;
        const isContainer = s.leaf === false;
        const indent = (s.depth ?? 0) * INDENT;
        const by = TOP + i * ROW_H;
        const bx = x(s.start_ms || 0) + indent;
        const bEnd = x((s.start_ms || 0) + (s.duration_ms || 0));
        const bw = Math.max(2, bEnd - bx);
        const col = SPAN_COLORS[s.name] || SPAN_COLORS[s.component] || THEME.muted;
        return (
          <g key={`${s.name}-${i}`}>
            <text x={LABEL_W - 8} y={by + ROW_H / 2 + 3} textAnchor="end" fill={THEME.muted} fontFamily={MONO} fontSize={11}>
              {s.name || s.component}
            </text>
            <rect
              x={bx}
              y={by + 2}
              width={bw}
              height={ROW_H - 6}
              fill={col}
              opacity={isContainer ? CONTAINER_OPACITY : LEAF_OPACITY}
              stroke={isCrit ? THEME.accent : THEME.bg}
              strokeWidth={isCrit ? 1.5 : 0.5}
            >
              <title>{`${s.name} · ${s.duration_ms}ms · @${s.start_ms}ms`}</title>
            </rect>
            <text x={LABEL_W + plotW + 8} y={by + ROW_H / 2 + 3} fill={THEME.muted} fontFamily={MONO} fontSize={11}>
              {s.duration_ms}ms
            </text>
          </g>
        );
      })}
      {/* hairline time axis */}
      <line x1={LABEL_W} x2={LABEL_W + plotW} y1={axisY} y2={axisY} stroke={THEME.faint} strokeWidth={1} />
      {[0, maxTime / 2, maxTime].map((tk, i) => (
        <text
          key={`ax${i}`}
          x={i === 0 ? LABEL_W : i === 2 ? LABEL_W + plotW : LABEL_W + plotW / 2}
          y={axisY + 13}
          textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
          fill={THEME.muted}
          fontFamily={MONO}
          fontSize={10}
        >
          {Math.round(tk)}ms
        </text>
      ))}
    </ChartSvg>
  );
}
