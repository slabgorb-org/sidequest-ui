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
