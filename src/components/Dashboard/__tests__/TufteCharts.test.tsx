import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TierPlot } from "../charts/TierPlot";
import { AgentDotPlot } from "../charts/AgentDotPlot";
import { FlameChart } from "../charts/FlameChart";
import type { TurnSpan } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Tufte chart-kit tests (Inspector redesign, 2026-06-16). These cover the new
// components that replaced the donut + plain text rows. The full-pipeline wiring
// (these mounted inside the live TimingTab) is covered by
// TimingTab-phase-breakdown.test.tsx, which renders the real TimingTab.
// ══════════════════════════════════════════════════════════════════════════════

describe("TierPlot (sorted bar plot — replaces the donut)", () => {
  it("renders a row per tier with count and percentage, sorted desc", () => {
    render(
      <TierPlot
        data={[
          { label: "full", value: 5 },
          { label: "skipped", value: 2 },
          { label: "cached", value: 1 },
        ]}
      />,
    );
    // total = 8 → full 63%, skipped 25%, cached 13%
    expect(screen.getByText("full")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.getByText("cached")).toBeInTheDocument();
    expect(screen.getByText("5 (63%)")).toBeInTheDocument();
    expect(screen.getByText("2 (25%)")).toBeInTheDocument();
  });

  it("shows an empty-state message with no data", () => {
    render(<TierPlot data={[]} />);
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });
});

describe("AgentDotPlot (mean & range, small multiples)", () => {
  it("renders one row per agent with mean value and count", () => {
    render(
      <AgentDotPlot
        agents={[
          { name: "narrator", durationsSec: [2, 3, 4] }, // avg 3.0, n=3
          { name: "ensemble", durationsSec: [1] }, // avg 1.0, n=1
        ]}
      />,
    );
    expect(screen.getByText("narrator")).toBeInTheDocument();
    expect(screen.getByText("ensemble")).toBeInTheDocument();
    expect(screen.getByText("3.0s")).toBeInTheDocument();
    expect(screen.getByText("n=3")).toBeInTheDocument();
    expect(screen.getByText("n=1")).toBeInTheDocument();
  });

  it("drops agents with no completed durations", () => {
    render(<AgentDotPlot agents={[{ name: "narrator", durationsSec: [] }]} />);
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });
});

describe("FlameChart (flat-span Gantt, slowest outlined)", () => {
  it("renders a row per span with its name and duration", () => {
    const spans: TurnSpan[] = [
      { name: "prompt_build", component: "prompt", start_ms: 0, duration_ms: 120 },
      { name: "agent_llm", component: "agent", start_ms: 120, duration_ms: 4200 },
    ];
    render(<FlameChart spans={spans} totalMs={4320} />);
    expect(screen.getByText("prompt_build")).toBeInTheDocument();
    expect(screen.getByText("agent_llm")).toBeInTheDocument();
    expect(screen.getByText("4200ms")).toBeInTheDocument();
  });

  it("prompts for a selection when there are no spans", () => {
    render(<FlameChart spans={[]} totalMs={0} />);
    expect(screen.getByText(/Select a turn to view spans/)).toBeInTheDocument();
  });
});
