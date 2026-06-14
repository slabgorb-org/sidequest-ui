import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StateTab } from "../tabs/StateTab";
import type { SessionStateView } from "@/types/watcher";

/** Minimal valid session state with one player — no combat_state field,
 *  matching the real PlayerStateView shape from the watcher API. */
function makeSession(overrides?: Partial<SessionStateView>): SessionStateView {
  return {
    session_key: "test-session",
    genre_slug: "low_fantasy",
    world_slug: "pinwheel_coast",
    current_location: "The Salty Dog Tavern",
    discovered_regions: ["dockside"],
    narration_history_len: 5,
    turn_mode: "single",
    npc_registry: [],
    trope_states: [],
    players: [
      {
        player_name: "player-1",
        character_name: "Aldric",
        character_class: "Fighter",
        character_hp: 18,
        character_max_hp: 22,
        character_level: 3,
        character_xp: 450,
        region_id: "dockside",
        display_location: "The Salty Dog Tavern",
        inventory: { items: [], gold: 10 },
      },
    ],
    player_count: 1,
    has_music_director: false,
    has_audio_mixer: false,
    region_names: [["dockside", "Dockside Quarter"]],
    ...overrides,
  };
}

describe("StateTab — PlayerCard rendering (story 30-3)", () => {
  it("renders a player card without crashing when no combat_state exists", () => {
    const session = makeSession();
    // PlayerStateView has no combat_state field — the card must not crash.
    render(<StateTab debugState={[session]} onRefresh={vi.fn()} />);
    expect(screen.getByText(/Aldric/)).toBeInTheDocument();
  });

  it("displays player HP correctly", () => {
    const session = makeSession();
    render(<StateTab debugState={[session]} onRefresh={vi.fn()} />);
    expect(screen.getByText("18/22")).toBeInTheDocument();
  });

  it("displays player location when present", () => {
    const session = makeSession();
    render(<StateTab debugState={[session]} onRefresh={vi.fn()} />);
    // The location appears in both the Location card and PlayerCard.
    // Use getAllByText to verify it's present (should have at least 1 match).
    const locations = screen.getAllByText(/The Salty Dog Tavern/);
    expect(locations.length).toBeGreaterThanOrEqual(1);
  });

  // Playtest 2026-04-24 — State tab was showing debugState[0], which in
  // practice was the OLDEST save instead of the active one. The server
  // now sorts by mtime and exposes `last_activity_ts`; the UI defensively
  // picks the max-ts entry so older servers also work.
  it("picks the most-recently-touched session by last_activity_ts", () => {
    const stale = makeSession({
      session_key: "2026-04-22-old_save",
      current_location: "Graveyard",
      last_activity_ts: 1000,
    });
    const active = makeSession({
      session_key: "2026-04-24-flickering_reach",
      current_location: "The Filtration Warren",
      last_activity_ts: 9999,
    });
    // Deliberately pass stale first to prove sort (not index-0) wins.
    render(<StateTab debugState={[stale, active]} onRefresh={vi.fn()} />);
    // Active session's unique location appears; stale one's does not.
    expect(screen.getAllByText(/The Filtration Warren/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Graveyard/)).toBeNull();
  });

  it("falls back to first entry when last_activity_ts is missing", () => {
    // Back-compat: older server that hasn't deployed the mtime field yet.
    const a = makeSession({ session_key: "a", current_location: "Alpha" });
    const b = makeSession({ session_key: "b", current_location: "Bravo" });
    render(<StateTab debugState={[a, b]} onRefresh={vi.fn()} />);
    // With both ts missing the sort is a no-op; first entry wins.
    expect(screen.getAllByText(/Alpha/).length).toBeGreaterThanOrEqual(1);
  });

  it("uses a non-stale refresh tooltip (no 'Rust')", () => {
    const session = makeSession();
    render(<StateTab debugState={[session]} onRefresh={vi.fn()} />);
    expect(screen.getByTitle(/Fetch latest state from server/i)).toBeInTheDocument();
    expect(screen.queryByTitle(/Rust/i)).toBeNull();
  });

  it("renders multiple players without crashing", () => {
    const session = makeSession({
      players: [
        {
          player_name: "player-1",
          character_name: "Aldric",
          character_class: "Fighter",
          character_hp: 18,
          character_max_hp: 22,
          character_level: 3,
          character_xp: 450,
          region_id: "dockside",
          display_location: "The Salty Dog Tavern",
          inventory: { items: [], gold: 10 },
        },
        {
          player_name: "player-2",
          character_name: "Mira",
          character_class: "Rogue",
          character_hp: 12,
          character_max_hp: 14,
          character_level: 2,
          character_xp: 200,
          region_id: "dockside",
          display_location: "The Salty Dog Tavern",
          inventory: { items: [], gold: 5 },
        },
      ],
      player_count: 2,
    });
    render(<StateTab debugState={[session]} onRefresh={vi.fn()} />);
    expect(screen.getByText(/Aldric/)).toBeInTheDocument();
    expect(screen.getByText(/Mira/)).toBeInTheDocument();
  });
});
