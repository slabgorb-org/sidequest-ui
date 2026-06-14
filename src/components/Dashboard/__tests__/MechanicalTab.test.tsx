import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MechanicalCensus, MechanicalTab } from "../tabs/MechanicalTab";
import type { ForensicMechanical } from "../source/types";

const moved: ForensicMechanical = {
  state: "moved",
  pcs: [
    { player_id: "p1", character_name: "Rux", seat: 0, kind: "moved", deltas: [["edge", "5→3"], ["location", "cave→tunnel"]] },
  ],
  trope: { summary: "the_betrayal advanced", kind: "moved", turns_since_meaningful: 0, total_beats_fired: 4 },
  unparseable_seqs: [],
};

describe("MechanicalCensus", () => {
  it("renders per-PC deltas and trope summary", () => {
    render(<MechanicalCensus mechanical={moved} />);
    expect(screen.getByText(/Rux/)).toBeInTheDocument();
    expect(screen.getByText(/edge/)).toBeInTheDocument();
    expect(screen.getByText(/5→3/)).toBeInTheDocument();
    expect(screen.getByText(/the_betrayal advanced/)).toBeInTheDocument();
  });

  it("shows absent state", () => {
    render(<MechanicalCensus mechanical={{ state: "absent", pcs: [], trope: null, unparseable_seqs: [] }} />);
    expect(screen.getByText(/No mechanical census/i)).toBeInTheDocument();
  });

  it("shows 'no change' for a PC with empty deltas", () => {
    const staticView: ForensicMechanical = {
      state: "static",
      pcs: [{ player_id: "p1", character_name: "Rux", seat: 0, kind: "static", deltas: [] }],
      trope: null,
      unparseable_seqs: [],
    };
    render(<MechanicalCensus mechanical={staticView} />);
    expect(screen.getByText(/no change/i)).toBeInTheDocument();
  });
});

describe("MechanicalTab", () => {
  it("shows the select-a-session placeholder when mechanical is null", () => {
    render(<MechanicalTab mechanical={null} />);
    expect(screen.getByText(/Select a saved session/i)).toBeInTheDocument();
  });

  it("delegates to MechanicalCensus when mechanical is present", () => {
    render(<MechanicalTab mechanical={moved} />);
    expect(screen.getByText(/Rux/)).toBeInTheDocument();
  });
});
