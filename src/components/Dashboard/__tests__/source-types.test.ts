import { describe, expect, it } from "vitest";
import { ALL_LENSES, LIVE_CAPABILITIES, FORENSIC_CAPABILITIES } from "../source/types";

describe("source capability model", () => {
  it("declares all nine lenses", () => {
    expect(ALL_LENSES).toHaveLength(9);
    expect(ALL_LENSES).toContain("mechanical");
    expect(ALL_LENSES).toContain("encounters");
  });

  it("live exposes the timeline and encounters lenses", () => {
    expect(LIVE_CAPABILITIES.has("timeline")).toBe(true);
    expect(LIVE_CAPABILITIES.has("encounters")).toBe(true);
  });

  it("forensic supports the full lens set (round-scoped)", () => {
    for (const lens of ALL_LENSES) {
      expect(FORENSIC_CAPABILITIES.has(lens)).toBe(true);
    }
  });
});
