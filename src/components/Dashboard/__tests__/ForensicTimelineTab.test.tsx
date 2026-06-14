import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForensicTimelineTab } from "../tabs/ForensicTimelineTab";
import type { ForensicTimelineRound } from "../source/types";

const rounds: ForensicTimelineRound[] = [
  { round: 1, seq_start: 1, seq_end: 9, event_kind_counts: { NARRATION: 2 }, narrative_authors: ["gm"], ts: "t1" },
  { round: 2, seq_start: 10, seq_end: 18, event_kind_counts: { NARRATION: 3 }, narrative_authors: ["gm", "rux"], ts: "t2" },
];

describe("ForensicTimelineTab", () => {
  it("lists rounds and highlights the selected one", () => {
    render(<ForensicTimelineTab rounds={rounds} selectedRound={2} onSelectRound={() => {}} />);
    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByText(/Round 2/)).toBeInTheDocument();
    expect(screen.getByText(/Round 2/).closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByText(/Round 1/).closest("li")).toHaveAttribute("data-active", "false");
  });

  it("fires onSelectRound on click", () => {
    const onSelectRound = vi.fn();
    render(<ForensicTimelineTab rounds={rounds} selectedRound={2} onSelectRound={onSelectRound} />);
    fireEvent.click(screen.getByText(/Round 1/));
    expect(onSelectRound).toHaveBeenCalledWith(1);
  });

  it("shows an empty state when there are no rounds", () => {
    render(<ForensicTimelineTab rounds={[]} selectedRound={null} onSelectRound={() => {}} />);
    expect(screen.getByText(/No rounds/i)).toBeInTheDocument();
  });
});
