import { AGENT_COLORS, THEME, MONO, SERIF } from "../shared/constants";
import { ChartSvg } from "./tufte";

interface Props {
  /** Per-agent agent_duration sequences, in seconds, in turn order. */
  agents: { name: string; durationsSec: number[] }[];
}

// Per-agent mean & range — replaces the old text rows. Tufte small-multiples:
// each agent is a row with an inline sparkline (its per-turn sequence), a
// dotted baseline, a min–max range bar, and the mean as a single dot. Sorted
// slowest-first so the eye lands on the cost.
export function AgentDotPlot({ agents }: Props) {
  const rows = agents
    .filter((a) => a.durationsSec.length > 0)
    .map((a) => {
      const seq = a.durationsSec;
      const avg = seq.reduce((x, y) => x + y, 0) / seq.length;
      return { name: a.name, seq, avg, min: Math.min(...seq), max: Math.max(...seq), count: seq.length };
    })
    .sort((x, y) => y.avg - x.avg);

  if (rows.length === 0) {
    return <div style={{ color: THEME.muted, fontSize: 11 }}>No data yet</div>;
  }

  const W = 540;
  const rowH = 34;
  const top = 14;
  const H = top + rows.length * rowH + 10;
  const labW = 94;
  const sL = 172;
  const sR = 436;
  const gmax = Math.max(...rows.map((r) => r.max)) || 1;
  const x = (v: number) => sL + (v / gmax) * (sR - sL);

  return (
    <ChartSvg width={W} height={H}>
      <text x={100} y={top - 2} fill={THEME.muted} fontFamily={SERIF} fontSize={9} fontStyle="italic">
        per turn
      </text>
      {rows.map((rw, i) => {
        const cy = top + i * rowH + rowH / 2;
        const col = AGENT_COLORS[rw.name] || THEME.inkDim;
        // inline sparkline of this agent's sequence
        const sw = 60;
        const shh = 16;
        const sx0 = 100;
        const sy0 = cy - 8;
        const mn = Math.min(...rw.seq);
        const mx = Math.max(...rw.seq);
        const rg = mx - mn || 1;
        const pts = rw.seq.map((v, k) => [
          sx0 + (k / (rw.seq.length - 1 || 1)) * (sw - 2) + 1,
          sy0 + shh - 2 - ((v - mn) / rg) * (shh - 4),
        ]);
        const sparkPath = "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
        return (
          <g key={rw.name}>
            <text x={labW} y={cy + 4} textAnchor="end" fill={col} fontFamily={SERIF} fontSize={13}>
              {rw.name}
            </text>
            <path d={sparkPath} fill="none" stroke={THEME.muted} strokeWidth={1} />
            <line x1={sL} x2={sR} y1={cy} y2={cy} stroke={THEME.rule} strokeWidth={1} strokeDasharray="1 3" />
            <line x1={x(rw.min)} x2={x(rw.max)} y1={cy} y2={cy} stroke={col} strokeWidth={1} opacity={0.5} />
            <circle cx={x(rw.avg)} cy={cy} r={3.2} fill={col}>
              <title>{`${rw.name} avg ${rw.avg.toFixed(1)}s, range ${rw.min.toFixed(1)}–${rw.max.toFixed(1)}s`}</title>
            </circle>
            <text x={446} y={cy + 4} fill={THEME.ink} fontFamily={MONO} fontSize={12}>
              {rw.avg.toFixed(1)}s
            </text>
            <text x={W} y={cy + 4} textAnchor="end" fill={THEME.muted} fontFamily={MONO} fontSize={11}>
              n={rw.count}
            </text>
          </g>
        );
      })}
      {[0, gmax].map((tk, i) => (
        <text
          key={`xtk${i}`}
          x={i === 0 ? sL : sR}
          y={top + rows.length * rowH + 2}
          fill={THEME.muted}
          fontFamily={MONO}
          fontSize={9}
          textAnchor={i === 0 ? "start" : "end"}
        >
          {tk.toFixed(1)}s
        </text>
      ))}
    </ChartSvg>
  );
}
