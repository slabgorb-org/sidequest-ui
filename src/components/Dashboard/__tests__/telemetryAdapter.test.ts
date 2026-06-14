import { describe, expect, it } from "vitest";
import {
  telemetryRowToWatcherEvent,
  buildEventArrayView,
} from "../source/telemetryAdapter";
import type { TelemetryRow } from "../source/types";

const rows: TelemetryRow[] = [
  { seq: 1, component: "narrator", event_type: "prompt_assembled", ts: "2026-06-14T00:00:00Z", fields: { total_tokens: 100 } },
  { seq: 2, component: "lore", event_type: "lore_retrieval", ts: "2026-06-14T00:00:01Z", fields: { budget: 500 } },
  { seq: 3, component: "orchestrator", event_type: "turn_complete", ts: "2026-06-14T00:00:02Z", fields: { agent_duration_ms: 1200 } },
  { seq: 4, component: "encounter", event_type: "state_transition", ts: "2026-06-14T00:00:03Z", fields: { metric: 2 } },
];

describe("telemetryRowToWatcherEvent", () => {
  it("maps a row to a WatcherEvent with info severity", () => {
    const ev = telemetryRowToWatcherEvent(rows[0]);
    expect(ev.component).toBe("narrator");
    expect(ev.event_type).toBe("prompt_assembled");
    expect(ev.severity).toBe("info");
    expect(ev.timestamp).toBe("2026-06-14T00:00:00Z");
    expect(ev.fields.total_tokens).toBe(100);
  });
});

describe("buildEventArrayView", () => {
  it("partitions rows into the per-tab arrays the live tabs expect", () => {
    const view = buildEventArrayView(rows);
    expect(view.allEvents).toHaveLength(4);
    expect(view.promptEvents).toHaveLength(1);
    expect(view.loreEvents).toHaveLength(1);
    expect(view.turns).toHaveLength(1);
    expect(view.componentMap["encounter"]).toHaveLength(1);
    expect(view.componentMap["narrator"][0].event_type).toBe("prompt_assembled");
  });
});
