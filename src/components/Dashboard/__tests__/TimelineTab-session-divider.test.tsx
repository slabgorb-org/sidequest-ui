import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TimelineTab } from "../tabs/TimelineTab";
import type { WatcherEvent, TurnCompleteFields } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Playtest 2026-04-11 regression — TimelineTab session-divider rendering
//
// Bug: Two different sessions in the same world both showed "#1 narrator" rows
// in the dashboard Timeline, mingled together with no way to tell them apart.
// turn_id resets per session but the dashboard had no way to detect session
// boundaries.
//
// Fix: Use the new (player_id, genre, world) fields on the TurnComplete event
// (added in sidequest-api PR #409) plus turn_id reset detection to identify
// session boundaries between consecutive turns. Render a horizontal divider
// with the session label between turns from different sessions.
//
// These tests cover the boundary-detection logic at the rendered-DOM level
// because the helper functions are module-private (intentionally — they're
// implementation details). The DOM is the contract: a `── label ──` divider
// row appears between the right turns.
// ══════════════════════════════════════════════════════════════════════════════

function makeTurn(opts: {
  index: number;
  fields: TurnCompleteFields;
  timestamp?: string;
}): WatcherEvent {
  return {
    timestamp: opts.timestamp ?? `2026-04-11T12:0${opts.index}:00.000Z`,
    component: "game",
    event_type: "turn_complete",
    severity: "info",
    fields: opts.fields as unknown as Record<string, unknown>,
  };
}

describe("TimelineTab session-divider rendering (playtest 2026-04-11)", () => {
  it("renders a single session header when all turns share (player_id, genre, world)", () => {
    const turns: WatcherEvent[] = [
      makeTurn({
        index: 1,
        fields: {
          turn_id: 1,
          agent_name: "narrator",
          player_id: "alice",
          genre: "mutant_wasteland",
          world: "flickering_reach",
        },
      }),
      makeTurn({
        index: 2,
        fields: {
          turn_id: 2,
          agent_name: "narrator",
          player_id: "alice",
          genre: "mutant_wasteland",
          world: "flickering_reach",
        },
      }),
    ];

    render(
      <TimelineTab turns={turns} selectedTurn={null} onSelectTurn={vi.fn()} />,
    );

    // Exactly one session label appears (the header for the only session).
    // The header includes the session tuple.
    const headers = screen.getAllByText(/alice · mutant_wasteland · flickering_reach/);
    expect(headers).toHaveLength(1);
  });

  it("renders two session headers when player_id changes mid-stream", () => {
    const turns: WatcherEvent[] = [
      makeTurn({
        index: 1,
        fields: {
          turn_id: 1,
          agent_name: "narrator",
          player_id: "alice",
          genre: "mutant_wasteland",
          world: "flickering_reach",
        },
      }),
      makeTurn({
        index: 2,
        fields: {
          turn_id: 1,
          agent_name: "narrator",
          player_id: "bob",
          genre: "mutant_wasteland",
          world: "flickering_reach",
        },
      }),
    ];

    render(
      <TimelineTab turns={turns} selectedTurn={null} onSelectTurn={vi.fn()} />,
    );

    expect(screen.getAllByText(/alice ·/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/bob ·/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders a session boundary when turn_id resets backwards within the same tuple", () => {
    // The exact playtest 2026-04-11 scenario: same player, same world, but
    // a fresh character starts and turn_id resets to 1.
    const turns: WatcherEvent[] = [
      makeTurn({
        index: 1,
        fields: {
          turn_id: 5, // late turn from session A
          agent_name: "narrator",
          player_id: "keith",
          genre: "mutant_wasteland",
          world: "flickering_reach",
        },
      }),
      makeTurn({
        index: 2,
        fields: {
          turn_id: 1, // first turn of fresh character session B
          agent_name: "narrator",
          player_id: "keith",
          genre: "mutant_wasteland",
          world: "flickering_reach",
        },
      }),
    ];

    render(
      <TimelineTab turns={turns} selectedTurn={null} onSelectTurn={vi.fn()} />,
    );

    // Two divider headers should appear — one for the first session, one
    // for the second. Without the turn_id-reset detection, only one header
    // would appear (the (player_id, genre, world) tuple is identical).
    const headers = screen.getAllByText(/keith · mutant_wasteland · flickering_reach/);
    expect(headers).toHaveLength(2);
  });

  it("renders a session boundary when world changes within the same player", () => {
    const turns: WatcherEvent[] = [
      makeTurn({
        index: 1,
        fields: {
          turn_id: 3,
          agent_name: "narrator",
          player_id: "keith",
          genre: "low_fantasy",
          world: "pinwheel_coast",
        },
      }),
      makeTurn({
        index: 2,
        fields: {
          turn_id: 1,
          agent_name: "narrator",
          player_id: "keith",
          genre: "mutant_wasteland",
          world: "flickering_reach",
        },
      }),
    ];

    render(
      <TimelineTab turns={turns} selectedTurn={null} onSelectTurn={vi.fn()} />,
    );

    expect(screen.getByText(/keith · low_fantasy · pinwheel_coast/)).toBeInTheDocument();
    expect(screen.getByText(/keith · mutant_wasteland · flickering_reach/)).toBeInTheDocument();
  });

  it("degrades gracefully when turn events lack genre/world/player_id fields", () => {
    // Older server emits TurnComplete without the new (player_id, genre,
    // world) fields. The dashboard should not crash, and should still
    // catch the most common case (turn_id reset) by treating the empty
    // tuple as a single session.
    const turns: WatcherEvent[] = [
      makeTurn({
        index: 1,
        fields: { turn_id: 5, agent_name: "narrator" },
      }),
      makeTurn({
        index: 2,
        fields: { turn_id: 1, agent_name: "narrator" },
      }),
    ];

    expect(() =>
      render(
        <TimelineTab turns={turns} selectedTurn={null} onSelectTurn={vi.fn()} />,
      ),
    ).not.toThrow();

    // Even without the tuple fields, the turn_id reset must be caught —
    // two session headers, both labelled "session" because there's no
    // tuple to render.
    const headers = screen.getAllByText(/── session/);
    expect(headers).toHaveLength(2);
  });

  it("renders Tier from extraction_tier field on selected turn", () => {
    // Companion check for the sister fix in sidequest-api PR #409: the
    // dashboard already reads `fields.extraction_tier` in the Turn Details
    // panel. Once the API ships the field on TurnComplete, this should
    // display the tier instead of "?". This test verifies the rendering
    // works when the field is present.
    const turns: WatcherEvent[] = [
      makeTurn({
        index: 1,
        fields: {
          turn_id: 1,
          agent_name: "narrator",
          extraction_tier: "delta",
          player_id: "keith",
          genre: "mutant_wasteland",
          world: "flickering_reach",
        },
      }),
    ];

    render(
      <TimelineTab turns={turns} selectedTurn={0} onSelectTurn={vi.fn()} />,
    );

    // The tier label and value both appear in the Turn Details grid. The
    // Tufte redesign renders the key as a small-caps "tier" label (no colon)
    // with the value beneath it; the wiring intent (extraction_tier reaches
    // the panel) is unchanged.
    expect(screen.getByText(/tier/i)).toBeInTheDocument();
    expect(screen.getByText(/delta/)).toBeInTheDocument();
  });
});
