import { useState } from "react";
import type { WatcherEvent } from "@/types/watcher";
import { THEME } from "../shared/constants";

interface Props {
  promptEvents: WatcherEvent[];
}

interface ZoneSection {
  name: string;
  token_estimate: number;
  category: string;
  content?: string;
  // Server (_compute_zones_payload) always emits cached + mis_zoned on every
  // section row; typed required to match the contract and let the compiler
  // reject a never-fires `=== undefined` guard.
  cached: boolean;
  mis_zoned: boolean;
}

interface Zone {
  zone: string;
  total_tokens: number;
  cached: boolean;
  sections: ZoneSection[];
}

interface CacheBlock {
  label: string;
  digest: string;
  cached: boolean;
}

interface CacheUsage {
  cache_read: number;
  cache_write: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cost_usd: number;
  cache_ttl: string;
}

interface PromptFields {
  turn_number?: number;
  agent?: string;
  agent_name?: string;
  section_count?: number;
  prompt_len?: number;
  system_len?: number;
  user_len?: number;
  bounded?: boolean;
  total_tokens?: number;
  zones?: Zone[];
  cache_blocks?: CacheBlock[];
  cache_usage?: CacheUsage | null;
  full_prompt?: string;
}

/** Most recent enriched (cache_blocks-bearing) prompt event strictly before idx. */
function priorBlocksByLabel(
  events: WatcherEvent[],
  idx: number
): Record<string, string> {
  for (let i = idx - 1; i >= 0; i--) {
    const f = events[i].fields as unknown as PromptFields;
    if (f.cache_blocks) {
      const map: Record<string, string> = {};
      for (const b of f.cache_blocks) map[b.label] = b.digest;
      return map;
    }
  }
  return {};
}

export function PromptTab({ promptEvents }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const selected = selectedIdx !== null ? promptEvents[selectedIdx] : null;
  const fields = selected ? (selected.fields as unknown as PromptFields) : null;
  const priorDigests =
    selectedIdx !== null ? priorBlocksByLabel(promptEvents, selectedIdx) : {};

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <span style={{ color: THEME.muted, fontSize: 11 }}>Turn:</span>
        <select
          value={selectedIdx ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedIdx(v === "" ? null : Number(v));
          }}
          style={selectStyle}
        >
          <option value="">Select a turn</option>
          {promptEvents.map((ev, i) => {
            const f = ev.fields as unknown as PromptFields;
            return (
              <option key={i} value={i}>
                T{f.turn_number ?? "?"} · {f.agent_name || f.agent || "?"} · {f.total_tokens ?? 0} tokens{f.bounded ? " · bounded" : ""}
              </option>
            );
          })}
        </select>
      </div>

      {fields?.cache_usage !== undefined && (
        <Card title="Cache Usage (API actuals)">
          {fields.cache_usage === null ? (
            <div style={{ fontSize: 12, color: THEME.muted }}>
              n/a — no SDK usage for this turn (non-SDK backend or build-time
              event). No estimate is shown in its place.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: THEME.text, display: "flex", flexWrap: "wrap", gap: 16 }}>
              <span>cache_read: {fields.cache_usage.cache_read.toLocaleString()}</span>
              <span>
                cache_write: {fields.cache_usage.cache_write.toLocaleString()} (5m{" "}
                {fields.cache_usage.cache_write_5m.toLocaleString()} / 1h{" "}
                {fields.cache_usage.cache_write_1h.toLocaleString()})
              </span>
              <span>cost: ${fields.cache_usage.cost_usd.toFixed(3)}</span>
              <span>ttl: {fields.cache_usage.cache_ttl}</span>
            </div>
          )}
        </Card>
      )}

      {fields?.cache_blocks && (
        <Card title="Cache Blocks (digest · drift)">
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: THEME.muted }}>
                <th style={thStyle}>Block</th>
                <th style={thStyle}>Boundary</th>
                <th style={thStyle}>Digest</th>
                <th style={thStyle}>Drift</th>
              </tr>
            </thead>
            <tbody>
              {fields.cache_blocks.map((b) => {
                const prev = priorDigests[b.label];
                const changed = prev !== undefined && prev !== b.digest;
                return (
                  <tr key={b.label}>
                    <td style={tdStyle}>{b.label}</td>
                    <td style={tdStyle}>{b.cached ? "cached" : "uncached"}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{b.digest}</td>
                    <td style={tdStyle}>
                      {prev === undefined
                        ? "—"
                        : changed
                          ? b.cached
                            ? "drift · wasted write"
                            : "changed"
                          : "held"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {fields?.zones && (
        <Card title="Zone Breakdown">
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: THEME.muted }}>
                <th style={thStyle}>Zone</th>
                <th style={thStyle}>Boundary</th>
                <th style={thStyle}>Tokens</th>
                <th style={thStyle}>Sections</th>
              </tr>
            </thead>
            <tbody>
              {[...fields.zones]
                .sort((a, b) => b.total_tokens - a.total_tokens)
                .map((z) => (
                  <tr key={z.zone}>
                    <td style={tdStyle}>{z.zone}</td>
                    <td style={tdStyle}>{z.cached ? "cached" : "uncached"}</td>
                    <td style={tdStyle}>{z.total_tokens}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {z.sections.map((s) => (
                          <span key={s.name} style={sectionChipStyle}>
                            {s.name}
                            {s.mis_zoned && (
                              <span style={misZonedChipStyle}>⚠ mis-zoned</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 11, color: THEME.muted, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span>Total: {fields.total_tokens ?? 0} tokens</span>
            {(fields.system_len != null || fields.user_len != null) && (
              <span>
                system: {fields.system_len != null ? `${(fields.system_len / 1024).toFixed(1)}KB` : "—"}
                {" / "}
                user: {fields.user_len != null ? `${(fields.user_len / 1024).toFixed(1)}KB` : "—"}
              </span>
            )}
            <span>Agent: {fields.agent_name || fields.agent || "?"}</span>
            {fields.bounded && (
              <span
                style={{
                  background: THEME.accent,
                  color: THEME.bg ?? "#000",
                  borderRadius: 3,
                  padding: "1px 5px",
                  fontWeight: "bold",
                  fontSize: 10,
                  letterSpacing: 0.5,
                }}
              >
                stateless · bounded
              </span>
            )}
          </div>
        </Card>
      )}

      {fields?.full_prompt && (
        <Card title="Full Prompt">
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: THEME.text,
              fontSize: 12,
              maxHeight: "calc(100vh - 300px)",
              overflowY: "auto",
              margin: 0,
            }}
          >
            {fields.full_prompt}
          </pre>
        </Card>
      )}

      {!fields?.zones && !fields?.full_prompt && selected && (
        <Card title="Raw Fields">
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 11,
              color: THEME.muted,
              margin: 0,
            }}
          >
            {JSON.stringify(selected.fields, null, 2)}
          </pre>
        </Card>
      )}

      {!selected && promptEvents.length === 0 && (
        <div style={{ color: THEME.muted, textAlign: "center", padding: 32 }}>
          Waiting for prompt_assembled events...
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          color: THEME.accent,
          fontSize: 12,
          fontWeight: "bold",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: THEME.surface,
  color: THEME.text,
  border: `1px solid ${THEME.border}`,
  padding: "2px 6px",
  fontSize: 11,
  fontFamily: "inherit",
};

const thStyle: React.CSSProperties = { textAlign: "left", padding: "4px 8px" };
const tdStyle: React.CSSProperties = { padding: "4px 8px", verticalAlign: "top" };
const sectionChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: THEME.bg ?? "#111",
  border: `1px solid ${THEME.border}`,
  borderRadius: 3,
  padding: "1px 5px",
  fontSize: 10,
};
const misZonedChipStyle: React.CSSProperties = {
  background: "#a33",
  color: "#fff",
  borderRadius: 3,
  padding: "0 4px",
  fontSize: 9,
  fontWeight: "bold",
  letterSpacing: 0.3,
};
