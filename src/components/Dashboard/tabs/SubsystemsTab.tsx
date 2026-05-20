import React, { useState, useMemo } from "react";
import type { WatcherEvent } from "@/types/watcher";
import { THEME, COMP_COLORS, safeStr } from "../shared/constants";

interface Props {
  allEvents: WatcherEvent[];
  componentMap: Record<string, WatcherEvent[]>;
  turnCount: number;
}

export function SubsystemsTab({ allEvents, componentMap, turnCount }: Props) {
  const [selectedComp, setSelectedComp] = useState<string | null>(null);

  // Build turn buckets: events between consecutive TurnComplete events
  const turnBuckets = useMemo(() => {
    const buckets: WatcherEvent[][] = [[]];
    for (const ev of allEvents) {
      buckets[buckets.length - 1].push(ev);
      if (safeStr(ev.event_type) === "turn_complete") {
        buckets.push([]);
      }
    }
    return buckets.filter((b) => b.length > 0);
  }, [allEvents]);

  const components = useMemo(() => Object.keys(componentMap).sort(), [componentMap]);

  // Build activity grid data: last 20 turns
  const gridTurns = turnBuckets.slice(-20);
  const gridData = useMemo(() => {
    return components.map((comp) => {
      const cells = gridTurns.map((bucket) => {
        const compEvents = bucket.filter((e) => e.component === comp);
        if (compEvents.length === 0) return "empty";
        if (compEvents.some((e) => e.severity === "error")) return "error";
        // Story 54-8: lie-detector events (the narrator referenced a
        // location entity not in the manifest) are info-severity at the
        // server but represent a contract violation. The route extractor
        // in sidequest-server/sidequest/telemetry/spans/location.py sets
        // fields.is_lie_detector=true; the UI promotes the cell to warn
        // (amber) so Keith can spot narrator drift at a glance. ADR-031
        // keeps colour logic in one place — read the explicit boolean,
        // do not re-derive from raw attributes.
        if (
          compEvents.some(
            (e) =>
              e.severity === "warning" ||
              (e.fields &&
                (e.fields as Record<string, unknown>).is_lie_detector ===
                  true),
          )
        )
          return "warn";
        return "ok";
      });
      return { comp, cells };
    });
  }, [components, gridTurns]);

  // Silence detection: components not seen in last 5 turns.
  //
  // Playtest 2026-04-11 note: "SILENT" is a NOISE label, not a BROKEN label.
  // Many subsystems only fire during specific phases (character_creation,
  // chargen, inventory, render, session_restore, world_materialization, etc.)
  // and will naturally go quiet during ordinary turn-by-turn play. Keith
  // flagged that "16 events labeled SILENT is confusing" — the fix is to
  // explain it via tooltip (see SILENT badges below) so operators know it
  // means "idle, not failed."
  const silentComponents = useMemo(() => {
    if (turnBuckets.length < 5) return new Set<string>();
    const recent = turnBuckets.slice(-5);
    const recentComps = new Set(recent.flat().map((e) => e.component));
    return new Set(components.filter((c) => !recentComps.has(c)));
  }, [components, turnBuckets]);

  // Tooltip text used by both SILENT badges (Activity Grid label and the
  // Component Summary status column). Single source of truth so the two
  // sites can't drift.
  const SILENT_TOOLTIP =
    "No events from this subsystem in the last 5 turns. " +
    "This usually means the subsystem is idle (e.g. chargen and " +
    "session_restore only fire on connect; render only fires when an " +
    "image is queued), NOT that it's broken. Click the row to see the " +
    "subsystem's most recent events.";

  // Component summary
  const summary = useMemo(() => {
    return components.map((comp) => {
      const events = componentMap[comp] || [];
      const errors = events.filter((e) => e.severity === "error").length;
      const warns = events.filter((e) => e.severity === "warning").length;
      const lastIdx = events.length > 0 ? turnCount : 0;
      const isSilent = silentComponents.has(comp);
      return { comp, total: events.length, errors, warns, lastIdx, isSilent };
    });
  }, [components, componentMap, turnCount, silentComponents]);

  // Detail drawer events
  const detailEvents = selectedComp
    ? (componentMap[selectedComp] || []).slice(-20)
    : [];

  return (
    <div style={{ padding: 16 }}>
      {/* Activity Grid */}
      <Card title={`Activity Grid (last ${gridTurns.length} turns)`}>
        {gridData.length === 0 ? (
          <div style={{ color: THEME.muted }}>Waiting for events...</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `120px repeat(${gridTurns.length}, 24px)`,
              gap: 2,
              fontSize: 11,
            }}
          >
            {/* Header row */}
            <div />
            {gridTurns.map((_, i) => (
              <div
                key={i}
                style={{
                  textAlign: "center",
                  color: THEME.muted,
                  fontSize: 9,
                }}
              >
                T{turnBuckets.length - gridTurns.length + i + 1}
              </div>
            ))}

            {/* Data rows */}
            {gridData.map(({ comp, cells }) => (
              <React.Fragment key={comp}>
                <div
                  style={{
                    textAlign: "right",
                    paddingRight: 8,
                    color: COMP_COLORS[comp] || THEME.muted,
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedComp(comp === selectedComp ? null : comp)}
                >
                  {comp}
                  {silentComponents.has(comp) && (
                    <span
                      title={SILENT_TOOLTIP}
                      style={{
                        color: THEME.amber,
                        fontSize: 10,
                        marginLeft: 4,
                        cursor: "help",
                      }}
                    >
                      IDLE
                    </span>
                  )}
                </div>
                {cells.map((cell, ci) => (
                  <div
                    key={`${comp}-${ci}`}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 9,
                      ...cellStyle(cell),
                    }}
                  >
                    {cell === "ok" ? "●" : cell === "warn" ? "◆" : cell === "error" ? "✕" : "·"}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </Card>

      {/* Summary Table */}
      <Card title="Component Summary">
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: THEME.muted }}>
              <th style={thStyle}>Component</th>
              <th style={thStyle}>Events</th>
              <th style={thStyle}>Errors</th>
              <th style={thStyle}>Warns</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr
                key={s.comp}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedComp(s.comp === selectedComp ? null : s.comp)}
              >
                <td style={{ ...tdStyle, color: COMP_COLORS[s.comp] || THEME.text }}>
                  {s.comp}
                </td>
                <td style={tdStyle}>{s.total}</td>
                <td style={{ ...tdStyle, color: s.errors > 0 ? THEME.red : THEME.text }}>
                  {s.errors}
                </td>
                <td style={{ ...tdStyle, color: s.warns > 0 ? THEME.amber : THEME.text }}>
                  {s.warns}
                </td>
                <td style={tdStyle}>
                  {s.isSilent ? (
                    <span
                      title={SILENT_TOOLTIP}
                      style={{ color: THEME.amber, cursor: "help" }}
                    >
                      ⊘ IDLE
                    </span>
                  ) : s.errors > 0 ? (
                    <span style={{ color: THEME.red }}>✕ ERROR</span>
                  ) : (
                    <span style={{ color: THEME.green }}>✓ OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Detail Drawer */}
      {selectedComp && detailEvents.length > 0 && (
        <Card title={`${selectedComp} — last ${detailEvents.length} events`}>
          {detailEvents.map((ev, i) => (
            <div
              key={i}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                borderLeft: `3px solid ${ev.severity === "error" ? THEME.red : ev.severity === "warning" ? THEME.amber : THEME.border}`,
                marginBottom: 1,
              }}
            >
              <span style={{ color: THEME.teal }}>{safeStr(ev.event_type)}</span>{" "}
              <span style={{ color: THEME.muted }}>
                {Object.entries(ev.fields)
                  .filter(([, v]) => typeof v !== "object")
                  .map(([k, v]) => `${k}=${String(v)}`)
                  .join(" ")}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function cellStyle(type: string): React.CSSProperties {
  switch (type) {
    case "ok":
      return { background: "rgba(76,175,80,0.3)", color: THEME.green };
    case "warn":
      return { background: "rgba(255,152,0,0.3)", color: THEME.amber };
    case "error":
      return { background: "rgba(244,67,54,0.3)", color: THEME.red };
    default:
      return { background: "rgba(51,51,51,0.3)", color: THEME.muted };
  }
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

const thStyle: React.CSSProperties = { textAlign: "left", padding: "4px 8px" };
const tdStyle: React.CSSProperties = { padding: "4px 8px" };
