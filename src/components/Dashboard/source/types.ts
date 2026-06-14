import type { WatcherEvent } from "@/types/watcher";

/** The nine lenses the Inspector exposes (one per tab). */
export type Lens =
  | "timeline"
  | "state"
  | "subsystems"
  | "timing"
  | "console"
  | "prompt"
  | "lore"
  | "encounters"
  | "mechanical";

export const ALL_LENSES: Lens[] = [
  "timeline",
  "state",
  "subsystems",
  "timing",
  "console",
  "prompt",
  "lore",
  "encounters",
  "mechanical",
];

export type SourceKind = "live" | "forensic";

// Phase 1: BOTH sources expose all nine lenses — this is intentional, not an
// oversight. Forensic data is round-scoped (not lens-restricted), and the live
// `mechanical` lens renders a placeholder. The two sets are kept as distinct
// named constants because Phase 2 capability-gating may diverge them.
export const LIVE_CAPABILITIES: ReadonlySet<Lens> = new Set<Lens>([
  "timeline",
  "state",
  "subsystems",
  "timing",
  "console",
  "prompt",
  "lore",
  "encounters",
  "mechanical",
]);

export const FORENSIC_CAPABILITIES: ReadonlySet<Lens> = new Set<Lens>(ALL_LENSES);

// --- Forensic REST shapes (mirror PgForensicReader, sidequest-server) ---

/** GET /api/debug/saves — one entry per save. */
export interface ForensicSaveEntry {
  slug: string;
  genre: string;
  world: string;
  created_at: string;
  last_played: string;
  last_activity_ts: number;
  telemetry_rows: number;
  mechanical_rows: number;
}

/** GET /api/debug/save/{slug}/timeline — one entry per round. */
export interface ForensicTimelineRound {
  round: number;
  seq_start: number | null;
  seq_end: number | null;
  event_kind_counts: Record<string, number>;
  narrative_authors: string[];
  ts: string;
}

/** A persisted turn_telemetry row (inside the bundle's `telemetry.rows`). */
export interface TelemetryRow {
  seq: number;
  component: string;
  event_type: string;
  ts: string;
  fields: Record<string, unknown>;
}

export interface TelemetryFold {
  rows: TelemetryRow[];
  by_component: Record<string, Record<string, number>>;
  total: number;
  unparseable_seqs: number[];
}

export interface PcMechanicalDiff {
  player_id: string;
  character_name: string;
  seat: number;
  kind: "baseline" | "static" | "moved";
  deltas: Array<[string, string]>;
  absolute?: Record<string, unknown>;
}

export interface ForensicMechanical {
  state: "absent" | "static" | "moved";
  pcs: PcMechanicalDiff[];
  trope:
    | {
        summary: string;
        kind: string;
        turns_since_meaningful: number | null;
        total_beats_fired: number | null;
      }
    | null;
  unparseable_seqs: number[];
}

/** GET /api/debug/save/{slug}/turn/{round} — the full drilldown bundle. */
export interface ForensicBundle {
  round: number;
  narrative: Array<{
    round: number;
    author: string;
    content: string;
    tags: unknown;
    created_at: string;
  }>;
  events: Array<{
    seq: number;
    kind: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
  derived: Record<
    string,
    { value: { summary?: string; category?: string }; source_seqs: number[] }
  >;
  projection: Array<{
    event_seq: number;
    player_id: string;
    include: boolean;
    payload: Record<string, unknown>;
  }>;
  scrapbook: Array<Record<string, unknown>>;
  unparseable_seqs: number[];
  telemetry: TelemetryFold;
  mechanical: ForensicMechanical;
}

/** GET /api/debug/save/{slug}/snapshot — raw game_state.snapshot_json (shape varies). */
export type ForensicSnapshot = Record<string, unknown>;

/** What the shell passes to event-array tabs, regardless of source. */
export interface EventArrayView {
  turns: WatcherEvent[];
  allEvents: WatcherEvent[];
  componentMap: Record<string, WatcherEvent[]>;
  promptEvents: WatcherEvent[];
  loreEvents: WatcherEvent[];
}
