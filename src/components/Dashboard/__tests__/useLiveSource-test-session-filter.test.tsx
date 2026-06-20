import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { WatcherEvent, SessionStateView } from "@/types/watcher";

// Story 126-34 — keep test-run sessions (test-*, tool-test) out of the live GM
// dashboard. The liveSessions picker and the State-tab debugState must drop
// test/tool sessions so 41 stale test-* sessions (ADR-122 never-evict) can't
// push the genuinely-driven session off-screen.
//
// Drives the real hook (renderHook) — the production consumer — with a mocked
// watcher socket + stubbed /api/debug/state, exactly like
// useLiveSource-session-scope.test.tsx.

let driveEvent: ((ev: WatcherEvent) => void) | null = null;
vi.mock("@/hooks/useWatcherSocket", () => ({
  useWatcherSocket: ({ onEvent }: { onEvent: (ev: WatcherEvent) => void }) => {
    driveEvent = onEvent;
    return { connected: true };
  },
}));

import { useLiveSource } from "../source/useLiveSource";

const REAL = "2026-06-16-annees_folles-5cbe9403";
const TEST_SLUG = "test-pulp_noir-deadbeef"; // headless pytest / harness session
const TOOL_SLUG = "tool-test-fate-cafef00d"; // tool-driven probe session

function view(slug: string, ts: number): SessionStateView {
  return {
    session_key: slug,
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
    last_activity_ts: ts,
  };
}

// A real session plus two test-run sessions with NEWER activity — exactly the
// auto-follow-stealing case the story fixes. The test sessions must never reach
// the picker or the State tab.
const DEBUG_STATE: SessionStateView[] = [
  view(REAL, 100),
  view(TEST_SLUG, 300),
  view(TOOL_SLUG, 200),
];

function turnComplete(slug: string, turnId: number): WatcherEvent {
  return {
    timestamp: "t",
    component: "orchestrator",
    event_type: "turn_complete",
    severity: "info",
    session_slug: slug,
    fields: { turn_id: turnId, agent_name: "narrator" },
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

describe("useLiveSource test-session filtering (story 126-34)", () => {
  it("excludes test-* and tool-test sessions from the liveSessions picker", async () => {
    const { result } = renderHook(() => useLiveSource());
    // The real session is the only legitimate pick once test sessions are gone.
    await waitFor(() => expect(result.current.liveSessions).toContain(REAL));

    expect(result.current.liveSessions).not.toContain(TEST_SLUG);
    expect(result.current.liveSessions).not.toContain(TOOL_SLUG);
    // Only the real session survives the filter.
    expect(result.current.liveSessions).toEqual([REAL]);
  });

  it("keeps test-* sessions out of the picker even when they arrive via the event stream", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.liveSessions).toContain(REAL));

    act(() => {
      // A live event tagged with a test-session slug must not register the
      // session as a selectable live session — both prefixes, via the stream.
      driveEvent!(turnComplete("test-elsewhere-99999999", 1));
      driveEvent!(turnComplete("tool-test-elsewhere-88888888", 2));
      driveEvent!(turnComplete(REAL, 3));
    });

    expect(
      result.current.liveSessions.some(
        (s) => s.startsWith("test-") || s.startsWith("tool-test"),
      ),
    ).toBe(false);
    expect(result.current.liveSessions).toContain(REAL);
  });

  it("excludes test-* and tool-test sessions from the State-tab debugState", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.debugState).not.toBeNull());

    const keys = (result.current.debugState ?? []).map((s) => s.session_key);
    expect(keys).toContain(REAL);
    expect(keys).not.toContain(TEST_SLUG);
    expect(keys).not.toContain(TOOL_SLUG);
  });

  it("does not let a newer test session steal auto-follow from the real session", async () => {
    // TEST_SLUG/TOOL_SLUG have newer last_activity_ts than REAL; once they're
    // filtered out of the dashboard's session universe, auto-follow must land
    // on the genuinely-driven REAL session, never a test run.
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.activeSlug).toBe(REAL));

    expect(result.current.activeSlug).not.toBe(TEST_SLUG);
    expect(result.current.activeSlug).not.toBe(TOOL_SLUG);
  });
});
