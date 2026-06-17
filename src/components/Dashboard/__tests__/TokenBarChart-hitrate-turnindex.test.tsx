import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TokenBarChart } from "../charts/TokenBarChart";
import type { TurnTokenCacheRow } from "../source/telemetryAdapter";

// ══════════════════════════════════════════════════════════════════════════════
// Story 125-1 — cache hit-rate dot tooltip mislabels the turn number
//
// BUG (from the 124-1 Reviewer audit): TokenBarChart.tsx:143 builds the hit-rate
// dot's <title> turn label from the POST-filter index of the `hitPoints` array
// (`T${i + 1}`), not the turn's real `turnIndex`. Because `hitPoints` drops null
// (non-SDK) turns BEFORE the map, any null turn that precedes a known turn shifts
// every later dot's label down — a cold/warm dot for turn 2 is labelled "T1".
//
// The dot's x-position (captured pre-filter from the original index) and the
// aggregate cold-miss count are already correct; ONLY the hover label is wrong.
//
// Fix: carry `turnIndex` into each hitPoints object and use it in the <title>.
// These tests fail RED until that join happens.
// ══════════════════════════════════════════════════════════════════════════════

function row(
  turnIndex: number,
  tokensIn: number,
  tokensOut: number,
  cached: number | null,
  cacheState: TurnTokenCacheRow["cacheState"],
): TurnTokenCacheRow {
  return { turnIndex, turnNumber: turnIndex, tokensIn, tokensOut, cached, cacheState };
}

/** All <title> tooltip strings rendered in the chart SVG. */
function titles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("title")).map((t) => t.textContent ?? "");
}

describe("TokenBarChart — hit-rate dot label uses the real turnIndex", () => {
  it("labels a cold-start dot with the turn's real index, not the post-filter index", () => {
    // [null, cold]: the null (turn 1) is dropped from hitPoints, so the cold dot
    // is the only point and sits at filtered index 0 → the bug renders "T1".
    // The cold turn is really turn 2, so its tooltip must read "T2".
    const { container } = render(
      <TokenBarChart
        data={[row(1, 5000, 200, null, "null"), row(2, 5000, 200, 0, "cold")]}
      />,
    );
    const coldTitle = titles(container).find((t) => /cold-start miss/.test(t));
    expect(coldTitle).toBeDefined();
    // The real assertion: the cold miss belongs to turn 2, not turn 1.
    expect(coldTitle).toMatch(/\bT2\b/);
    expect(coldTitle).not.toMatch(/\bT1\b/);
  });

  it("labels a warm hit-rate dot with the real turnIndex when several nulls precede it", () => {
    // [null, null, warm]: two non-SDK turns are dropped, so the warm dot lands at
    // filtered index 0 → the bug renders "T1". The warm turn is really turn 3.
    const { container } = render(
      <TokenBarChart
        data={[
          row(1, 100, 10, null, "null"),
          row(2, 100, 10, null, "null"),
          row(3, 1000, 50, 9000, "warm"),
        ]}
      />,
    );
    const warmTitle = titles(container).find((t) => /from cache/.test(t));
    expect(warmTitle).toBeDefined();
    expect(warmTitle).toMatch(/\bT3\b/);
    expect(warmTitle).not.toMatch(/\bT1\b/);
  });

  it("keeps the label correct when no nulls are interspersed (index already == turnIndex)", () => {
    // Guard against an over-correction that breaks the aligned case: [cold, warm]
    // has no dropped turns, so filtered index already matches turnIndex. The cold
    // dot is turn 1, the warm dot is turn 2 — must stay that way after the fix.
    const { container } = render(
      <TokenBarChart
        data={[row(1, 5000, 200, 0, "cold"), row(2, 1000, 150, 9000, "warm")]}
      />,
    );
    const coldTitle = titles(container).find((t) => /cold-start miss/.test(t));
    const warmTitle = titles(container).find((t) => /from cache/.test(t));
    expect(coldTitle).toMatch(/\bT1\b/);
    expect(warmTitle).toMatch(/\bT2\b/);
  });
});
