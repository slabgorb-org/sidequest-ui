import { THEME, MONO } from "../shared/constants";
import { ChartSvg } from "./tufte";
import { quantile } from "./chartMath";

interface Props {
  durations: { ms: number; agent: string }[];
  /** Overlay median + p95 reference lines (Tufte layering). Default on. */
  showRefs?: boolean;
}

// Agent-duration distribution. Tufte: bars are the only ink, a single faint
// range-frame baseline (no gridlines, no y-axis line), median + p95 reference
// lines layered over the top.
export function Histogram({ durations, showRefs = true }: Props) {
  if (durations.length === 0) {
    return <div style={{ color: THEME.muted, fontSize: 11 }}>No data yet</div>;
  }

  const vals = durations.map((d) => d.ms / 1000);
  const W = 520;
  const H = 192;
  const m = { l: 30, r: 14, t: 22, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = Math.max(...vals) || 1;
  const nb = 12;
  const bw = max / nb;
  const counts = new Array(nb).fill(0);
  vals.forEach((v) => {
    counts[Math.min(nb - 1, Math.floor(v / bw))]++;
  });
  const cmax = Math.max(...counts) || 1;
  const x = (v: number) => m.l + (v / max) * iw;
  const y = (c: number) => m.t + ih - (c / cmax) * ih;
  const med = quantile(vals, 0.5);
  const p95 = quantile(vals, 0.95);

  return (
    <ChartSvg width={W} height={H}>
      {counts.map((c, i) =>
        c === 0 ? null : (
          <rect
            key={`b${i}`}
            x={x(i * bw) + 0.8}
            y={y(c)}
            width={iw / nb - 1.6}
            height={m.t + ih - y(c)}
            fill={THEME.inkDim}
            opacity={0.85}
          />
        ),
      )}
      {/* range-frame baseline */}
      <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke={THEME.faint} strokeWidth={1} />
      {[0, max / 2, max].map((tk, i) => (
        <text
          key={`xt${i}`}
          x={x(tk)}
          y={m.t + ih + 15}
          fill={THEME.muted}
          fontFamily={MONO}
          fontSize={10}
          textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
        >
          {tk.toFixed(1)}s
        </text>
      ))}
      <text x={m.l - 5} y={m.t + 4} fill={THEME.muted} fontFamily={MONO} fontSize={9} textAnchor="end">
        {cmax}
      </text>
      <text x={m.l - 5} y={m.t + ih} fill={THEME.muted} fontFamily={MONO} fontSize={9} textAnchor="end">
        0
      </text>
      {showRefs && (
        <>
          <line
            x1={x(med)}
            x2={x(med)}
            y1={m.t}
            y2={m.t + ih}
            stroke={THEME.inkDim}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text x={x(med)} y={m.t - 4} fill={THEME.inkDim} fontFamily={MONO} fontSize={9} textAnchor="middle">
            med {med.toFixed(1)}s
          </text>
          <line
            x1={x(p95)}
            x2={x(p95)}
            y1={m.t}
            y2={m.t + ih}
            stroke={THEME.accent}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={x(p95)}
            y={m.t + 9}
            fill={THEME.accent}
            fontFamily={MONO}
            fontSize={9}
            textAnchor={p95 > max * 0.85 ? "end" : "middle"}
          >
            p95 {p95.toFixed(1)}s
          </text>
        </>
      )}
    </ChartSvg>
  );
}
