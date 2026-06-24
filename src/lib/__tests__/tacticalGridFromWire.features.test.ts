// src/lib/__tests__/tacticalGridFromWire.features.test.ts
import { describe, it, expect } from "vitest";
import { tacticalGridFromWire } from "@/lib/tacticalGridFromWire";

const baseWire = {
  room_id: "exp001.r0", room_name: "exp001.r0", room_type: "cavern" as const,
  mask: "###\n#.#\n###", cavern_image_url: "/x.png", cell_size: 28, cellular: null,
  derived: { floor_count: 1, exits: {}, pois: [[1, 1]] as [number, number][] },
  tokens: [],
};

describe("tacticalGridFromWire features", () => {
  const wire = {
    ...baseWire,
    // feature cell is an ARRAY [x,y] on the wire — real server shape
    features: [{ feature_type: "water" as const, cell: [1, 1] as [number, number], label: "black water" }],
  };

  it("maps features through — cell ARRAY [x,y] → {x,y} object", () => {
    const grid = tacticalGridFromWire(wire);
    expect(grid).not.toBeNull();
    expect(grid!.features).toEqual([
      { feature_type: "water", cell: { x: 1, y: 1 }, label: "black water" },
    ]);
  });

  it("defaults features to [] when wire omits them", () => {
    const grid = tacticalGridFromWire(baseWire as typeof wire);
    expect(grid!.features).toEqual([]);
  });
});

// Wire shape mirrors sidequest-server TokenPayload (token_id/label/position/faction/hp/ac);
// see server tests/protocol token test — this is the cross-boundary contract the hollow
// payload hid (Story 52-5: payload was never populated so the mismatch was invisible).
describe("tacticalGridFromWire tokens — cross-boundary contract", () => {
  it("maps a real server-shaped token to TacticalToken", () => {
    const wire = {
      ...baseWire,
      tokens: [
        {
          token_id: "pc:Rux",
          label: "Rux",
          position: [1, 1] as [number, number],
          faction: "player",
          hp: { current: 18, max: 22 },
          ac: 15,
        },
      ],
    };
    const grid = tacticalGridFromWire(wire);
    expect(grid).not.toBeNull();
    expect(grid!.tokens).toEqual([
      {
        id: "pc:Rux",
        name: "Rux",
        initial: "R",
        faction: "player",
        cell: { x: 1, y: 1 },
        hp: { current: 18, max: 22 },
        ac: 15,
      },
    ]);
  });

  it("derives initial from label first char", () => {
    const wire = {
      ...baseWire,
      tokens: [
        {
          token_id: "creature:goblin",
          label: "goblin",
          position: [3, 4] as [number, number],
          faction: "hostile",
          hp: { current: 5, max: 8 },
          ac: 12,
        },
      ],
    };
    const grid = tacticalGridFromWire(wire);
    expect(grid!.tokens[0].initial).toBe("G");
  });

  it("falls back to neutral faction when faction is absent", () => {
    const wire = {
      ...baseWire,
      tokens: [
        {
          token_id: "creature:rat",
          label: "rat",
          position: [0, 0] as [number, number],
        },
      ],
    };
    const grid = tacticalGridFromWire(wire);
    expect(grid!.tokens[0].faction).toBe("neutral");
  });

  it("falls back to neutral faction when faction is unrecognized", () => {
    const wire = {
      ...baseWire,
      tokens: [
        {
          token_id: "creature:companion",
          label: "companion",
          position: [2, 2] as [number, number],
          faction: "companion", // unrecognized value — should fall back to neutral
          hp: { current: 10, max: 15 },
          ac: 14,
        },
      ],
    };
    const grid = tacticalGridFromWire(wire);
    expect(grid!.tokens[0].faction).toBe("neutral");
  });
});
