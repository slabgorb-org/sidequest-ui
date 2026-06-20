import { useReducer, useCallback, useEffect, useMemo, useState } from "react";
import { useWatcherSocket } from "@/hooks/useWatcherSocket";
import type { WatcherEvent, SessionStateView } from "@/types/watcher";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DashboardState {
  activeTab: number;
  paused: boolean;
  turns: WatcherEvent[];
  allEvents: WatcherEvent[];
  componentMap: Record<string, WatcherEvent[]>;
  selectedTurn: number | null;
  promptEvents: WatcherEvent[];
  loreEvents: WatcherEvent[];
  debugState: SessionStateView[] | null;
  /** In-progress turn context accumulated from OTEL span closes between
   *  one `orchestrator.process_action` boundary and the next. Used to
   *  synthesize a `turn_complete` event when the server never emits a
   *  semantic one (playtest 2026-04-24 — the semantic path was missing
   *  from live traffic; only span closes reached the dashboard). */
  pendingTurn: PendingTurnContext;
  /** Server-provided turn identifiers we've already accounted for, so a
   *  real `turn_complete` following a synthesized one doesn't double-count. */
  seenTurnKeys: Set<string>;
}

interface PendingTurnContext {
  turnId: string | null;
  playerId: string | null;
  genre: string | null;
  world: string | null;
  inferenceDurationMs: number | null;
  model: string | null;
}

const emptyPending: PendingTurnContext = {
  turnId: null,
  playerId: null,
  genre: null,
  world: null,
  inferenceDurationMs: null,
  model: null,
};

const initialState: DashboardState = {
  activeTab: 0,
  paused: false,
  turns: [],
  allEvents: [],
  componentMap: {},
  selectedTurn: null,
  promptEvents: [],
  loreEvents: [],
  debugState: null,
  pendingTurn: { ...emptyPending },
  seenTurnKeys: new Set(),
};

type Action =
  | { type: "SET_TAB"; tab: number }
  | { type: "TOGGLE_PAUSE" }
  | { type: "CLEAR" }
  | { type: "EVENT"; event: WatcherEvent }
  | { type: "SET_DEBUG_STATE"; data: SessionStateView[] }
  | { type: "SELECT_TURN"; index: number | null };

/**
 * Turn aggregator — playtest 2026-04-24 regression.
 *
 * The dashboard originally gated the Turns counter + Timeline / Timing /
 * Prompt / Lore tabs on receiving a semantic `turn_complete` event.
 * Under production traffic, those events stopped reaching the stream
 * (the upstream publish never ran) but OTEL span closes kept flowing —
 * including `orchestrator.process_action`, which is the canonical top-level
 * span wrapping every turn. We now treat that span close as a turn
 * boundary: accumulate contextual attributes from intermediate spans
 * (`narrator.canonical_leak_audit` carries `turn_id`, `player_id`, genre,
 * world; `turn.agent_llm.inference` carries duration + model), and on
 * `orchestrator.process_action` close, synthesize a `turn_complete`
 * WatcherEvent from the accumulated context. If the server later emits
 * a real `turn_complete` for the same turn, dedupe via `seenTurnKeys`.
 */
function extractTurnKey(fields: Record<string, unknown>): string | null {
  const turnId = fields["turn_id"];
  if (typeof turnId === "string" && turnId.length > 0) return turnId;
  // Numeric turn_id (semantic event) → stringified key.
  if (typeof turnId === "number") return String(turnId);
  return null;
}

function synthesizeTurnComplete(
  closingEvent: WatcherEvent,
  pending: PendingTurnContext,
): WatcherEvent {
  const fields: Record<string, unknown> = {
    turn_id: pending.turnId,
    player_id: pending.playerId,
    genre: pending.genre,
    world: pending.world,
    agent_name: "narrator",
    agent_duration_ms:
      pending.inferenceDurationMs ??
      (typeof closingEvent.fields["duration_ms"] === "number"
        ? (closingEvent.fields["duration_ms"] as number)
        : null),
    total_duration_ms:
      typeof closingEvent.fields["duration_ms"] === "number"
        ? (closingEvent.fields["duration_ms"] as number)
        : pending.inferenceDurationMs,
    is_degraded: false,
    synthesized: true, // Breadcrumb for debugging: this came from span-close, not a semantic emit.
  };
  return {
    timestamp: closingEvent.timestamp,
    component: "orchestrator",
    event_type: "turn_complete",
    severity: "info",
    // Carry the closing span's session slug so the synthesized turn survives the
    // Live view's per-session filter (OTEL-INSPECTOR, 2026-06-16).
    session_slug: closingEvent.session_slug ?? null,
    fields,
  };
}

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "TOGGLE_PAUSE":
      return { ...state, paused: !state.paused };
    case "CLEAR":
      return {
        ...initialState,
        activeTab: state.activeTab,
        debugState: state.debugState,
        pendingTurn: { ...emptyPending },
        seenTurnKeys: new Set(),
      };
    case "SELECT_TURN":
      return { ...state, selectedTurn: action.index };
    case "SET_DEBUG_STATE":
      return { ...state, debugState: action.data };
    case "EVENT": {
      if (state.paused) return state;
      const ev = action.event;
      const comp = ev.component || "unknown";
      const compEvents = state.componentMap[comp] ?? [];

      const next: DashboardState = {
        ...state,
        allEvents: [...state.allEvents, ev],
        componentMap: { ...state.componentMap, [comp]: [...compEvents, ev] },
      };

      // --- Semantic events — server-emitted ---
      if (ev.event_type === "turn_complete") {
        const key = extractTurnKey(ev.fields);
        if (key !== null && state.seenTurnKeys.has(key)) {
          // We already synthesized a turn for this key; keep the richer
          // semantic event by replacing the synthesized placeholder.
          const replaceIdx = state.turns.findIndex(
            (t) => extractTurnKey(t.fields) === key,
          );
          if (replaceIdx !== -1) {
            const nextTurns = [...state.turns];
            nextTurns[replaceIdx] = ev;
            next.turns = nextTurns;
          }
        } else {
          next.turns = [...state.turns, ev];
          if (key !== null) {
            next.seenTurnKeys = new Set(state.seenTurnKeys).add(key);
          }
          if (
            state.selectedTurn === null ||
            state.selectedTurn === state.turns.length - 1
          ) {
            next.selectedTurn = next.turns.length - 1;
          }
        }
        next.pendingTurn = { ...emptyPending };
      } else if (ev.event_type === "prompt_assembled") {
        next.promptEvents = [...state.promptEvents, ev];
      } else if (ev.event_type === "lore_retrieval") {
        next.loreEvents = [...state.loreEvents, ev];
      } else if (ev.event_type === "agent_span_close") {
        // --- Span-close turn-aggregator — playtest 2026-04-24 fallback ---
        const spanName = String(ev.fields["name"] ?? "");
        if (spanName === "narrator.canonical_leak_audit") {
          const turnId = ev.fields["turn_id"];
          if (typeof turnId === "string" && turnId.length > 0) {
            // turn_id shape: "<genre>:<world>:<player>:<N>"
            const parts = turnId.split(":");
            next.pendingTurn = {
              ...state.pendingTurn,
              turnId,
              genre: parts[0] ?? state.pendingTurn.genre,
              world: parts[1] ?? state.pendingTurn.world,
              playerId: parts[2] ?? state.pendingTurn.playerId,
            };
          }
        } else if (spanName === "turn.agent_llm.inference") {
          const dur = ev.fields["duration_ms"];
          const model = ev.fields["model"];
          next.pendingTurn = {
            ...state.pendingTurn,
            inferenceDurationMs:
              typeof dur === "number" ? dur : state.pendingTurn.inferenceDurationMs,
            model:
              typeof model === "string" ? model : state.pendingTurn.model,
          };
        } else if (spanName === "orchestrator.process_action") {
          const pending = next.pendingTurn; // includes any updates above in this dispatch
          const key = pending.turnId;
          if (key !== null && state.seenTurnKeys.has(key)) {
            // Already counted via semantic turn_complete; reset and skip.
            next.pendingTurn = { ...emptyPending };
          } else {
            const synthetic = synthesizeTurnComplete(ev, pending);
            next.turns = [...state.turns, synthetic];
            if (key !== null) {
              next.seenTurnKeys = new Set(state.seenTurnKeys).add(key);
            }
            if (
              state.selectedTurn === null ||
              state.selectedTurn === state.turns.length - 1
            ) {
              next.selectedTurn = next.turns.length - 1;
            }
            next.pendingTurn = { ...emptyPending };
          }
        }
      }
      return next;
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Debug state fetcher
// ---------------------------------------------------------------------------

const API_BASE = (() => {
  const loc = window.location;
  const host =
    loc.hostname === "localhost" ? "localhost:8765" : loc.host;
  return `${loc.protocol}//${host}`;
})();

async function fetchDebugState(): Promise<SessionStateView[]> {
  const res = await fetch(`${API_BASE}/api/debug/state`);
  if (!res.ok) throw new Error(`debug/state failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * The live view over the running server: the OTEL watcher socket + the
 * `/api/debug/state` poll, plus the turn-aggregator reducer. Returns the
 * reducer-derived view and the controls the shell/header/tabs drive.
 */
export interface LiveSourceState {
  activeTab: number;
  turns: WatcherEvent[];
  allEvents: WatcherEvent[];
  componentMap: Record<string, WatcherEvent[]>;
  promptEvents: WatcherEvent[];
  loreEvents: WatcherEvent[];
  debugState: SessionStateView[] | null;
  selectedTurn: number | null;
  paused: boolean;
  connected: boolean;
  /** The session the Live view is scoped to: the operator's explicit pin when
   *  set, else the auto-derived newest-activity session. */
  activeSlug: string | null;
  /** Known live session slugs for the picker (debug-state sessions ∪ any
   *  session that has emitted a slug-tagged event). */
  liveSessions: string[];
  /** Pin the Live view to a specific session; `null` returns to auto-follow. */
  selectSession: (slug: string | null) => void;
  setTab: (tab: number) => void;
  selectTurn: (i: number | null) => void;
  togglePause: () => void;
  clear: () => void;
  refreshState: () => void;
}

export function useLiveSource(): LiveSourceState {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Operator's explicit session pin (story 126-23). When set it overrides
  // auto-follow so a concurrent session that emits later can't steal the Live
  // view away from the session the operator is actually driving.
  const [pinnedSlug, setPinnedSlug] = useState<string | null>(null);

  const onEvent = useCallback((event: WatcherEvent) => {
    dispatch({ type: "EVENT", event });
  }, []);
  const { connected } = useWatcherSocket({ onEvent });

  // Fetch debug state on mount and after each turn.
  const refreshState = useCallback(async () => {
    try {
      const data = await fetchDebugState();
      dispatch({ type: "SET_DEBUG_STATE", data });
    } catch {
      // Dashboard is a dev tool — swallow fetch errors silently.
    }
  }, []);

  // Initial load.
  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // Refresh debug state when turn count changes.
  useEffect(() => {
    if (state.turns.length > 0) {
      refreshState();
    }
  }, [state.turns.length, refreshState]);

  // Test-run sessions (test-*, tool-test) are dropped from every dashboard
  // surface (story 126-34): 41 stale test-* sessions linger under ADR-122
  // never-evict and would otherwise bury the genuinely-driven session and
  // steal auto-follow. The reducer keeps the full set (lossless); only the
  // RETURNED view is filtered — same pattern as the per-session scoping below.
  const visibleDebugState = useMemo<SessionStateView[] | null>(() => {
    if (state.debugState == null) return null;
    return state.debugState.filter((s) => !isTestSession(s.session_key));
  }, [state.debugState]);

  // Auto-derive the newest-activity session slug from the visible (non-test)
  // sessions (same sort logic as StateTab). This is the auto-follow fallback
  // when the operator has not pinned a session.
  const autoSlug = useMemo<string | null>(() => {
    if (!visibleDebugState || visibleDebugState.length === 0) return null;
    const sorted = [...visibleDebugState].sort((a, b) => {
      const aTs = a.last_activity_ts ?? 0;
      const bTs = b.last_activity_ts ?? 0;
      return bTs - aTs;
    });
    return sorted[0].session_key;
  }, [visibleDebugState]);

  // Known live sessions for the picker: the active sessions from debug state,
  // unioned with any session that has emitted a slug-tagged event. Session-less
  // infra (null/"") is excluded — it's global, not a selectable session.
  // Test-run sessions (test-*, tool-test) are excluded from BOTH sources so
  // they never reach the picker (story 126-34).
  const liveSessions = useMemo<string[]>(() => {
    const slugs = new Set<string>();
    for (const s of visibleDebugState ?? []) slugs.add(s.session_key);
    for (const e of state.allEvents) {
      const sid = e.session_slug;
      if (sid != null && sid !== "" && !isTestSession(sid)) slugs.add(sid);
    }
    return [...slugs];
  }, [visibleDebugState, state.allEvents]);

  // The operator's explicit pin wins over auto-follow. The Live view scopes its
  // span stream to this — used by EncounterTab to fetch the live session's
  // encounter events AND as the partition key for the timeline/tabs.
  const activeSlug = pinnedSlug ?? autoSlug;

  const selectSession = useCallback((slug: string | null) => {
    setPinnedSlug(slug);
  }, []);

  // --- Per-session scoping (OTEL-INSPECTOR fix, sq-playtest 2026-06-16) ---
  // The reducer accumulates EVERY session's events (so switching the active
  // session is lossless), but the RETURNED view is scoped to the active slug so
  // a concurrent world's narration/patches don't bleed into the Live timeline.
  // Session-less infra events (no session_slug) are global and always shown.
  const scopedAllEvents = useMemo(
    () => state.allEvents.filter((e) => inActiveSession(e, activeSlug)),
    [state.allEvents, activeSlug],
  );
  const scopedTurns = useMemo(
    () => state.turns.filter((e) => inActiveSession(e, activeSlug)),
    [state.turns, activeSlug],
  );
  const scopedPromptEvents = useMemo(
    () => state.promptEvents.filter((e) => inActiveSession(e, activeSlug)),
    [state.promptEvents, activeSlug],
  );
  const scopedLoreEvents = useMemo(
    () => state.loreEvents.filter((e) => inActiveSession(e, activeSlug)),
    [state.loreEvents, activeSlug],
  );
  const scopedComponentMap = useMemo(() => {
    const m: Record<string, WatcherEvent[]> = {};
    for (const ev of scopedAllEvents) {
      const comp = ev.component || "unknown";
      (m[comp] ??= []).push(ev);
    }
    return m;
  }, [scopedAllEvents]);

  // selectedTurn lives in the reducer as an index into the UNFILTERED turns.
  // Translate it to an index into the scoped turns the timeline actually
  // renders; fall back to the active session's latest turn (auto-follow) when
  // the reducer's selection points at another session's turn.
  const selectedTurn = useMemo<number | null>(() => {
    if (scopedTurns.length === 0) return null;
    const sel = state.selectedTurn;
    if (sel !== null && state.turns[sel]) {
      const idx = scopedTurns.indexOf(state.turns[sel]);
      if (idx >= 0) return idx;
    }
    return scopedTurns.length - 1;
  }, [scopedTurns, state.selectedTurn, state.turns]);

  // The timeline hands back a scoped index; translate it to the unfiltered
  // index the reducer stores.
  const selectTurn = useCallback(
    (i: number | null) => {
      if (i === null) {
        dispatch({ type: "SELECT_TURN", index: null });
        return;
      }
      const ev = scopedTurns[i];
      const idx = ev ? state.turns.indexOf(ev) : null;
      dispatch({ type: "SELECT_TURN", index: idx });
    },
    [scopedTurns, state.turns],
  );

  return {
    activeTab: state.activeTab,
    turns: scopedTurns,
    allEvents: scopedAllEvents,
    componentMap: scopedComponentMap,
    promptEvents: scopedPromptEvents,
    loreEvents: scopedLoreEvents,
    debugState: visibleDebugState,
    selectedTurn,
    paused: state.paused,
    connected,
    activeSlug,
    liveSessions,
    selectSession,
    setTab: (tab) => dispatch({ type: "SET_TAB", tab }),
    selectTurn,
    togglePause: () => dispatch({ type: "TOGGLE_PAUSE" }),
    clear: () => dispatch({ type: "CLEAR" }),
    refreshState,
  };
}

/** Live-view session scoping predicate (OTEL-INSPECTOR fix, 2026-06-16).
 *  Keep an event if no active session is resolved yet (don't hide anything),
 *  if it's session-less infra (global), or if it belongs to the active
 *  session. */
function inActiveSession(
  ev: WatcherEvent,
  activeSlug: string | null,
): boolean {
  if (!activeSlug) return true;
  const sid = ev.session_slug;
  if (sid == null || sid === "") return true;
  return sid === activeSlug;
}

/** Canonical test-run slug prefixes (story 125-10, follow-up to 126-34). MIRRORS
 *  the server's `_TEST_SESSION_SLUG_PREFIXES`
 *  (sidequest-server/sidequest/telemetry/watcher_hub.py). The two are pinned to a
 *  byte-identical fixture by a contract test in each repo
 *  (__tests__/test-session-prefix-contract.test.ts here) so they can't drift —
 *  change BOTH repos' arrays AND the canonical fixture together. */
export const TEST_SESSION_SLUG_PREFIXES = ["test-", "tool-test"] as const;

/** Test-run session predicate (story 126-34). Headless pytest-harness and
 *  tool-driven probe sessions use these slug prefixes; they're kept out of the
 *  live GM dashboard (picker, State tab, auto-follow) so they can't bury the
 *  genuinely-driven session. Mirrors the server's `is_test_session`. */
export function isTestSession(slug: string): boolean {
  return TEST_SESSION_SLUG_PREFIXES.some((prefix) => slug.startsWith(prefix));
}
