import { useMemo } from "react";
import type { WatcherEvent, TurnCompleteFields } from "@/types/watcher";
import { Histogram } from "../charts/Histogram";
import { ScatterPlot } from "../charts/ScatterPlot";
import { TokenBarChart } from "../charts/TokenBarChart";
import { buildTurnTokenCacheRows } from "../source/telemetryAdapter";
import { AgentDotPlot } from "../charts/AgentDotPlot";
import { TierPlot } from "../charts/TierPlot";
import { Sparkline, SectionTitle } from "../charts/tufte";
import { quantile } from "../charts/chartMath";
import { THEME, AGENT_COLORS, MONO, SERIF } from "../shared/constants";

interface Props {
  turns: WatcherEvent[];
  /** The ordered full event stream (turn_complete + prompt_assembled), used to
   *  join per-turn cache_read onto the token chart. When omitted, the token
   *  chart degrades to fresh-only with no fabricated cache. */
  allEvents?: WatcherEvent[];
}

export function TimingTab({ turns, allEvents }: Props) {
  const turnFields = useMemo(
    () => turns.map((t) => t.fields as TurnCompleteFields),
    [turns],
  );

  // Durations for histogram
  const durations = useMemo(
    () =>
      turnFields
        .map((f) => ({ ms: f.agent_duration_ms || 0, agent: f.agent_name || "?" }))
        .filter((d) => d.ms > 0),
    [turnFields],
  );

  // Scatter data
  const scatterData = useMemo(
    () =>
      turnFields.map((f, i) => ({
        turnIndex: i + 1,
        durationMs: f.agent_duration_ms || 0,
        agent: f.agent_name || "?",
        degraded: !!f.is_degraded,
      })),
    [turnFields],
  );

  // Token data — cached/fresh split joined from the prompt_assembled stream
  // (telemetryAdapter). Falls back to the turn_complete array (fresh-only, no
  // cache) when the full stream isn't supplied.
  const tokenData = useMemo(
    () => buildTurnTokenCacheRows(allEvents ?? turns),
    [allEvents, turns],
  );

  // Extraction tier distribution
  const tierData = useMemo(() => {
    const counts: Record<string, number> = {};
    turnFields.forEach((f) => {
      const tier = f.extraction_tier || "unknown";
      counts[tier] = (counts[tier] || 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [turnFields]);

  // Per-agent duration sequences (seconds) for the mean & range dot plot.
  const agentSeries = useMemo(() => {
    const agents: Record<string, number[]> = {};
    turnFields.forEach((f) => {
      const ms = f.agent_duration_ms || 0;
      if (ms <= 0) return;
      const name = f.agent_name || "?";
      (agents[name] = agents[name] || []).push(ms / 1000);
    });
    return Object.entries(agents).map(([name, durationsSec]) => ({ name, durationsSec }));
  }, [turnFields]);

  // Stats
  const seq = durations.map((d) => d.ms / 1000); // chronological
  const p50 = seq.length > 0 ? quantile(seq, 0.5).toFixed(1) + "s" : "—";
  const p95 = seq.length > 0 ? quantile(seq, 0.95).toFixed(1) + "s" : "—";
  const p99 = seq.length > 0 ? quantile(seq, 0.99).toFixed(1) + "s" : "—";
  const degradedCount = turnFields.filter((f) => f.is_degraded).length;
  const degradedPct =
    turnFields.length > 0 ? Math.round((degradedCount / turnFields.length) * 100) : 0;

  const stats: StatProps[] = [
    { label: "p50", value: p50, sub: "median" },
    {
      label: "p95",
      value: p95,
      sub: "95th percentile",
      spark: seq.length > 1 ? <Sparkline values={seq} color={THEME.muted} width={74} height={18} /> : null,
    },
    { label: "p99", value: p99, sub: "tail" },
    {
      label: "degraded",
      value: `${degradedCount}/${turnFields.length}`,
      sub: `${degradedPct}% of turns`,
      alert: degradedPct > 10,
    },
  ];

  return (
    <div style={{ padding: "24px 26px", maxWidth: 1180, margin: "0 auto" }}>
      {/* Summary stats */}
      <div style={{ display: "flex", gap: 46, alignItems: "flex-end", marginBottom: 32, flexWrap: "wrap" }}>
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>

      {/* Phase breakdown — only renders when phase_durations_ms is present.
          Older servers (pre-phase-timing) don't ship it; the section just
          short-circuits in that case. */}
      <PhaseBreakdown turnFields={turnFields} />

      {/* Distribution + per-agent */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginBottom: 32 }}>
        <div>
          <SectionTitle marginBottom={14}>Agent duration · distribution</SectionTitle>
          <Histogram durations={durations} />
        </div>
        <div>
          <SectionTitle marginBottom={14}>By agent · mean &amp; range</SectionTitle>
          <AgentDotPlot agents={agentSeries} />
        </div>
      </div>

      {/* Over time */}
      <div style={{ marginBottom: 32 }}>
        <SectionTitle>Turn duration over time</SectionTitle>
        <div style={{ display: "flex", gap: 16, margin: "6px 0 12px", fontFamily: MONO, fontSize: 11, flexWrap: "wrap" }}>
          {["narrator", "ensemble", "creature_smith", "dialectician"].map((n) => (
            <span key={n} style={{ color: AGENT_COLORS[n] || THEME.inkDim }}>
              ● {n}
            </span>
          ))}
        </div>
        <ScatterPlot data={scatterData} />
      </div>

      {/* Tokens + tiers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <div>
          <SectionTitle marginBottom={10}>
            Token usage{" "}
            <span style={{ fontVariant: "normal", fontStyle: "italic", letterSpacing: 0, color: THEME.dot, fontSize: 11 }}>
              — cached · fresh · out
            </span>
          </SectionTitle>
          <TokenBarChart data={tokenData} />
        </div>
        <div>
          <SectionTitle marginBottom={14}>Extraction tier</SectionTitle>
          <TierPlot data={tierData} />
        </div>
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  sub: string;
  spark?: React.ReactNode;
  alert?: boolean;
}

function Stat({ label, value, sub, spark, alert }: StatProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontFamily: SERIF, fontVariant: "small-caps", letterSpacing: "0.09em", color: THEME.muted, fontSize: 12 }}>
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <span style={{ fontFamily: MONO, fontSize: 30, lineHeight: 1, color: alert ? THEME.accent : THEME.ink }}>
          {value}
        </span>
        {spark}
      </span>
      <span style={{ fontFamily: SERIF, fontStyle: "italic", color: THEME.dot, fontSize: 11 }}>{sub}</span>
    </div>
  );
}

function PhaseBreakdown({ turnFields }: { turnFields: TurnCompleteFields[] }) {
  const latest = useMemo(() => {
    for (let i = turnFields.length - 1; i >= 0; i--) {
      const f = turnFields[i];
      if (f.phase_durations_ms && Object.keys(f.phase_durations_ms).length > 0) {
        return f;
      }
    }
    return null;
  }, [turnFields]);

  const averages = useMemo(() => {
    const totals: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const f of turnFields) {
      const phases = f.phase_durations_ms;
      if (!phases) continue;
      for (const [name, ms] of Object.entries(phases)) {
        totals[name] = (totals[name] || 0) + ms;
        counts[name] = (counts[name] || 0) + 1;
      }
    }
    return Object.entries(totals)
      .map(([name, sum]) => ({ name, avgMs: Math.round(sum / counts[name]), turns: counts[name] }))
      .sort((a, b) => b.avgMs - a.avgMs);
  }, [turnFields]);

  if (!latest && averages.length === 0) {
    return null;
  }

  const latestPhases = latest?.phase_durations_ms ?? {};
  const latestCallCounts = latest?.phase_call_counts ?? {};
  const latestTotal = latest?.total_duration_ms ?? 0;
  const latestUnaccounted = latest?._unaccounted_ms ?? 0;
  const latestRows = Object.entries(latestPhases)
    .map(([name, ms]) => ({ name, ms, calls: latestCallCounts[name] ?? 1 }))
    .sort((a, b) => b.ms - a.ms);

  // Session-avg lookup keyed by phase name — drives the avg-tick overlay.
  const avgByName: Record<string, number> = {};
  averages.forEach((a) => (avgByName[a.name] = a.avgMs));
  const maxMs = Math.max(1, ...latestRows.map((r) => r.ms), latestUnaccounted, ...averages.map((a) => a.avgMs));

  return (
    <section style={{ marginBottom: 32 }}>
      <SectionTitle>Phase breakdown</SectionTitle>
      <div style={{ fontFamily: MONO, fontSize: 10, color: THEME.dot, marginBottom: 12 }}>
        bar = latest turn · │ = session avg
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
        <div>
          <div style={subheadStyle}>Latest turn — total {(latestTotal / 1000).toFixed(2)}s</div>
          {latestRows.length === 0 ? (
            <div style={{ color: THEME.muted, fontSize: 11 }}>No phase data yet</div>
          ) : (
            <>
              {latestRows.map((p) => (
                <PhaseRow
                  key={p.name}
                  name={p.name}
                  ms={p.ms}
                  calls={p.calls}
                  totalMs={latestTotal || 1}
                  avgMs={avgByName[p.name]}
                  maxMs={maxMs}
                />
              ))}
              {latestUnaccounted > 0 && (
                <PhaseRow
                  name="_unaccounted"
                  ms={latestUnaccounted}
                  calls={1}
                  totalMs={latestTotal || 1}
                  maxMs={maxMs}
                  muted
                />
              )}
            </>
          )}
        </div>
        <div>
          <div style={subheadStyle}>Average across {averages[0]?.turns ?? 0} turn(s)</div>
          {averages.length === 0 ? (
            <div style={{ color: THEME.muted, fontSize: 11 }}>No phase data yet</div>
          ) : (
            averages.map((p) => (
              <div
                key={p.name}
                style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}
              >
                <span style={{ fontFamily: SERIF, color: THEME.inkDim, fontSize: 13 }}>{p.name}</span>
                <span style={{ fontFamily: MONO, color: THEME.muted }}>{(p.avgMs / 1000).toFixed(2)}s</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function PhaseRow({
  name,
  ms,
  calls,
  totalMs,
  avgMs,
  maxMs,
  muted,
}: {
  name: string;
  ms: number;
  calls: number;
  totalMs: number;
  avgMs?: number;
  maxMs: number;
  muted?: boolean;
}) {
  const pct = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;
  const barPct = (ms / maxMs) * 100;
  const avgPct = avgMs != null ? (avgMs / maxMs) * 100 : null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "118px 1fr 56px 40px",
        gap: 10,
        alignItems: "center",
        padding: "4px 0",
        fontSize: 12,
      }}
    >
      <span style={{ fontFamily: SERIF, fontSize: 13, color: muted ? THEME.muted : THEME.ink, fontStyle: muted ? "italic" : "normal" }}>
        {name}
        {calls > 1 ? ` ×${calls}` : ""}
      </span>
      {/* bar track: dotted leader + bar + session-avg tick */}
      <div style={{ position: "relative", height: 12 }}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            borderTop: `1px dotted ${THEME.rule}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            left: 0,
            width: `${barPct}%`,
            height: 8,
            background: muted ? THEME.faint : THEME.inkDim,
            opacity: muted ? 0.6 : 0.85,
          }}
        />
        {avgPct != null && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${avgPct}%`,
              width: 1.4,
              background: THEME.accent,
            }}
            title={`session avg ${(avgMs! / 1000).toFixed(2)}s`}
          />
        )}
      </div>
      <span style={{ fontFamily: MONO, color: muted ? THEME.muted : THEME.ink, textAlign: "right" }}>
        {(ms / 1000).toFixed(2)}s
      </span>
      <span style={{ fontFamily: MONO, color: THEME.muted, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

const subheadStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontStyle: "italic",
  color: THEME.dot,
  fontSize: 11,
  marginBottom: 8,
};
