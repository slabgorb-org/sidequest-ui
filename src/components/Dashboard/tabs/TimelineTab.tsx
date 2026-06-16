import React, { useMemo } from "react";
import type { WatcherEvent, TurnCompleteFields, TurnSpan } from "@/types/watcher";
import { FlameChart } from "../charts/FlameChart";
import { SectionTitle } from "../charts/tufte";
import { THEME, MONO, SERIF } from "../shared/constants";

interface Props {
  turns: WatcherEvent[];
  selectedTurn: number | null;
  onSelectTurn: (index: number) => void;
}

const PROBLEM_TIERS = new Set(["degraded", "skipped", "none", "unknown"]);

export function TimelineTab({ turns, selectedTurn, onSelectTurn }: Props) {
  const selected = selectedTurn !== null ? turns[selectedTurn] : null;
  const fields = selected ? (selected.fields as TurnCompleteFields) : null;

  const spans: TurnSpan[] = useMemo(() => {
    if (!fields) return [];
    if (fields.spans && fields.spans.length > 0) return fields.spans;
    // Fallback: single agent_llm span
    const dur = fields.total_duration_ms || fields.agent_duration_ms || 1;
    return [
      {
        name: "agent_llm",
        component: fields.agent_name || "narrator",
        start_ms: 0,
        duration_ms: dur,
      },
    ];
  }, [fields]);

  const totalMs = fields ? fields.total_duration_ms || fields.agent_duration_ms || 1 : 0;

  // Bottleneck = longest single span (honest, from flat span data).
  const bottleneck = useMemo(() => {
    let bn: TurnSpan | null = null;
    for (const s of spans) if (!bn || (s.duration_ms || 0) > (bn.duration_ms || 0)) bn = s;
    return bn;
  }, [spans]);

  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start", padding: "24px 26px", height: "100%" }}>
      {/* Turn list sidebar */}
      <div style={{ width: 204, flexShrink: 0 }}>
        <SectionTitle marginBottom={8}>Turns</SectionTitle>
        <div style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          {turns.length === 0 ? (
            <div style={{ color: THEME.muted, fontSize: 12, fontStyle: "italic", padding: 8 }}>
              Waiting for first turn…
            </div>
          ) : (
            renderTurnList(turns, selectedTurn, onSelectTurn)
          )}
        </div>
      </div>

      {/* Flame chart + metadata */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <SectionTitle
          right={
            bottleneck ? (
              <span style={{ fontFamily: MONO, fontSize: 11, color: THEME.accent }}>
                bottleneck · {bottleneck.name} {bottleneck.duration_ms}ms
              </span>
            ) : undefined
          }
        >
          {fields
            ? `Turn ${fields.turn_id ?? "?"} → ${fields.agent_name ?? "?"} · ${(totalMs / 1000).toFixed(2)}s`
            : "Select a turn"}
        </SectionTitle>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", color: THEME.dot, fontSize: 11, margin: "6px 0 10px" }}>
          width = time · color = component · outlined = slowest span
        </div>

        <FlameChart spans={spans} totalMs={totalMs} />

        {fields && (
          <>
            <div
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                color: THEME.inkDim,
                fontSize: 14,
                marginTop: 16,
                borderTop: `1px solid ${THEME.rule}`,
                paddingTop: 12,
              }}
            >
              “{fields.player_input || "—"}”
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px 28px", marginTop: 14 }}>
              {detailRows(fields).map((dr) => (
                <Detail key={dr.k} k={dr.k} v={dr.v} accent={dr.accent} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function detailRows(f: TurnCompleteFields): { k: string; v: string; accent?: boolean }[] {
  const tier = f.extraction_tier || "?";
  const patches =
    (f.patches || []).map((p) => `${p.patch_type}(${(p.fields_changed || []).join(",")})`).join(", ") || "none";
  const beats = (f.beats_fired || []).map((b) => `${b.trope}@${(b.threshold || 0).toFixed(1)}`).join(", ") || "none";
  return [
    { k: "agent", v: f.agent_name || "?" },
    { k: "tokens", v: `${f.token_count_in || 0} in / ${f.token_count_out || 0} out` },
    { k: "tier", v: tier, accent: PROBLEM_TIERS.has(tier) },
    { k: "degraded", v: f.is_degraded ? "yes" : "no", accent: !!f.is_degraded },
    { k: "total", v: `${((f.total_duration_ms || 0) / 1000).toFixed(2)}s` },
    { k: "patches", v: patches },
    { k: "beats", v: beats },
  ];
}

function Detail({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: SERIF, fontVariant: "small-caps", letterSpacing: "0.07em", color: THEME.muted, fontSize: 11 }}>
        {k}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: accent ? THEME.accent : THEME.ink, marginTop: 2 }}>{v}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session-divider rendering — playtest 2026-04-11 fix for "Turn # collides
// across sessions in OTEL dashboard".
//
// Background: turn_id resets per session (it's the in-session turn counter).
// When a player plays two sessions in the same world (or two sessions in
// different worlds, or two different players), the dashboard timeline used to
// show two `#1 narrator` rows mingled together with no way to tell them apart.
//
// Fix: detect session boundaries between consecutive turns and render a
// horizontal divider with the session identifier. A boundary is any of:
//   - (player_id, genre, world) tuple changes between consecutive turns
//   - turn_id RESETS BACKWARDS (e.g. #5 → #1) within the same tuple, which
//     can happen if the player completes a session and starts a new
//     character in the same world (server clears npc_registry per the
//     companion fix in sidequest-api PR #408)
//
// The (player_id, genre, world) tuple comes from the new TurnComplete fields
// added in sidequest-api PR #409. Older events from a stale server may not
// carry those fields — in that case the dividers degrade gracefully (only
// turn_id reset triggers a boundary, which still catches the most common
// "started a new session" case).
// ─────────────────────────────────────────────────────────────────────────────

interface SessionTuple {
  player_id?: string;
  genre?: string;
  world?: string;
}

function sameSession(a: SessionTuple, b: SessionTuple): boolean {
  return a.player_id === b.player_id && a.genre === b.genre && a.world === b.world;
}

function isSessionBoundary(prev: TurnCompleteFields | null, curr: TurnCompleteFields): boolean {
  if (!prev) return false;
  if (!sameSession(prev, curr)) return true;
  // turn_id reset within the same (player_id, genre, world) tuple — almost
  // certainly a fresh character or fresh session in the same world.
  const prevId = prev.turn_id ?? 0;
  const currId = curr.turn_id ?? 0;
  if (currId > 0 && prevId > 0 && currId < prevId) return true;
  return false;
}

function sessionLabel(f: TurnCompleteFields, startTime?: string): string {
  const parts: string[] = [];
  if (f.player_id) parts.push(f.player_id);
  if (f.genre) parts.push(f.genre);
  if (f.world) parts.push(f.world);
  const base = parts.length > 0 ? parts.join(" · ") : "session";
  if (startTime) {
    // Render as HH:MM in the user's local time. Bare server timestamp would
    // be ISO with timezone, just clip the time portion as a quick hint.
    const t = new Date(startTime);
    if (!isNaN(t.getTime())) {
      const hh = t.getHours().toString().padStart(2, "0");
      const mm = t.getMinutes().toString().padStart(2, "0");
      return `${base} · ${hh}:${mm}`;
    }
  }
  return base;
}

function SessionDivider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 10px 4px",
        color: THEME.muted,
        fontFamily: SERIF,
        fontVariant: "small-caps",
        fontSize: 11,
        letterSpacing: "0.06em",
      }}
    >
      <div style={{ flex: 1, height: 1, background: THEME.rule }} />
      <span>── {label} ──</span>
      <div style={{ flex: 1, height: 1, background: THEME.rule }} />
    </div>
  );
}

function renderTurnList(
  turns: WatcherEvent[],
  selectedTurn: number | null,
  onSelectTurn: (index: number) => void,
): React.ReactNode {
  // Walk turns in CHRONOLOGICAL order to compute session boundaries, then
  // emit them in REVERSE order (newest at top) to match the existing layout.
  // We label each turn with whether it starts a new session (boundary === true)
  // and what the session header looks like.
  type Item = {
    index: number;
    fields: TurnCompleteFields;
    isBoundary: boolean;
    sessionHeader: string | null;
  };
  const items: Item[] = [];
  let prev: TurnCompleteFields | null = null;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    const f = t.fields as TurnCompleteFields;
    const boundary = isSessionBoundary(prev, f);
    items.push({
      index: i,
      fields: f,
      isBoundary: boundary || prev === null,
      sessionHeader: boundary || prev === null ? sessionLabel(f, t.timestamp) : null,
    });
    prev = f;
  }

  return [...items].reverse().map((item) => {
    const { index: i, fields: f, isBoundary, sessionHeader } = item;
    const dur = ((f.agent_duration_ms || 0) / 1000).toFixed(1);
    const agent = f.agent_name || "?";
    const isSelected = selectedTurn === i;
    return (
      <React.Fragment key={`turn-${i}`}>
        <div
          onClick={() => onSelectTurn(i)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "5px 9px",
            cursor: "pointer",
            fontFamily: SERIF,
            fontSize: 12.5,
            color: isSelected ? THEME.ink : THEME.muted,
            borderLeft: `2px solid ${isSelected ? THEME.accent : "transparent"}`,
            background: isSelected ? "rgba(255,255,255,0.04)" : "transparent",
          }}
        >
          <span>
            #{f.turn_id ?? i + 1} {agent}
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: f.is_degraded ? THEME.accent : isSelected ? THEME.inkDim : THEME.muted,
            }}
          >
            {dur}s
          </span>
        </div>
        {/* Divider goes ABOVE the boundary turn in chronological order, which
            in the rendered (reversed) order means BELOW the row in the DOM.
            That puts the divider visually between this row and the older row
            below it, matching how the user reads the list top-down. */}
        {isBoundary && sessionHeader && <SessionDivider label={sessionHeader} />}
      </React.Fragment>
    );
  });
}
