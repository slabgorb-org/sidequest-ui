import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { WatcherEvent, SessionStateView } from "@/types/watcher";

// ---------------------------------------------------------------------------
// Story 126-23 — operator selection of the Live session (UI half).
//
// Today useLiveSource() scopes its returned view to `activeSlug`, which is
// AUTO-DERIVED as the session with the newest last_activity_ts (the
// last-emitting session). Under >=2 concurrent sessions that means the Live
// view follows whichever session most recently emitted — the operator has no
// way to pin the session they are actually driving. These tests pin the fix:
//
//   * useLiveSource exposes `selectSession(slug | null)` — pin a live session.
//   * `activeSlug` reflects the PINNED selection when set (else auto-derives).
//   * the scoped view (turns / events) follows the SELECTED session, and a new
//     event from another session must NOT steal the view back.
//   * selecting a session surfaces its ALREADY-accumulated turns (no stuck
//     "Waiting for first turn…").
//   * `selectSession(null)` returns to auto-follow.
//   * `liveSessions` enumerates the known live slugs so the picker can offer
//     them (see SessionPicker-live-select.test.tsx for the operator surface).
//
// RED: `selectSession` / `liveSessions` do not exist on the hook yet, so the
// new-API tests fail. The first test is a regression GUARD for the preserved
// auto-follow default and passes against current code by design.
// ---------------------------------------------------------------------------

let driveEvent: ((ev: WatcherEvent) => void) | null = null;
vi.mock("@/hooks/useWatcherSocket", () => ({
  useWatcherSocket: ({ onEvent }: { onEvent: (ev: WatcherEvent) => void }) => {
    driveEvent = onEvent;
    return { connected: true };
  },
}));

import { useLiveSource } from "../source/useLiveSource";

// DRIVEN = the session the operator is actually driving (older activity).
// NEWEST = a concurrent session that emitted most recently (e.g. a headless
// test) — auto-follow points here, which is the bug.
const DRIVEN = "2026-06-19-annees_folles-cd25d503";
const NEWEST = "2026-06-19-flickering_reach-444686c1";

function sessionView(key: string, ts: number): SessionStateView {
  return {
    session_key: key,
    genre_slug: "x",
    world_slug: "x",
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

// NEWEST has the newer last_activity_ts so the auto-derived activeSlug resolves
// to it — the precise concurrent-session shape the operator can't escape today.
const DEBUG_STATE: SessionStateView[] = [
  sessionView(DRIVEN, 100),
  sessionView(NEWEST, 200),
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
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(DEBUG_STATE),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("useLiveSource operator session selection (126-23)", () => {
  it("GUARD: with no selection, auto-follows the newest-activity session", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.activeSlug).toBe(NEWEST));

    act(() => {
      driveEvent!(turnComplete(DRIVEN, 1));
      driveEvent!(turnComplete(NEWEST, 9));
    });

    // Default behavior preserved: the view scopes to the auto-derived session.
    expect(result.current.turns.map((t) => t.session_slug)).toEqual([NEWEST]);
  });

  it("selectSession pins the DRIVEN session over the last-emitting one", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.activeSlug).toBe(NEWEST));

    act(() => {
      driveEvent!(turnComplete(DRIVEN, 1)); // driven session takes a turn
      driveEvent!(turnComplete(NEWEST, 9)); // concurrent session emits last
    });

    // Operator pins the session they are driving.
    act(() => result.current.selectSession(DRIVEN));

    expect(result.current.activeSlug).toBe(DRIVEN);
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]!.session_slug).toBe(DRIVEN);

    // A fresh event from the OTHER (last-emitting) session must NOT steal the
    // view back — "renders the operator-SELECTED session, never the
    // last-emitting one".
    act(() => driveEvent!(turnComplete(NEWEST, 10)));
    expect(result.current.activeSlug).toBe(DRIVEN);
    expect(result.current.turns.every((t) => t.session_slug === DRIVEN)).toBe(
      true,
    );
  });

  it("selecting a session surfaces its already-accumulated turns (no stuck empty)", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.activeSlug).toBe(NEWEST));

    // Both sessions accumulate turns BEFORE the operator selects anything.
    act(() => {
      driveEvent!(turnComplete(DRIVEN, 1));
      driveEvent!(turnComplete(DRIVEN, 2));
      driveEvent!(turnComplete(NEWEST, 5));
    });
    // Auto-follow shows only the newest session's turn.
    expect(result.current.turns.map((t) => t.session_slug)).toEqual([NEWEST]);

    // Pinning the driven session reveals its two prior turns — not "TURNS 0".
    act(() => result.current.selectSession(DRIVEN));
    expect(result.current.turns).toHaveLength(2);
    expect(result.current.turns.every((t) => t.session_slug === DRIVEN)).toBe(
      true,
    );
  });

  it("selectSession(null) clears the pin and returns to auto-follow", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() => expect(result.current.activeSlug).toBe(NEWEST));

    act(() => result.current.selectSession(DRIVEN));
    expect(result.current.activeSlug).toBe(DRIVEN);

    act(() => result.current.selectSession(null));
    expect(result.current.activeSlug).toBe(NEWEST);
  });

  it("exposes the set of known live session slugs for the picker", async () => {
    const { result } = renderHook(() => useLiveSource());
    await waitFor(() =>
      expect(result.current.liveSessions).toEqual(
        expect.arrayContaining([DRIVEN, NEWEST]),
      ),
    );
    expect(result.current.liveSessions).toHaveLength(2);
  });
});
