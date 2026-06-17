import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { WatcherEvent, SessionStateView } from "@/types/watcher";

// Capture the onEvent callback useLiveSource registers with the watcher socket,
// so the test can drive the live span stream directly.
let driveEvent: ((ev: WatcherEvent) => void) | null = null;
vi.mock("@/hooks/useWatcherSocket", () => ({
  useWatcherSocket: ({ onEvent }: { onEvent: (ev: WatcherEvent) => void }) => {
    driveEvent = onEvent;
    return { connected: true };
  },
}));

import { useLiveSource } from "../source/useLiveSource";

const ACTIVE = "2026-06-16-annees_folles-5cbe9403";
const OTHER = "2026-06-13-flickering_reach-4b38c316";

// Two concurrent sessions; ACTIVE has the newer last_activity_ts so the Live
// view's activeSlug resolves to it.
const DEBUG_STATE: SessionStateView[] = [
  {
    session_key: OTHER,
    genre_slug: "mutant_wasteland",
    world_slug: "flickering_reach",
    current_location: "",
    discovered_regions: [],
    narration_history_len: 0,
    turn_mode: "solo",
    npc_registry: [],
    trope_states: [],
    players: [],
    player_count: 1,
    has_music_director: false,
    has_audio_mixer: false,
    region_names: [],
    last_activity_ts: 100,
  },
  {
    session_key: ACTIVE,
    genre_slug: "pulp_noir",
    world_slug: "annees_folles",
    current_location: "",
    discovered_regions: [],
    narration_history_len: 0,
    turn_mode: "solo",
    npc_registry: [],
    trope_states: [],
    players: [],
    player_count: 1,
    has_music_director: false,
    has_audio_mixer: false,
    region_names: [],
    last_activity_ts: 200,
  },
];

function turnComplete(slug: string | null, turnId: number): WatcherEvent {
  return {
    timestamp: "t",
    component: "orchestrator",
    event_type: "turn_complete",
    severity: "info",
    session_slug: slug,
    fields: { turn_id: turnId, agent_name: "narrator" },
  };
}

function stateTransition(slug: string | null, kind: string): WatcherEvent {
  return {
    timestamp: "t",
    component: "npc_registry",
    event_type: "state_transition",
    severity: "info",
    session_slug: slug,
    fields: { kind },
  };
}

beforeEach(() => {
  driveEvent = null;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("/api/debug/state")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(DEBUG_STATE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("useLiveSource per-session scoping (OTEL-INSPECTOR)", () => {
  it("scopes turns + events to the active session and drops other sessions' bleed", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.activeSlug).toBe(ACTIVE));

    act(() => {
      driveEvent!(turnComplete(OTHER, 7)); // concurrent world — must NOT show
      driveEvent!(turnComplete(ACTIVE, 1)); // active session — must show
      driveEvent!(stateTransition(OTHER, "npc_pool")); // bleed — must be filtered
      driveEvent!(stateTransition(ACTIVE, "location")); // active — must show
    });

    // Only the active session's turn survives.
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]!.session_slug).toBe(ACTIVE);

    // No event from the OTHER session leaks into the scoped stream.
    expect(
      result.current.allEvents.some((e) => e.session_slug === OTHER),
    ).toBe(false);
    expect(
      result.current.allEvents.some((e) => e.session_slug === ACTIVE),
    ).toBe(true);

    // componentMap is derived from the scoped stream — no bleed there either.
    for (const evs of Object.values(result.current.componentMap)) {
      expect(evs.every((e) => e.session_slug !== OTHER)).toBe(true);
    }

    // selectedTurn indexes the SCOPED turn list and points at the active turn.
    expect(result.current.selectedTurn).toBe(0);
    expect(
      result.current.turns[result.current.selectedTurn!]!.session_slug,
    ).toBe(ACTIVE);
  });

  it("keeps session-less infra events visible in every session view", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.activeSlug).toBe(ACTIVE));

    const infra: WatcherEvent = {
      timestamp: "t",
      component: "sidequest-server",
      event_type: "agent_span_open",
      severity: "info",
      session_slug: null, // watcher.connected / replay marker — global
      fields: { name: "watcher.connected" },
    };
    act(() => {
      driveEvent!(infra);
      driveEvent!(stateTransition(OTHER, "npc_pool")); // bleed — filtered
    });

    expect(
      result.current.allEvents.some(
        (e) => e.fields["name"] === "watcher.connected",
      ),
    ).toBe(true);
    expect(
      result.current.allEvents.some((e) => e.session_slug === OTHER),
    ).toBe(false);
  });

  it("synthesizes a turn from an orchestrator.process_action span close carrying the slug", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.activeSlug).toBe(ACTIVE));

    const spanClose = (slug: string): WatcherEvent => ({
      timestamp: "t",
      component: "sidequest-server",
      event_type: "agent_span_close",
      severity: "info",
      session_slug: slug,
      fields: { name: "orchestrator.process_action", duration_ms: 1234 },
    });

    act(() => {
      driveEvent!(spanClose(OTHER)); // synthesized turn for OTHER — filtered out
      driveEvent!(spanClose(ACTIVE)); // synthesized turn for ACTIVE — shown
    });

    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]!.session_slug).toBe(ACTIVE);
    expect(result.current.turns[0]!.event_type).toBe("turn_complete");
  });
});
