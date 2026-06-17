import React, { useMemo, useState } from "react";
import type {
  SessionStateView,
  NpcRegistryEntry,
  PlayerStateView,
  ItemView,
  TropeStateView,
} from "@/types/watcher";
import { THEME, SERIF, MONO, safeStr } from "../shared/constants";

interface Props {
  debugState: SessionStateView[] | null;
  onRefresh: () => void;
}

// Big-Five order for the OCEAN sparkline fingerprint. The live `ocean` dict
// (OceanProfile.model_dump) keys these names on a 0–10 scale.
const OCEAN_DIMS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;
const OCEAN_SCALE = 10;

/** Narrowing extract of the five OCEAN dimensions, or null if the dict is
 *  absent / malformed. Uses an explicit `typeof number` check (not `||`) so a
 *  legitimate 0.0 dimension is kept, not dropped. */
function oceanValues(ocean: Record<string, unknown> | null | undefined): number[] | null {
  if (!ocean) return null;
  const vals: number[] = [];
  for (const k of OCEAN_DIMS) {
    const v = ocean[k];
    if (typeof v !== "number" || Number.isNaN(v)) return null;
    vals.push(v);
  }
  return vals;
}

const svgStyle: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "middle",
  overflow: "visible",
};

/** 5-bar OCEAN personality fingerprint (small-multiples sparkline). */
function OceanGlyph({ ocean }: { ocean: Record<string, unknown> | null | undefined }) {
  const vals = oceanValues(ocean);
  if (!vals) return <span style={{ color: THEME.muted, fontFamily: MONO, fontSize: 12 }}>—</span>;
  const bw = 6;
  const gap = 3;
  const W = OCEAN_DIMS.length * (bw + gap);
  const H = 16;
  const label = "OCEAN · " + vals.map((v) => v.toFixed(1)).join(" ");
  return (
    <svg width={W} height={H} role="img" aria-label={label} style={svgStyle}>
      <title>{label}</title>
      <line x1={0} x2={W} y1={H - 1} y2={H - 1} stroke={THEME.faint} strokeWidth={1} />
      {vals.map((v, i) => {
        const bh = Math.max(1, (v / OCEAN_SCALE) * (H - 3));
        return (
          <rect
            key={OCEAN_DIMS[i]}
            x={i * (bw + gap)}
            y={H - 1 - bh}
            width={bw}
            height={bh}
            fill={THEME.inkDim}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

/** Narrative-weight bar with named (0.5) / evolved (0.7) threshold ticks. */
function WeightBar({ weight }: { weight: number }) {
  const W = 72;
  const H = 12;
  const col = weight >= 0.7 ? THEME.steel : weight >= 0.5 ? THEME.sage : THEME.muted;
  return (
    <svg
      width={W}
      height={H}
      role="img"
      aria-label={`narrative weight ${weight.toFixed(2)}`}
      style={svgStyle}
    >
      <line x1={1} x2={W - 1} y1={H / 2} y2={H / 2} stroke={THEME.faint} strokeWidth={1} />
      {[0.5, 0.7].map((t) => (
        <line
          key={t}
          x1={1 + (W - 2) * t}
          x2={1 + (W - 2) * t}
          y1={H / 2 - 4}
          y2={H / 2 + 4}
          stroke={THEME.rule}
          strokeWidth={1}
        />
      ))}
      <rect x={1} y={H / 2 - 2.5} width={Math.max(1, (W - 2) * weight)} height={5} fill={col} />
    </svg>
  );
}

/** Character HP bullet bar. */
function HpBar({ hp, max }: { hp: number; max: number }) {
  const W = 92;
  const H = 12;
  const frac = max > 0 ? hp / max : 0;
  const col = frac > 0.6 ? THEME.sage : frac > 0.3 ? THEME.ochre : THEME.accent;
  return (
    <svg
      width={W}
      height={H}
      role="img"
      aria-label={`hp ${hp} of ${max}`}
      style={svgStyle}
    >
      <line x1={1} x2={W - 1} y1={H / 2} y2={H / 2} stroke={THEME.faint} strokeWidth={1} />
      <rect x={1} y={H / 2 - 2.5} width={Math.max(0, (W - 2) * frac)} height={5} fill={col} />
    </svg>
  );
}

const stage = (w: number): string => (w >= 0.7 ? "evolved" : w >= 0.5 ? "named" : "unnamed");
const stageColor = (w: number): string => (w >= 0.7 ? THEME.steel : w >= 0.5 ? THEME.sage : THEME.muted);

// ---------------------------------------------------------------------------
// Tufte chrome — hairline-ruled section title, no boxes.
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontVariant: "small-caps",
  letterSpacing: "0.07em",
  color: THEME.muted,
  fontSize: 11,
};

function SectionTitle({ children, count }: { children: React.ReactNode; count?: string }) {
  return (
    <div
      style={{
        fontFamily: SERIF,
        fontVariant: "small-caps",
        letterSpacing: "0.1em",
        color: "#9a988f",
        fontSize: 13,
        paddingBottom: 5,
        marginBottom: 12,
        borderBottom: `1px solid ${THEME.rule}`,
      }}
    >
      {children}
      {count ? (
        <span style={{ fontVariant: "normal", letterSpacing: 0, color: THEME.dot, fontSize: 11 }}>
          {" "}
          {count}
        </span>
      ) : null}
    </div>
  );
}

const colHeadStyle: React.CSSProperties = {
  ...labelStyle,
  letterSpacing: "0.06em",
  padding: "0 0 5px",
  borderBottom: `1px solid ${THEME.rule}`,
};
const cellStyle: React.CSSProperties = {
  padding: "6px 0",
  borderBottom: "1px solid #232327",
};
const serifCell: React.CSSProperties = { ...cellStyle, fontFamily: SERIF, fontSize: 13, color: THEME.ink };
const monoCell: React.CSSProperties = { ...cellStyle, fontFamily: MONO, fontSize: 12, color: THEME.muted };

export function StateTab({ debugState, onRefresh }: Props) {
  const [filter, setFilter] = useState("");

  if (!debugState || debugState.length === 0) {
    return (
      <div style={{ padding: 26 }}>
        <div style={{ color: THEME.muted, textAlign: "center", padding: 32, fontFamily: SERIF }}>
          No active sessions. Start a game first.
          <br />
          <button onClick={onRefresh} style={btnStyle}>
            ↻ Refresh
          </button>
        </div>
      </div>
    );
  }

  // Pick the most-recently-touched session (playtest 2026-04-24: the State tab
  // defaulted to index 0, which was the oldest save, not the active one). The
  // server sorts newest-first and exposes `last_activity_ts`; we sort
  // defensively so older/unsorted servers still land on the active save.
  const session = [...debugState].sort((a, b) => {
    const aTs = a.last_activity_ts ?? 0;
    const bTs = b.last_activity_ts ?? 0;
    return bTs - aTs;
  })[0];

  const ff = filter.toLowerCase();

  return (
    <div style={{ padding: "24px 26px", maxWidth: 1180, margin: "0 auto", color: THEME.ink }}>
      {/* Search */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 13, marginBottom: 26 }}>
        <span style={labelStyle}>search</span>
        <input
          type="text"
          placeholder="filter npcs, items…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={inputStyle}
        />
        <button onClick={onRefresh} style={btnStyle} title="Fetch latest state from server">
          ↻ Refresh
        </button>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: THEME.muted }}>
          {session.genre_slug}/{session.world_slug} · {session.player_count} player(s)
        </span>
      </div>

      {/* Location + Tropes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 44,
          marginBottom: 32,
        }}
      >
        <div>
          <SectionTitle>Location</SectionTitle>
          <div style={{ fontFamily: SERIF, fontSize: 23, color: THEME.ink, marginBottom: 4 }}>
            {session.current_location || "Unknown"}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: THEME.muted, marginBottom: 16 }}>
            {session.genre_slug} / {session.world_slug} · {session.turn_mode}
          </div>
          {session.discovered_regions.length > 0 && (
            <>
              <div style={{ ...labelStyle, marginBottom: 6 }}>discovered regions</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "5px 16px",
                  fontFamily: MONO,
                  fontSize: 12,
                  color: THEME.sage,
                }}
              >
                {session.discovered_regions.map((r) => (
                  <span key={r}>{r}</span>
                ))}
              </div>
            </>
          )}
        </div>
        <div>
          <SectionTitle count={`(${session.trope_states.length})`}>Tropes</SectionTitle>
          {session.trope_states.length > 0 ? (
            <TropesPlot tropes={session.trope_states} />
          ) : (
            <div style={{ fontFamily: MONO, fontSize: 11, color: THEME.muted }}>none active</div>
          )}
        </div>
      </div>

      {/* Players / Characters */}
      {session.players.map((player) => (
        <PlayerSection key={player.player_name} player={player} filter={ff} />
      ))}

      {/* NPC Registry */}
      <NpcRegistry npcs={session.npc_registry} filter={ff} />

      {/* Infrastructure */}
      <div>
        <SectionTitle>Infrastructure</SectionTitle>
        <div style={{ fontFamily: MONO, fontSize: 12, color: THEME.muted }}>
          music director {session.has_music_director ? "✓" : "✗"} · audio mixer{" "}
          {session.has_audio_mixer ? "✓" : "✗"} · narration history {session.narration_history_len}{" "}
          entries · {session.discovered_regions.length} regions
        </div>
      </div>
    </div>
  );
}

// -- Tropes (sorted progression bar plot) --

function TropesPlot({ tropes }: { tropes: TropeStateView[] }) {
  const rows = [...tropes].sort((a, b) => b.progression - a.progression);
  return (
    <div>
      {rows.map((t) => {
        const col =
          t.status === "active" ? THEME.steel : t.status === "resolved" ? THEME.muted : THEME.faint;
        const W = 240;
        const H = 12;
        return (
          <div
            key={t.trope_definition_id}
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
          >
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 12.5,
                color: THEME.ink,
                width: 140,
                textAlign: "right",
              }}
            >
              {t.trope_definition_id}
            </span>
            <svg width={W} height={H} role="img" aria-label={`progression ${t.progression.toFixed(2)}`} style={svgStyle}>
              <line
                x1={1}
                x2={W - 1}
                y1={H / 2}
                y2={H / 2}
                stroke={THEME.rule}
                strokeWidth={1}
                strokeDasharray="1 3"
              />
              <rect
                x={1}
                y={H / 2 - 4}
                width={Math.max(1, (W - 2) * Math.min(1, t.progression))}
                height={8}
                fill={col}
                opacity={0.85}
              />
            </svg>
            <span style={{ fontFamily: MONO, fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>
              {t.progression.toFixed(2)} · {t.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// -- Player section (stat line + inventory weight bars) --

function PlayerSection({ player, filter }: { player: PlayerStateView; filter: string }) {
  const items = player.inventory.items;
  const filteredItems = filter ? items.filter((it) => it.name.toLowerCase().includes(filter)) : items;

  // When a filter is active and nothing in this character matches, fold the
  // whole section away — same behavior as the pre-Tufte tab.
  if (filter && filteredItems.length === 0) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionTitle>
        {(player.character_name || player.player_name) +
          " — " +
          (player.character_class || "?") +
          " · Lv " +
          player.character_level}
      </SectionTitle>

      <div style={{ display: "flex", alignItems: "center", gap: 30, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={labelStyle}>hp</span>
          <span style={{ fontFamily: MONO, fontSize: 13, color: THEME.ink }}>
            {player.character_hp}/{player.character_max_hp}
          </span>
          <HpBar hp={player.character_hp} max={player.character_max_hp} />
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={labelStyle}>xp</span>
          <span style={{ fontFamily: MONO, fontSize: 13, color: THEME.ink }}>
            {player.character_xp.toLocaleString()}
          </span>
        </span>
        {player.inventory.gold > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={labelStyle}>gold</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: THEME.ochre }}>
              {player.inventory.gold} gold
            </span>
          </span>
        )}
        {player.display_location && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={labelStyle}>at</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: THEME.inkDim }}>
              {player.display_location}
              {player.region_id ? ` · ${player.region_id}` : ""}
            </span>
          </span>
        )}
      </div>

      {filteredItems.length > 0 && (
        <>
          <div style={{ ...labelStyle, marginBottom: 4 }}>inventory</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.8fr 1.1fr 0.8fr 0.8fr",
              gap: "0 18px",
            }}
          >
            <div style={colHeadStyle}>item</div>
            <div style={colHeadStyle}>narrative weight</div>
            <div style={colHeadStyle}>stage</div>
            <div style={colHeadStyle}>state</div>
            {filteredItems.map((it: ItemView) => {
              const w = it.narrative_weight ?? 0;
              return (
                <React.Fragment key={it.id || it.name}>
                  <div style={serifCell}>{it.name}</div>
                  <div style={{ ...cellStyle, display: "flex", alignItems: "center", gap: 9 }}>
                    <WeightBar weight={w} />
                    <span style={{ fontFamily: MONO, fontSize: 11, color: THEME.muted }}>
                      {w.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ ...cellStyle, fontFamily: MONO, fontSize: 12, color: stageColor(w) }}>
                    {stage(w)}
                  </div>
                  <div style={monoCell}>{safeStr(it.state)}</div>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// -- NPC registry (dense table with OCEAN fingerprint column) --

function NpcRegistry({ npcs, filter }: { npcs: NpcRegistryEntry[]; filter: string }) {
  const filtered = useMemo(() => {
    if (!filter) return npcs;
    return npcs.filter(
      (n) =>
        n.name.toLowerCase().includes(filter) ||
        n.role.toLowerCase().includes(filter) ||
        n.location.toLowerCase().includes(filter),
    );
  }, [npcs, filter]);

  if (filtered.length === 0) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionTitle count={`(${filtered.length})`}>NPC registry</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 0.9fr 1.2fr 0.6fr 0.7fr 0.8fr 0.7fr",
          gap: "0 16px",
        }}
      >
        <div style={colHeadStyle}>name</div>
        <div style={colHeadStyle}>role</div>
        <div style={colHeadStyle}>location</div>
        <div style={colHeadStyle}>hp</div>
        <div style={colHeadStyle}>last seen</div>
        <div style={colHeadStyle}>pronouns</div>
        <div style={colHeadStyle}>OCEAN</div>
        {filtered.map((n) => (
          <React.Fragment key={n.name}>
            <div style={serifCell}>{n.name}</div>
            <div style={{ ...serifCell, fontSize: 12.5, color: THEME.muted }}>{n.role}</div>
            <div style={{ ...serifCell, fontSize: 12.5, color: THEME.muted }}>{n.location}</div>
            <div style={{ ...monoCell, color: THEME.inkDim }}>
              {n.max_hp > 0 ? `${n.hp}/${n.max_hp}` : "—"}
            </div>
            <div style={monoCell}>T{n.last_seen_turn}</div>
            <div style={monoCell}>{n.pronouns}</div>
            <div style={cellStyle}>
              <OceanGlyph ocean={n.ocean} />
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", color: THEME.dot, fontSize: 10, marginTop: 8 }}>
        OCEAN = openness · conscientiousness · extraversion · agreeableness · neuroticism
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: `1px solid ${THEME.faint}`,
  color: THEME.ink,
  fontFamily: MONO,
  fontSize: 12,
  padding: "3px 2px",
  width: 240,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  background: "transparent",
  color: THEME.muted,
  border: "none",
  padding: "4px 6px",
  cursor: "pointer",
  fontFamily: SERIF,
  fontVariant: "small-caps",
  letterSpacing: "0.06em",
  fontSize: 12,
};
