import { AGENT_COLORS, THEME, MONO, SERIF } from "../shared/constants";
import { ChartSvg } from "./tufte";
import { quantile } from "./chartMath";

interface DataPoint {
  turnIndex: number;
  durationMs: number;
  agent: string;
  degraded: boolean;
}

interface Props {
  data: DataPoint[];
  /** Overlay the p95 reference line. Default on. */
  showRefs?: boolean;
}

// Turn duration over time. Tufte: range-frame axes (two hairlines, no box),
// a directly-labeled 5-turn moving mean instead of a legend, p95 reference
// line, degraded turns drawn as an accent ✕ rather than a recolored dot.
export function ScatterPlot({ data, showRefs = true }: Props) {
  if (data.length === 0) {
    return <div style={{ color: THEME.muted, fontSize: 11 }}>No data yet</div>;
  }

  const N = data.length;
  const W = 1060;
  const H = 234;
  const m = { l: 38, r: 86, t: 14, b: 26 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const secs = data.map((t) => t.durationMs / 1000);
  const maxY = Math.max(...secs) || 1;
  const x = (i: number) => m.l + (i / (N - 1 || 1)) * iw;
  const y = (v: number) => m.t + ih - (v / maxY) * ih;
  const p95 = quantile(secs, 0.95);

  // 5-turn trailing mean
  const mean = secs.map((_, i) => {
    const slice = secs.slice(Math.max(0, i - 4), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const meanPath = "M" + mean.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");

  const xTicks: number[] = [];
  for (let i = 0; i < N; i += 6) xTicks.push(i);

  return (
    <ChartSvg width={W} height={H}>
      {/* range-frame axes */}
      <line x1={m.l} x2={m.l} y1={y(maxY)} y2={y(0)} stroke={THEME.faint} strokeWidth={1} />
      <line x1={x(0)} x2={x(N - 1)} y1={m.t + ih} y2={m.t + ih} stroke={THEME.faint} strokeWidth={1} />
      {[0, maxY / 2, maxY].map((tk, i) => (
        <text key={`yt${i}`} x={m.l - 6} y={y(tk) + 3} textAnchor="end" fill={THEME.muted} fontFamily={MONO} fontSize={10}>
          {tk.toFixed(1)}s
        </text>
      ))}
      {xTicks.map((i) => (
        <text key={`xt${i}`} x={x(i)} y={m.t + ih + 14} textAnchor="middle" fill={THEME.muted} fontFamily={MONO} fontSize={10}>
          T{data[i].turnIndex}
        </text>
      ))}
      {showRefs && (
        <>
          <line
            x1={x(0)}
            x2={x(N - 1)}
            y1={y(p95)}
            y2={y(p95)}
            stroke={THEME.accent}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.8}
          />
          <text x={x(N - 1) + 6} y={y(p95) + 3} fill={THEME.accent} fontFamily={MONO} fontSize={10}>
            p95 {p95.toFixed(1)}s
          </text>
        </>
      )}
      <path d={meanPath} fill="none" stroke={THEME.inkDim} strokeWidth={1.4} />
      <text
        x={x(N - 1) + 6}
        y={y(mean[mean.length - 1]) + 3}
        fill={THEME.inkDim}
        fontFamily={SERIF}
        fontSize={10}
        fontStyle="italic"
      >
        5-turn mean
      </text>
      {data.map((t, i) => {
        const cx = x(i);
        const cy = y(secs[i]);
        if (t.degraded) {
          const s = 3.2;
          return (
            <path
              key={`x${i}`}
              d={`M${cx - s},${cy - s} L${cx + s},${cy + s} M${cx - s},${cy + s} L${cx + s},${cy - s}`}
              stroke={THEME.accent}
              strokeWidth={1.5}
            >
              <title>{`T${t.turnIndex} · ${t.agent} · ${secs[i].toFixed(1)}s · degraded`}</title>
            </path>
          );
        }
        return (
          <circle
            key={`pt${i}`}
            cx={cx}
            cy={cy}
            r={2.6}
            fill={AGENT_COLORS[t.agent] || THEME.inkDim}
            stroke={THEME.bg}
            strokeWidth={0.6}
          >
            <title>{`T${t.turnIndex} · ${t.agent} · ${secs[i].toFixed(1)}s`}</title>
          </circle>
        );
      })}
    </ChartSvg>
  );
}
