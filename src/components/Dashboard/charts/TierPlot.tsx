import { THEME, MONO, SERIF } from "../shared/constants";
import { ChartSvg } from "./tufte";

interface Props {
  data: { label: string; value: number }[];
}

// Tiers that signal an incomplete / skipped extraction — flagged in accent.
const EMPHASIZED = new Set(["degraded", "skipped", "none", "unknown"]);

// Extraction-tier distribution as a sorted bar plot — replaces the donut
// (Tufte: a donut hides magnitude; a sorted bar with dotted leaders reads
// directly). Problem tiers are flagged in the accent hue.
export function TierPlot({ data }: Props) {
  if (data.length === 0) {
    return <div style={{ color: THEME.muted, fontSize: 11 }}>No data yet</div>;
  }

  const rows = [...data].sort((a, b) => b.value - a.value);
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const W = 520;
  const rowH = 30;
  const top = 12;
  const H = top + rows.length * rowH + 6;
  const labW = 78;
  const x0 = labW + 10;
  const x1 = W - 66;
  const maxV = Math.max(...rows.map((r) => r.value)) || 1;

  return (
    <ChartSvg width={W} height={H}>
      {rows.map((rw, i) => {
        const cy = top + i * rowH + rowH / 2;
        const emph = EMPHASIZED.has(rw.label);
        const col = emph ? THEME.accent : THEME.inkDim;
        return (
          <g key={rw.label}>
            <text
              x={labW}
              y={cy + 4}
              textAnchor="end"
              fill={emph ? THEME.accent : THEME.ink}
              fontFamily={SERIF}
              fontSize={13}
            >
              {rw.label}
            </text>
            <line x1={x0} x2={x1} y1={cy} y2={cy} stroke={THEME.rule} strokeWidth={1} strokeDasharray="1 3" />
            <rect
              x={x0}
              y={cy - 4}
              width={Math.max(1, (rw.value / maxV) * (x1 - x0))}
              height={8}
              fill={col}
              opacity={emph ? 0.9 : 0.8}
            />
            <text x={x1 + 8} y={cy + 4} fill={THEME.ink} fontFamily={MONO} fontSize={12}>
              {rw.value} ({Math.round((rw.value / total) * 100)}%)
            </text>
          </g>
        );
      })}
    </ChartSvg>
  );
}
