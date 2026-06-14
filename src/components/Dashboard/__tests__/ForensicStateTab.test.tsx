import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForensicStateTab } from "../tabs/ForensicStateTab";
import type { ForensicBundle, ForensicSnapshot } from "../source/types";

const bundle: ForensicBundle = {
  round: 1,
  narrative: [{ round: 1, author: "gm", content: "You enter the cave.", tags: [], created_at: "t" }],
  events: [{ seq: 1, kind: "NARRATION", payload: { foo: "bar" }, created_at: "t" }],
  derived: { "fn-cave": { value: { summary: "The cave is dark", category: "location" }, source_seqs: [1] } },
  projection: [],
  scrapbook: [],
  unparseable_seqs: [],
  telemetry: { rows: [], by_component: {}, total: 0, unparseable_seqs: [] },
  mechanical: { state: "absent", pcs: [], trope: null, unparseable_seqs: [] },
};
const snapshot: ForensicSnapshot = { current_region: "cave_mouth", player_dead: false };

describe("ForensicStateTab", () => {
  it("renders derived facts (amber tier) and stored snapshot (green tier)", () => {
    render(<ForensicStateTab bundle={bundle} snapshot={snapshot} />);
    expect(screen.getByText(/The cave is dark/)).toBeInTheDocument();
    expect(screen.getByText(/cave_mouth/)).toBeInTheDocument();
    expect(screen.getByText(/You enter the cave/)).toBeInTheDocument();
  });

  it("shows an empty state when no bundle is loaded", () => {
    render(<ForensicStateTab bundle={null} snapshot={null} />);
    expect(screen.getByText(/Select a round/i)).toBeInTheDocument();
  });

  it("shows a derived-empty placeholder when no facts were reconstructed", () => {
    render(<ForensicStateTab bundle={{ ...bundle, derived: {} }} snapshot={snapshot} />);
    expect(screen.getByText(/No facts reconstructed/i)).toBeInTheDocument();
  });

  it("shows a no-snapshot placeholder when the stored snapshot is empty", () => {
    render(<ForensicStateTab bundle={bundle} snapshot={{}} />);
    expect(screen.getByText(/no snapshot stored/i)).toBeInTheDocument();
  });
});
