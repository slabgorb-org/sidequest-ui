// RED (Story 165-4, plan Task 10): the tactical adjudication echo on the grid.
//
// Track C surfaces the server's tactical math (move budget, denied reach/range)
// onto the Map tab so the player can SEE why a move was legal or a strike was out
// of reach — no recompute on the client, just render the echo. Two surfaces:
//   1. TacticalGridRenderer shows a denial banner for any invalid adjudication
//      and a cells-spent/budget chip for a move summary.
//   2. tacticalGridFromWire maps the additive `adjudications` field, defaulting
//      to [] so pre-165-4 payloads (and Track B's SITE_MAP cutover) still parse.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TacticalGridRenderer } from "@/components/TacticalGridRenderer";
import { tacticalGridFromWire } from "@/lib/tacticalGridFromWire";
import type { TacticalGridData } from "@/types/tactical";

const BASE: TacticalGridData = {
  room_id: "region_alpha",
  room_name: "region_alpha",
  room_type: "cavern",
  mask: ".....\n.....\n..#..\n.....\n.....",
  cavern_image_url: "/genre/test/alpha.cavern.png",
  cell_size: 28,
  cellular: null,
  derived: { floor_count: 24, exits: {}, pois: [] },
  features: [],
  tokens: [
    {
      id: "pc:Rux", name: "Rux", initial: "R", faction: "player",
      cell: { x: 1, y: 1 }, hp: { current: 18, max: 22 }, ac: 14, speed: 30,
    },
  ],
  adjudications: [],
};

describe("TacticalGridRenderer — adjudication echo", () => {
  it("renders a denial banner carrying the reason for an invalid reach", () => {
    const grid: TacticalGridData = {
      ...BASE,
      adjudications: [
        {
          actor: "Rux",
          kind: "reach",
          valid: false,
          distance_cells: 3,
          max_cells: 1,
          mode: "melee",
          reason: "target is 3 cells away; your reach is 1",
          cells: [],
        },
      ],
    };
    render(<TacticalGridRenderer grid={grid} />);
    const denial = screen.getByTestId("tactical-denial");
    expect(denial).toBeInTheDocument();
    expect(denial).toHaveTextContent("target is 3 cells away; your reach is 1");
  });

  it("shows a cells-spent/budget chip for a valid move summary", () => {
    const grid: TacticalGridData = {
      ...BASE,
      adjudications: [
        {
          actor: "Rux",
          kind: "move",
          valid: true,
          cells_spent: 2,
          cells_budget: 6,
          reason: "",
          cells: [],
        },
      ],
    };
    render(<TacticalGridRenderer grid={grid} />);
    const chip = screen.getByTestId("tactical-move-budget");
    expect(chip).toHaveTextContent("2");
    expect(chip).toHaveTextContent("6");
  });

  it("does not render a denial banner when every adjudication is valid", () => {
    const grid: TacticalGridData = {
      ...BASE,
      adjudications: [
        { actor: "Rux", kind: "move", valid: true, cells_budget: 6, reason: "", cells: [] },
      ],
    };
    render(<TacticalGridRenderer grid={grid} />);
    expect(screen.queryByTestId("tactical-denial")).not.toBeInTheDocument();
  });
});

describe("tacticalGridFromWire — adjudications parsing", () => {
  const wireBase = {
    room_id: "region_alpha",
    room_name: "region_alpha",
    room_type: "cavern" as const,
    mask: ".....\n.....\n..#..\n.....\n.....",
    cavern_image_url: "/genre/test/alpha.cavern.png",
    cell_size: 28,
    cellular: null,
    derived: { floor_count: 24, exits: {}, pois: [] },
    tokens: [],
  };

  it("maps the wire adjudications (cells arrays → {x,y} preserved as pairs)", () => {
    const wire = {
      ...wireBase,
      adjudications: [
        {
          actor: "Rux",
          kind: "reach",
          valid: false,
          distance_cells: 3,
          max_cells: 1,
          mode: "melee",
          reason: "target is 3 cells away; your reach is 1",
          cells: [],
        },
      ],
    };
    const data = tacticalGridFromWire(wire);
    expect(data).not.toBeNull();
    expect(data!.adjudications).toHaveLength(1);
    expect(data!.adjudications![0]).toMatchObject({
      actor: "Rux",
      kind: "reach",
      valid: false,
      distance_cells: 3,
      max_cells: 1,
      mode: "melee",
      reason: "target is 3 cells away; your reach is 1",
    });
  });

  it("defaults adjudications to [] when the wire payload omits the field (back-compat)", () => {
    // A pre-165-4 payload (and Track B's SITE_MAP cutover) has no `adjudications`.
    // The parser must yield [], never undefined — the renderer maps over it.
    const data = tacticalGridFromWire(wireBase);
    expect(data).not.toBeNull();
    expect(data!.adjudications).toEqual([]);
  });
});

// 165-4 REWORK — Reviewer [TEST] coverage gaps: every prior renderer test used a
// single PC and only the denial + move kinds. These close the multi-PC and
// valid-reach / aoe gaps. They are regression guards (the renderer maps over all
// adjudications today), NOT RED drivers — the RED drivers this round are the
// server OTEL/fail-loud tests and the dice-result partial echo.
describe("TacticalGridRenderer — multi-PC + reach/aoe coverage (165-4 rework)", () => {
  it("surfaces a distinct denial and move chip for each actor at a multi-PC table", () => {
    const grid: TacticalGridData = {
      ...BASE,
      adjudications: [
        { actor: "Rux", kind: "reach", valid: false, distance_cells: 3, max_cells: 1,
          mode: "melee", reason: "Rux is 3 cells away; reach is 1", cells: [] },
        { actor: "Bexley", kind: "reach", valid: false, distance_cells: 4, max_cells: 1,
          mode: "melee", reason: "Bexley is 4 cells away; reach is 1", cells: [] },
        { actor: "Rux", kind: "move", valid: true, cells_spent: 2, cells_budget: 6,
          reason: "", cells: [] },
        { actor: "Bexley", kind: "move", valid: true, cells_spent: 1, cells_budget: 5,
          reason: "", cells: [] },
      ],
    };
    render(<TacticalGridRenderer grid={grid} />);

    // Two denials, each carrying its OWN actor's reason (not collapsed/overwritten).
    const denials = screen.getAllByTestId("tactical-denial");
    expect(denials).toHaveLength(2);
    const denialText = denials.map(d => d.textContent).join("|");
    expect(denialText).toContain("Rux is 3 cells away");
    expect(denialText).toContain("Bexley is 4 cells away");

    // Two move chips, each with its OWN actor + budget.
    const chips = screen.getAllByTestId("tactical-move-budget");
    expect(chips).toHaveLength(2);
    const rux = chips.find(c => c.textContent?.includes("Rux"));
    const bex = chips.find(c => c.textContent?.includes("Bexley"));
    expect(rux).toHaveTextContent("6");
    expect(bex).toHaveTextContent("5");
  });

  it("does not surface a VALID reach adjudication as a denial", () => {
    // A valid reach (target in range) is not a denial and not a move — it must
    // never render a red denial banner. Guards `denials = filter(!valid)`.
    const grid: TacticalGridData = {
      ...BASE,
      adjudications: [
        { actor: "Rux", kind: "reach", valid: true, distance_cells: 1, max_cells: 6,
          mode: "melee", reason: "", cells: [] },
      ],
    };
    render(<TacticalGridRenderer grid={grid} />);
    expect(screen.getByTestId("tactical-grid-renderer")).toBeInTheDocument();
    expect(screen.queryByTestId("tactical-denial")).not.toBeInTheDocument();
  });

  it("renders an aoe adjudication without crashing or faking a denial", () => {
    // An aoe echo (a future kind on the additive contract) must be handled
    // gracefully — no denial banner, no crash — even though there is no
    // dedicated aoe surface yet.
    const grid: TacticalGridData = {
      ...BASE,
      adjudications: [
        { actor: "Rux", kind: "aoe", valid: true, reason: "", cells: [] },
      ],
    };
    render(<TacticalGridRenderer grid={grid} />);
    expect(screen.getByTestId("tactical-grid-renderer")).toBeInTheDocument();
    expect(screen.queryByTestId("tactical-denial")).not.toBeInTheDocument();
  });
});
