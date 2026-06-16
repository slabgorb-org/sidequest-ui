import type {
  WatcherEvent,
  WatcherEventType,
  TurnCompleteFields,
} from "@/types/watcher";
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

/** Per-turn token row with the cached/fresh split joined from prompt_assembled.
 *  Drives the Timing tab's stacked token chart (Story 124-1). */
export interface TurnTokenCacheRow {
  /** 1-based chronological position among turn_complete events. */
  turnIndex: number;
  /** turn_complete.turn_number — display only. NOT a join key (it collides
   *  across sessions in a forensic bundle). */
  turnNumber?: number;
  /** Fresh (non-cached) input tokens = turn_complete.token_count_in. The
   *  Anthropic `input_tokens` is already cache-EXCLUSIVE, so this is NOT
   *  reduced by `cached`. */
  tokensIn: number;
  tokensOut: number;
  /** cache_read from the paired narrator prompt_assembled. `null` = unknown
   *  (non-SDK backend / no paired event) — never fabricate a number for it. */
  cached: number | null;
  /** warm: cache_read > 0. cold: cache_usage present but cache_read === 0 (a
   *  real, known miss). null: cache_usage absent/null (unknown — excluded from
   *  hit-rate, never scored as a miss). */
  cacheState: "warm" | "cold" | "null";
}

/** Minimal shape of the cache_usage object on a prompt_assembled event. */
interface CacheUsageLike {
  cache_read?: number;
}

/** Pair each turn_complete with its narrator prompt_assembled and compute the
 *  cached/fresh split.
 *
 *  Pairing is by STREAM-ORDER ADJACENCY within a session, not by turn_number:
 *  the server emits prompt→turn adjacently per turn, so the most-recent
 *  prompt_assembled before a turn_complete is that turn's own prompt. This is
 *  session-safe — turn_number collides across sessions in a forensic bundle, so
 *  a turn_number join would cross-attribute one session's cache onto another's.
 *
 *  Pass the ordered full event stream (`view.allEvents`). Passing only the
 *  turn_complete array (no prompt events) degrades every row to `null` cache —
 *  fresh-only, no fabrication. */
export function buildTurnTokenCacheRows(
  events: WatcherEvent[],
): TurnTokenCacheRow[] {
  const rows: TurnTokenCacheRow[] = [];
  // The most-recent prompt_assembled seen since the last turn_complete, and
  // whether we have one to consume. `pendingUsage` is the cache_usage value:
  // a dict, explicit null, or undefined (key absent) — all distinct from
  // "no prompt event at all" (havePending === false).
  let havePending = false;
  let pendingUsage: CacheUsageLike | null | undefined;
  let idx = 0;

  for (const ev of events) {
    if (ev.event_type === "prompt_assembled") {
      // A later prompt before the same turn overwrites the earlier one, so the
      // closest-preceding (enriched) event wins over a stale build-time one.
      pendingUsage = (ev.fields as { cache_usage?: CacheUsageLike | null })
        .cache_usage;
      havePending = true;
      continue;
    }
    if (ev.event_type !== "turn_complete") continue;

    idx += 1;
    const f = ev.fields as TurnCompleteFields;
    const tokensIn = f.token_count_in ?? 0;
    const tokensOut = f.token_count_out ?? 0;

    let cached: number | null = null;
    let cacheState: TurnTokenCacheRow["cacheState"] = "null";
    if (
      havePending &&
      pendingUsage != null &&
      typeof pendingUsage.cache_read === "number"
    ) {
      cached = pendingUsage.cache_read;
      // `cache_read === 0` is a KNOWN zero (cold), not an unknown — use the
      // numeric value, never a `|| null` falsy collapse (lang-review #4).
      cacheState = cached > 0 ? "warm" : "cold";
    }

    rows.push({
      turnIndex: idx,
      turnNumber: f.turn_number,
      tokensIn,
      tokensOut,
      cached,
      cacheState,
    });

    // Consume this turn's prompt; a following turn with no prompt of its own
    // stays null (never re-uses a prior turn's cache).
    havePending = false;
    pendingUsage = undefined;
  }

  return rows;
}
