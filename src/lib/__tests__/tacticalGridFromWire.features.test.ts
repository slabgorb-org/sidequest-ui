// src/lib/__tests__/tacticalGridFromWire.features.test.ts
import { describe, it, expect } from "vitest";
import { tacticalGridFromWire } from "@/lib/tacticalGridFromWire";

const wire = {
  room_id: "exp001.r0", room_name: "exp001.r0", room_type: "cavern" as const,
  mask: "###\n#.#\n###", cavern_image_url: "/x.png", cell_size: 28, cellular: null,
  derived: { floor_count: 1, exits: {}, pois: [[1, 1]] as [number, number][] },
  tokens: [],
  features: [{ feature_type: "water" as const, cell: { x: 1, y: 1 }, label: "black water" }],
};

describe("tacticalGridFromWire features", () => {
  it("maps features through", () => {
    const grid = tacticalGridFromWire(wire);
    expect(grid).not.toBeNull();
    expect(grid!.features).toEqual([
      { feature_type: "water", cell: { x: 1, y: 1 }, label: "black water" },
    ]);
  });

  it("defaults features to [] when wire omits them", () => {
    const { features: _features, ...noFeatures } = wire;
    const grid = tacticalGridFromWire(noFeatures as typeof wire);
    expect(grid!.features).toEqual([]);
  });
});
