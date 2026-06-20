import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TimingTab } from "../tabs/TimingTab";
import type { WatcherEvent } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Per-turn player-POV duration view (five_points/annees_folles playtest 2026-06-20).
//
// The server already emits `total_duration_ms` (submit → narration-delivered) and
// `phase_durations_ms` (the per-phase breakdown) on every turn_complete. The Timing
// tab's existing PhaseBreakdown only shows the LATEST turn + the session average; it
// never shows EACH turn as its own bar. Keith's ask: "one bar per turn = total,
// segmented by phase" so the operator can read "how long did each turn take and where
// did the wait go" at a glance. This is the missing per-turn-across-all-turns stacked
// view. Data already exists — presentation only.
// ══════════════════════════════════════════════════════════════════════════════

function turnComplete(fields: Partial<WatcherEvent["fields"] & object>): WatcherEvent {
  return {
    timestamp: "2026-06-20T04:00:00.000Z",
    component: "validator",
    event_type: "turn_complete",
    severity: "info",
    fields,
  };
}

const THREE_TURNS: WatcherEvent[] = [
  turnComplete({
    turn_number: 1,
    total_duration_ms: 12750,
    phase_durations_ms: { preprocess_llm: 1200, agent_llm: 10500, broadcast: 50 },
    _unaccounted_ms: 1000,
  }),
  turnComplete({
    turn_number: 2,
    total_duration_ms: 8000,
    phase_durations_ms: { preprocess_llm: 900, agent_llm: 6800, broadcast: 40 },
    _unaccounted_ms: 260,
  }),
  turnComplete({
    turn_number: 3,
    total_duration_ms: 20000,
    phase_durations_ms: { preprocess_llm: 1500, agent_llm: 17900, broadcast: 60 },
    _unaccounted_ms: 540,
  }),
];

describe("TimingTab per-turn duration view", () => {
  it("renders one bar per turn that carries duration data", () => {
    render(<TimingTab turns={THREE_TURNS} />);
    const section = screen.getByTestId("per-turn-duration");
    const rows = within(section).getAllByTestId("per-turn-row");
    expect(rows).toHaveLength(3);
  });

  it("labels each row with its turn number and player-POV total", () => {
    render(<TimingTab turns={THREE_TURNS} />);
    const section = screen.getByTestId("per-turn-duration");
    // The biggest turn's total (20.00s) and the first turn's (12.75s) both render
    // INSIDE the per-turn section (not just the latest-turn PhaseBreakdown header).
    expect(within(section).getByText("20.00s")).toBeInTheDocument();
    expect(within(section).getByText("12.75s")).toBeInTheDocument();
    expect(within(section).getByText("8.00s")).toBeInTheDocument();
    // Turn numbers label the rows.
    expect(within(section).getByText(/\b3\b/)).toBeInTheDocument();
  });

  it("segments each turn's bar by phase, with a phase legend", () => {
    render(<TimingTab turns={THREE_TURNS} />);
    const section = screen.getByTestId("per-turn-duration");
    // A legend names every phase present in the session.
    const legend = within(section).getByTestId("per-turn-legend");
    expect(within(legend).getByText("agent_llm")).toBeInTheDocument();
    expect(within(legend).getByText("preprocess_llm")).toBeInTheDocument();
    expect(within(legend).getByText("broadcast")).toBeInTheDocument();
    // Each row carries one segment per phase (+ the unaccounted remainder).
    const firstRow = within(section).getAllByTestId("per-turn-row")[0];
    const segs = within(firstRow).getAllByTestId("per-turn-segment");
    // 3 phases + 1 unaccounted
    expect(segs).toHaveLength(4);
  });

  it("includes the unaccounted remainder as its own segment", () => {
    render(<TimingTab turns={THREE_TURNS} />);
    const section = screen.getByTestId("per-turn-duration");
    const legend = within(section).getByTestId("per-turn-legend");
    expect(within(legend).getByText(/unaccounted/i)).toBeInTheDocument();
  });

  it("renders nothing when no turn carries duration data (older server)", () => {
    const noDuration: WatcherEvent[] = [
      turnComplete({ turn_number: 1, agent_duration_ms: 5000 }),
    ];
    render(<TimingTab turns={noDuration} />);
    expect(screen.queryByTestId("per-turn-duration")).not.toBeInTheDocument();
  });
});
