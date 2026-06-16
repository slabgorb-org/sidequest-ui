import { THEME, MONO, SERIF } from "../shared/constants";
import { ChartSvg } from "./tufte";

interface TokenData {
  turnIndex: number;
  tokensIn: number;
  tokensOut: number;
}

interface Props {
  data: TokenData[];
}

// Tokens in / out per turn. Tufte: in and out share ONE honest scale so the
// out ≪ in relationship reads truthfully; direct labels at the data instead of
// a legend box; faint baselines, no gridlines.
//
// NOTE: the design also split "in" into cached vs fresh with a cache-hit-rate
// sparkline. That telemetry (cache_read / cache_hit / cold) is NOT on the
// turn_complete event — it lives on prompt_assembled (PromptTab surfaces it).
// Joining the two streams onto this chart is deferred to a follow-up story; we
// render only the token counts the turn actually carries.
export function TokenBarChart({ data }: Props) {
  if (data.length === 0) {
    return <div style={{ color: THEME.muted, fontSize: 11 }}>No data yet</div>;
  }

  const N = data.length;
  const W = 520;
  const H = 210;
  const lab = 64;
  const xl = lab + 8;
  const xr = W - 10;
  const cw = xr - xl;
  const maxIn = Math.max(...data.map((t) => t.tokensIn), 1);
  const maxOut = Math.max(...data.map((t) => t.tokensOut), 1);
  const maxTok = Math.max(maxIn, maxOut);
  const bw = Math.max(1.6, cw / N - 1.4);
  const xAt = (i: number) => xl + i * (cw / N);

  const inBase = 96;
  const sh = 72;
  const outBase = 188;
  const soh = 60;

  return (
    <ChartSvg width={W} height={H}>
      {/* tokens in */}
      <line x1={xl} x2={xr} y1={inBase} y2={inBase} stroke={THEME.faint} strokeWidth={1} />
      <text x={lab} y={inBase - sh / 2 - 3} textAnchor="end" fill={THEME.steel} fontFamily={SERIF} fontSize={12}>
        tokens in
      </text>
      <text
        x={lab}
        y={inBase - sh / 2 + 11}
        textAnchor="end"
        fill={THEME.muted}
        fontFamily={SERIF}
        fontStyle="italic"
        fontSize={9}
      >
        shared scale
      </text>
      {data.map((t, i) => {
        const h = (t.tokensIn / maxTok) * sh;
        return (
          <rect key={`in${i}`} x={xAt(i)} y={inBase - h} width={bw} height={h} fill={THEME.steel} opacity={0.9}>
            <title>{`T${t.turnIndex} in ${t.tokensIn}`}</title>
          </rect>
        );
      })}
      <text x={xr} y={inBase - sh - 2} textAnchor="end" fill={THEME.muted} fontFamily={MONO} fontSize={9}>
        peak in {maxIn}
      </text>

      {/* tokens out */}
      <line x1={xl} x2={xr} y1={outBase} y2={outBase} stroke={THEME.faint} strokeWidth={1} />
      <text x={lab} y={outBase - soh / 2 + 4} textAnchor="end" fill={THEME.ochre} fontFamily={SERIF} fontSize={12}>
        tokens out
      </text>
      {data.map((t, i) => {
        const h = (t.tokensOut / maxTok) * soh;
        return (
          <rect key={`out${i}`} x={xAt(i)} y={outBase - h} width={bw} height={h} fill={THEME.ochre} opacity={0.85}>
            <title>{`T${t.turnIndex} out ${t.tokensOut}`}</title>
          </rect>
        );
      })}
      <text x={xr} y={outBase - soh - 2} textAnchor="end" fill={THEME.muted} fontFamily={MONO} fontSize={9}>
        peak out {maxOut}
      </text>
    </ChartSvg>
  );
}
