import { describe, expect, it } from "vitest";
import {
  cellToPixel,
  chebyshevReachCells,
  isFloor,
  pixelToCell,
} from "@/lib/cellMath";

describe("cellMath", () => {
  describe("cellToPixel", () => {
    it("converts cell coords to pixel center", () => {
      expect(cellToPixel({ x: 0, y: 0 }, 28)).toEqual({ x: 14, y: 14 });
      expect(cellToPixel({ x: 5, y: 3 }, 28)).toEqual({ x: 154, y: 98 });
    });
  });

  describe("pixelToCell", () => {
    it("converts pixel coords back to cell", () => {
      expect(pixelToCell({ x: 14, y: 14 }, 28)).toEqual({ x: 0, y: 0 });
      expect(pixelToCell({ x: 155, y: 99 }, 28)).toEqual({ x: 5, y: 3 });
    });

    it("clamps to nearest cell at boundaries", () => {
      expect(pixelToCell({ x: 27, y: 27 }, 28)).toEqual({ x: 0, y: 0 });
      expect(pixelToCell({ x: 28, y: 28 }, 28)).toEqual({ x: 1, y: 1 });
    });
  });

  describe("isFloor", () => {
    const mask = "##.\n.##\n###";

    it("returns true for floor cells", () => {
      expect(isFloor(mask, { x: 2, y: 0 })).toBe(true);
      expect(isFloor(mask, { x: 0, y: 1 })).toBe(true);
    });

    it("returns false for wall cells", () => {
      expect(isFloor(mask, { x: 0, y: 0 })).toBe(false);
      expect(isFloor(mask, { x: 1, y: 1 })).toBe(false);
    });

    it("returns false out of bounds", () => {
      expect(isFloor(mask, { x: -1, y: 0 })).toBe(false);
      expect(isFloor(mask, { x: 5, y: 5 })).toBe(false);
    });
  });

  describe("chebyshevReachCells", () => {
    const mask = ".....\n.....\n..#..\n.....\n.....";

    it("returns all floor cells within Chebyshev radius", () => {
      const cells = chebyshevReachCells({ x: 2, y: 2 }, 1, mask);
      // origin (2,2) is wall — but the player is *on* the cell; reach
      // includes the origin and floor neighbors. We exclude wall cells.
      const pairs = cells.map(c => `${c.x},${c.y}`).sort();
      expect(pairs).toEqual([
        "1,1", "1,2", "1,3",
        "2,1",          "2,3",
        "3,1", "3,2", "3,3",
      ].sort());
    });

    it("excludes cells outside the mask", () => {
      const cells = chebyshevReachCells({ x: 0, y: 0 }, 2, mask);
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(5);
        expect(c.y).toBeLessThan(5);
      }
    });
  });
});
