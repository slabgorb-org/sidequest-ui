import { THEME, MONO, SERIF } from "../shared/constants";
import { ChartSvg } from "./tufte";
import type { TurnTokenCacheRow } from "../source/telemetryAdapter";

interface Props {
  data: TurnTokenCacheRow[];
}

// Tokens in / out per turn. Tufte: in and out share ONE honest scale so the
// out ≪ in relationship reads truthfully; direct labels at the data instead of
// a legend box; faint baselines, no gridlines.
//
// The "in" bar is split into cached (faded, bottom) + fresh (solid, top) on the
// SAME shared scale, so a mostly-cached turn reads as mostly-faded. The split is
// ADDITIVE: cached = cache_read, fresh = token_count_in (already cache-exclusive
// per the Anthropic API), so the bar height = cached + fresh = the true prompt
// size. A cache-hit-rate track flags cold-start misses in accent, and a
// "served from cache" line sums the real cache_read. null turns (non-SDK) render
// fresh-only with an explicit n/a — never a fabricated estimate (No Silent
// Fallbacks). Cache data is joined from prompt_assembled in telemetryAdapter
// (buildTurnTokenCacheRows); see Story 124-1.
export function TokenBarChart({ data }: Props) {
  if (data.length === 0) {
    return <div style={{ color: THEME.muted, fontSize: 11 }}>No data yet</div>;
  }

  const N = data.length;
  const W = 520;
  const H = 250;
  const lab = 64;
  const xl = lab + 8;
  const xr = W - 10;
  const cw = xr - xl;
  // Shared scale spans the FULL stacked in-bar (cached + fresh), so the cached
  // segment is drawn truthfully against the same axis as fresh.
  const stacked = (t: TurnTokenCacheRow) => t.tokensIn + (t.cached ?? 0);
  const maxIn = Math.max(...data.map(stacked), 1);
  const maxOut = Math.max(...data.map((t) => t.tokensOut), 1);
  const maxTok = Math.max(maxIn, maxOut);
  const bw = Math.max(1.6, cw / N - 1.4);
  const xAt = (i: number) => xl + i * (cw / N);

  const inBase = 96;
  const sh = 72;
  const outBase = 188;
  const soh = 60;

  // Real cache_read summed across turns that actually reported it (warm + cold).
  // null turns are unknown and contribute nothing — no fabricated savings.
  const knownTurns = data.filter((t) => t.cached !== null);
  const savedFromCache = knownTurns.reduce((s, t) => s + (t.cached ?? 0), 0);
  const coldTurns = data.filter((t) => t.cacheState === "cold");

  // Hit-rate track: cache_read / (cache_read + fresh) per KNOWN turn. Unknown
  // (null) turns are excluded — you cannot rate a turn whose cache state the
  // engine never reported.
  const hrBase = 236;
  const hrH = 22;
  const hitPoints = data
    .map((t, i) => {
      if (t.cached === null) return null;
      const denom = (t.cached ?? 0) + t.tokensIn;
      const rate = denom > 0 ? (t.cached ?? 0) / denom : 0;
      // Carry the turn's REAL index — the dot label must read the true turn, not
      // this array's post-filter position (null turns are dropped above, so the
      // two diverge whenever a null precedes a known turn). Story 125-1.
      return { x: xAt(i) + bw / 2, rate, cold: t.cacheState === "cold", turnIndex: t.turnIndex };
    })
    .filter(
      (p): p is { x: number; rate: number; cold: boolean; turnIndex: number } =>
        p !== null,
    );

  return (
    <ChartSvg width={W} height={H}>
      {/* tokens in (cached + fresh, stacked, shared scale) */}
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
        cached + fresh
      </text>
      {data.map((t, i) => {
        const total = stacked(t);
        const totalH = (total / maxTok) * sh;
        const cachedH = ((t.cached ?? 0) / maxTok) * sh;
        const freshH = (t.tokensIn / maxTok) * sh;
        const title =
          t.cached === null
            ? `T${t.turnIndex} fresh ${t.tokensIn} · cache n/a`
            : `T${t.turnIndex} cached ${t.cached} · fresh ${t.tokensIn}`;
        return (
          <g key={`in${i}`}>
            {/* cached segment (faded, bottom) — only when known and > 0 */}
            {t.cached !== null && t.cached > 0 && (
              <rect x={xAt(i)} y={inBase - cachedH} width={bw} height={cachedH} fill={THEME.steel} opacity={0.32} />
            )}
            {/* fresh segment (solid, stacked on top) */}
            <rect x={xAt(i)} y={inBase - totalH} width={bw} height={freshH} fill={THEME.steel} opacity={0.9}>
              <title>{title}</title>
            </rect>
          </g>
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

      {/* cache hit-rate track — dots per known turn, cold-start misses in accent */}
      <line x1={xl} x2={xr} y1={hrBase} y2={hrBase} stroke={THEME.faint} strokeWidth={1} />
      <text x={lab} y={hrBase - hrH / 2 + 4} textAnchor="end" fill={THEME.muted} fontFamily={SERIF} fontSize={11}>
        cache hit rate
      </text>
      {hitPoints.map((p, i) => (
        <circle
          key={`hr${i}`}
          cx={p.x}
          cy={hrBase - p.rate * hrH}
          r={p.cold ? 2.4 : 1.8}
          fill={p.cold ? THEME.accent : THEME.steel}
        >
          <title>
            {p.cold
              ? `T${p.turnIndex} cold-start miss`
              : `T${p.turnIndex} ${Math.round(p.rate * 100)}% from cache`}
          </title>
        </circle>
      ))}

      {/* summary line: real cache_read served, and cold-start count. When every
          turn is non-SDK (no cache_usage at all), the savings line would be a lie,
          so show a VISIBLE n/a caption instead — the per-bar hover <title> n/a
          alone is too easy to miss when scanning the chart (Story 125-2). */}
      {knownTurns.length > 0 ? (
        <text x={xl} y={H - 4} fill={THEME.steel} fontFamily={MONO} fontSize={10}>
          served from cache {savedFromCache} tokens
          {coldTurns.length > 0
            ? ` · ${coldTurns.length} cold-start miss${coldTurns.length > 1 ? "es" : ""}`
            : ""}
        </text>
      ) : (
        <text x={xl} y={H - 4} fill={THEME.muted} fontFamily={MONO} fontSize={10}>
          cache: n/a (non-SDK)
        </text>
      )}
    </ChartSvg>
  );
}
