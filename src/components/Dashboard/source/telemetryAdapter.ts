import type { WatcherEvent, WatcherEventType } from "@/types/watcher";
import type { TelemetryRow, EventArrayView } from "./types";

/** A persisted telemetry row is structurally a WatcherEvent minus severity. */
export function telemetryRowToWatcherEvent(row: TelemetryRow): WatcherEvent {
  return {
    timestamp: row.ts,
    component: row.component,
    // Persisted event_type strings are a superset of WatcherEventType (e.g.
    // "census"); the consuming tabs treat unknown types as opaque strings.
    event_type: row.event_type as WatcherEventType,
    severity: "info",
    fields: row.fields,
  };
}

/** Build the per-tab WatcherEvent arrays the live tabs consume, from rows. */
export function buildEventArrayView(rows: TelemetryRow[]): EventArrayView {
  const allEvents = rows.map(telemetryRowToWatcherEvent);
  const componentMap: Record<string, WatcherEvent[]> = {};
  for (const ev of allEvents) {
    const comp = ev.component || "unknown";
    (componentMap[comp] ??= []).push(ev);
  }
  return {
    allEvents,
    componentMap,
    turns: allEvents.filter((e) => e.event_type === "turn_complete"),
    promptEvents: allEvents.filter((e) => e.event_type === "prompt_assembled"),
    loreEvents: allEvents.filter((e) => e.event_type === "lore_retrieval"),
  };
}
