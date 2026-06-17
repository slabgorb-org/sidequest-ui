// Mirrors the Python WatcherEvent contract emitted by:
//   - sidequest-server/sidequest/telemetry/spans.py (SPAN_ROUTES)
//   - sidequest-server/sidequest/server/watcher.py  (WatcherSpanProcessor)
//   - sidequest-server/sidequest/telemetry/validator.py (Layer-3 events)
// See ADR-031 (Game Watcher) and ADR-089 (Dashboard Restoration).
export type WatcherEventType =
  | "agent_span_open"
  | "agent_span_close"
  | "validation_warning"
  | "subsystem_exercise_summary"
  | "coverage_gap"
  | "json_extraction_result"
  | "state_transition"
  | "turn_complete"
  | "lore_retrieval"
  | "prompt_assembled"
  | "game_state_snapshot";

/** Mirrors Python Severity. */
export type Severity = "info" | "warning" | "error";

/** A watcher telemetry event from the Python API's /ws/watcher stream. */
export interface WatcherEvent {
  timestamp: string;
  component: string;
  event_type: WatcherEventType;
  severity: Severity;
  /** Live-view partition key: the slug (== SessionStateView.session_key) of the
   *  session that produced this event. The /ws/watcher stream fans out EVERY
   *  session's spans to EVERY dashboard, so the Live view scopes on this to keep
   *  concurrent worlds from bleeding into one timeline (OTEL-INSPECTOR,
   *  2026-06-16). `null`/absent = session-less infra (watcher.connected, replay
   *  markers) — global, shown in every session view. NOT the integer
   *  `session_id` row id, which lives in `fields` on some spans. */
  session_slug?: string | null;
  fields: Record<string, unknown>;
}

/** Span data embedded in TurnComplete events. */
export interface TurnSpan {
  name: string;
  component: string;
  start_ms: number;
  duration_ms: number;
  /** Dependency-tree depth (0 = the turn-root container). Added 124-2 so the
   *  flame chart can nest caller▸callee. Absent on older servers — the chart
   *  falls back to a flat one-row-per-span Gantt when no span carries it. */
  depth?: number;
  /** False for container spans (work that nests deeper), true for leaf work.
   *  Drives the Tufte container-vs-leaf opacity layering. Absent ⇒ treated as
   *  leaf (the flat fallback). Read with `=== false`, never `||` — a real
   *  `leaf: false` container must not collapse to a leaf. */
  leaf?: boolean;
}

/** Fields on a TurnComplete event. */
export interface TurnCompleteFields {
  turn_id?: number;
  turn_number?: number;
  agent_name?: string;
  agent_duration_ms?: number;
  total_duration_ms?: number;
  is_degraded?: boolean;
  token_count_in?: number;
  token_count_out?: number;
  extraction_tier?: string;
  player_input?: string;
  patches?: Array<{ patch_type: string; fields_changed?: string[] }>;
  beats_fired?: Array<{ trope: string; threshold?: number }>;
  spans?: TurnSpan[];
  delta_empty?: boolean;
  /** Player who took this turn. Used for session grouping in the timeline. */
  player_id?: string;
  /** Genre slug for the active session. Added playtest 2026-04-11 to enable
   *  session-divider rendering when the same player has Turn #1 from two
   *  different worlds in the timeline. */
  genre?: string;
  /** World slug for the active session. See `genre` comment. */
  world?: string;
  /** Per-phase wall-clock breakdown of the turn pipeline. Map keys are
   *  phase names (e.g. "preprocess_llm", "narrator_subprocess", "broadcast");
   *  values are milliseconds. Emitted by the validator when the server has
   *  the phase-timing instrumentation. Absent on older servers. */
  phase_durations_ms?: Record<string, number>;
  /** Per-phase entry counts. Distinguishes single calls from retries
   *  (e.g. `{preprocess_llm: 2}` indicates a retry). */
  phase_call_counts?: Record<string, number>;
  /** Wall-clock not attributed to any named phase. Surfaces instrumentation
   *  gaps. Always >= 0 (clamped at the validator boundary). */
  _unaccounted_ms?: number;
}


// --- Debug state endpoint types (GET /api/debug/state) ---

export interface PlayerStateView {
  player_name: string;
  character_name: string | null;
  character_class: string;
  character_hp: number;
  character_max_hp: number;
  character_level: number;
  character_xp: number;
  region_id: string;
  display_location: string;
  inventory: InventoryView;
}

export interface InventoryView {
  items: ItemView[];
  gold: number;
}

export interface ItemView {
  id: string;
  name: string;
  description: string;
  narrative_weight: number;
  state: string;
  source_turn: number;
  tags: string[];
}

export interface TropeStateView {
  trope_definition_id: string;
  status: string;
  progression: number;
}

export interface NpcRegistryEntry {
  name: string;
  pronouns: string;
  role: string;
  location: string;
  last_seen_turn: number;
  age: string;
  appearance: string;
  ocean_summary?: string | null;
  ocean?: Record<string, unknown>;
  hp: number;
  max_hp: number;
}

export interface SessionStateView {
  session_key: string;
  genre_slug: string;
  world_slug: string;
  current_location: string;
  discovered_regions: string[];
  narration_history_len: number;
  turn_mode: string;
  npc_registry: NpcRegistryEntry[];
  trope_states: TropeStateView[];
  players: PlayerStateView[];
  player_count: number;
  has_music_director: boolean;
  has_audio_mixer: boolean;
  region_names: [string, string][];
  /** Save-file mtime in ms since epoch. Added 2026-04-24 so the State tab
   *  can pick the most-recently-touched session when multiple saves exist.
   *  Optional for back-compat with servers that haven't deployed yet. */
  last_activity_ts?: number;
}
