import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TimingTab } from "../tabs/TimingTab";
import type { WatcherEvent } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Wiring test for the "Phase Breakdown" card added alongside the server-side
// turn-pipeline phase-timing instrumentation. The server validator emits
// `phase_durations_ms`, `phase_call_counts`, and `_unaccounted_ms` on every
// turn_complete event. The Dashboard's TimingTab is the visible consumer —
// without this rendering, the data is invisible to the GM panel and the lie
// detector is mute.
// ══════════════════════════════════════════════════════════════════════════════

function turnComplete(
  fields: Partial<WatcherEvent["fields"] & object>,
): WatcherEvent {
  return {
    timestamp: "2026-04-27T07:00:00.000Z",
    component: "validator",
    event_type: "turn_complete",
    severity: "info",
    fields,
  };
}

describe("TimingTab phase breakdown (turn-pipeline phase timing)", () => {
  it("renders phase rows from phase_durations_ms in latest turn", () => {
    const turns: WatcherEvent[] = [
      turnComplete({
        agent_duration_ms: 14336,
        total_duration_ms: 101000,
        phase_durations_ms: {
          preprocess_llm: 87000,
          narrator_subprocess: 14336,
          state_apply: 50,
        },
        phase_call_counts: { preprocess_llm: 1, narrator_subprocess: 1, state_apply: 1 },
        _unaccounted_ms: 0,
      }),
    ];

    render(<TimingTab turns={turns} />);

    // The largest phase is rendered first (sorted desc)
    const preprocess = screen.getAllByText("preprocess_llm");
    expect(preprocess.length).toBeGreaterThan(0);
    expect(screen.getAllByText("narrator_subprocess").length).toBeGreaterThan(0);
    expect(screen.getAllByText("state_apply").length).toBeGreaterThan(0);

    // Latest-turn total appears in the section header. (Also rendered by the
    // sibling per-turn-duration bar's total column — getAllByText tolerates both.)
    expect(screen.getAllByText(/101\.00s/).length).toBeGreaterThan(0);

    // ms values render in seconds with 2 decimals
    expect(screen.getAllByText("87.00s").length).toBeGreaterThan(0);
    expect(screen.getAllByText("14.34s").length).toBeGreaterThan(0);
  });

  it("renders _unaccounted row when _unaccounted_ms > 0", () => {
    const turns: WatcherEvent[] = [
      turnComplete({
        total_duration_ms: 50000,
        phase_durations_ms: {
          preprocess_llm: 30000,
        },
        phase_call_counts: { preprocess_llm: 1 },
        _unaccounted_ms: 19000,
      }),
    ];

    render(<TimingTab turns={turns} />);
    expect(screen.getByText("_unaccounted")).toBeInTheDocument();
    expect(screen.getByText("19.00s")).toBeInTheDocument();
  });

  it("annotates phase name with retry count when phase_call_counts > 1", () => {
    const turns: WatcherEvent[] = [
      turnComplete({
        total_duration_ms: 174000,
        phase_durations_ms: { preprocess_llm: 174000 },
        phase_call_counts: { preprocess_llm: 2 },
        _unaccounted_ms: 0,
      }),
    ];

    render(<TimingTab turns={turns} />);
    // Retry annotation appears on the latest-turn row
    expect(screen.getByText(/preprocess_llm ×2/)).toBeInTheDocument();
  });

  it("renders nothing breakdown-related when no turns carry phase_durations_ms (older servers)", () => {
    const turns: WatcherEvent[] = [
      turnComplete({
        agent_duration_ms: 14336,
        total_duration_ms: 14336,
      }),
    ];

    render(<TimingTab turns={turns} />);
    // Card title must not appear at all when there is no phase data
    expect(screen.queryByText(/Phase Breakdown/i)).not.toBeInTheDocument();
  });

  it("computes per-phase averages across multiple turns", () => {
    const turns: WatcherEvent[] = [
      turnComplete({
        total_duration_ms: 100000,
        phase_durations_ms: { preprocess_llm: 80000, narrator_subprocess: 15000 },
        phase_call_counts: { preprocess_llm: 1, narrator_subprocess: 1 },
        _unaccounted_ms: 5000,
      }),
      turnComplete({
        total_duration_ms: 50000,
        phase_durations_ms: { preprocess_llm: 30000, narrator_subprocess: 18000 },
        phase_call_counts: { preprocess_llm: 1, narrator_subprocess: 1 },
        _unaccounted_ms: 2000,
      }),
    ];

    render(<TimingTab turns={turns} />);
    // Average column header references the aggregation count
    expect(screen.getByText(/Average across 2 turn/)).toBeInTheDocument();
    // preprocess_llm average = (80000 + 30000) / 2 = 55000ms = 55.00s
    expect(screen.getByText("55.00s")).toBeInTheDocument();
    // narrator_subprocess average = (15000 + 18000) / 2 = 16500ms = 16.50s
    expect(screen.getByText("16.50s")).toBeInTheDocument();
  });
});
