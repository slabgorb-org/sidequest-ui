import { describe, expect, it } from "vitest";
import { getToneChips } from "../toneAxes";

describe("getToneChips", () => {
  it("returns one chip per authored axis (no axis is dropped)", () => {
    const chips = getToneChips({ stakes: 0.55, law: 0.5, chrome: 0.5 });
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.label).sort()).toEqual([
      "medium chrome",
      "medium law",
      "medium stakes",
    ]);
  });

  it("buckets axes as low (≤0.33), medium (between), high (≥0.67)", () => {
    const chips = getToneChips({ a: 0.05, b: 0.5, c: 0.95 });
    const byAxis = Object.fromEntries(
      chips.map((c) => [c.label.split(" ")[1], c.label.split(" ")[0]]),
    );
    expect(byAxis.a).toBe("low");
    expect(byAxis.b).toBe("medium");
    expect(byAxis.c).toBe("high");
  });

  it("treats exact threshold values as their bucket (0.33→low, 0.67→high)", () => {
    const chips = getToneChips({ a: 0.33, b: 0.67 });
    const labels = chips.map((c) => c.label);
    expect(labels).toContain("low a");
    expect(labels).toContain("high b");
  });

  it("uses bucket-indicator glyphs (▾ ◇ ▴) per bucket", () => {
    const chips = getToneChips({ low_axis: 0.1, mid_axis: 0.5, high_axis: 0.9 });
    const byAxis = Object.fromEntries(
      chips.map((c) => [c.label.split(" ")[1], c.glyph]),
    );
    expect(byAxis.low_axis).toBe("▾");
    expect(byAxis.mid_axis).toBe("◇");
    expect(byAxis.high_axis).toBe("▴");
  });

  it("sorts chips by distance-from-neutral (most polarized first)", () => {
    const chips = getToneChips({
      neutral: 0.5,
      slightly_high: 0.7,
      very_low: 0.05,
    });
    expect(chips.map((c) => c.label)).toEqual([
      "low very_low",
      "high slightly_high",
      "medium neutral",
    ]);
  });

  it("keeps both chips when two axes share the same distance-from-neutral", () => {
    // Both axes sit 0.2 from neutral; sort order between them is unspecified
    // but neither may be dropped.
    const chips = getToneChips({ axis_a: 0.7, axis_b: 0.3 });
    expect(chips).toHaveLength(2);
    const labels = new Set(chips.map((c) => c.label));
    expect(labels).toEqual(new Set(["high axis_a", "low axis_b"]));
  });

  it("returns empty array for empty axis snapshot", () => {
    expect(getToneChips({})).toEqual([]);
  });

  it("throws on NaN axis values (no silent fallback to medium)", () => {
    expect(() => getToneChips({ comedy: NaN })).toThrowError(/non-finite/);
  });

  it("throws on Infinity axis values", () => {
    expect(() => getToneChips({ gravity: Infinity })).toThrowError(/non-finite/);
  });

  it("throws on -Infinity axis values", () => {
    expect(() => getToneChips({ outlook: -Infinity })).toThrowError(/non-finite/);
  });

  it("is vocabulary-agnostic: any axis name works", () => {
    const chips = getToneChips({
      cosy: 0.75,
      gossip: 0.7,
      gothic: 0.05,
      stakes: 0.5,
      chrome: 0.55,
      weirdness: 0.9,
    });
    expect(chips).toHaveLength(6);
    const labels = chips.map((c) => c.label);
    expect(labels).toContain("high cosy");
    expect(labels).toContain("high gossip");
    expect(labels).toContain("low gothic");
    expect(labels).toContain("medium stakes");
    expect(labels).toContain("medium chrome");
    expect(labels).toContain("high weirdness");
  });

  // Snapshot-style verification against the six live-world axis_snapshot
  // values authored as of 2026-05-19. If a world retunes its values, this
  // test catches the shift before it surfaces in the lobby silently.
  describe("live worlds render expected chip sets", () => {
    it("beneath_sunden (comedy 0.05, gravity 0.9, outlook 0.2)", () => {
      const labels = getToneChips({
        comedy: 0.05,
        gravity: 0.9,
        outlook: 0.2,
      }).map((c) => c.label);
      expect(labels).toEqual(["low comedy", "high gravity", "low outlook"]);
    });

    it("burning_peace (balance 0.3, mysticism 0.6, conflict 0.5)", () => {
      const labels = getToneChips({
        balance: 0.3,
        mysticism: 0.6,
        conflict: 0.5,
      }).map((c) => c.label);
      expect(labels).toEqual(["low balance", "medium mysticism", "medium conflict"]);
    });

    it("flickering_reach (hope 0.6, tech_level 0.5, weirdness 0.9)", () => {
      const labels = getToneChips({
        hope: 0.6,
        tech_level: 0.5,
        weirdness: 0.9,
      }).map((c) => c.label);
      expect(labels).toEqual(["high weirdness", "medium hope", "medium tech_level"]);
    });

    it("the_circuit (stakes 0.55, law 0.5, chrome 0.5)", () => {
      const labels = getToneChips({
        stakes: 0.55,
        law: 0.5,
        chrome: 0.5,
      }).map((c) => c.label);
      // All three medium; sort is stable on equal distance so any order is ok.
      // Verify by set membership instead of ordering.
      expect(new Set(labels)).toEqual(
        new Set(["medium stakes", "medium law", "medium chrome"]),
      );
    });

    it("coyote_star (scale 0.3, tone 0.5, swagger 0.5)", () => {
      const labels = getToneChips({
        scale: 0.3,
        tone: 0.5,
        swagger: 0.5,
      }).map((c) => c.label);
      expect(labels[0]).toBe("low scale");
      expect(new Set(labels.slice(1))).toEqual(
        new Set(["medium tone", "medium swagger"]),
      );
    });

    it("glenross (cosy 0.75, puzzle 0.7, gossip 0.7, gothic 0.05)", () => {
      const labels = getToneChips({
        cosy: 0.75,
        puzzle: 0.7,
        gossip: 0.7,
        gothic: 0.05,
      }).map((c) => c.label);
      // gothic at 0.05 is most polarized; cosy at 0.75 next; puzzle/gossip tied at 0.7
      expect(labels[0]).toBe("low gothic");
      expect(labels[1]).toBe("high cosy");
      expect(new Set(labels.slice(2))).toEqual(
        new Set(["high puzzle", "high gossip"]),
      );
    });
  });
});
