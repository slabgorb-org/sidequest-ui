import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TokenBarChart } from "../charts/TokenBarChart";
import type { TurnTokenCacheRow } from "../source/telemetryAdapter";

// ══════════════════════════════════════════════════════════════════════════════
// Story 125-2 — visible "cache: n/a (non-SDK)" caption for all-non-SDK sessions
//
// GAP (from the 124-1 Reviewer audit, via silent-failure-hunter): when EVERY turn
// is cacheState "null" (all non-SDK — e.g. Ollama / claude -p), the "served from
// cache" summary line is suppressed (TokenBarChart.tsx:149, knownTurns.length===0)
// and the ONLY "n/a" rendered is inside per-bar SVG <title> tooltips (line 93,
// hover-only). A GM scanning the chart can't tell cache data is ABSENT vs zero
// without hovering each bar.
//
// Fix: render a VISIBLE (non-<title>) "cache: n/a (non-SDK)" caption for the
// all-null case — while KEEPING the per-bar hover tooltips. This is a legibility
// enhancement, not a correctness change (the no-fabrication contract already holds).
//
// "Visible" is asserted by reading SVG <text> elements (real captions) — NOT
// <title> elements (hover tooltips). These two tag names are distinct.
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

/** Visible caption text: SVG <text> elements only (NOT hover <title> tooltips). */
function visibleTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("text")).map((t) => t.textContent ?? "");
}

/** Hover tooltip strings: SVG <title> elements only. */
function titles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("title")).map((t) => t.textContent ?? "");
}

describe("TokenBarChart — visible non-SDK cache caption", () => {
  it("shows a visible 'n/a (non-SDK)' caption when every turn is non-SDK (null)", () => {
    const { container } = render(
      <TokenBarChart
        data={[row(1, 2000, 300, null, "null"), row(2, 1800, 250, null, "null")]}
      />,
    );
    const captions = visibleTexts(container).join(" | ");
    // RED until built: today the only n/a lives in <title> tooltips, never a <text>.
    expect(captions).toMatch(/n\/a/i);
    expect(captions).toMatch(/non-?sdk/i);
  });

  it("keeps the per-bar hover n/a tooltip IN ADDITION to the visible caption", () => {
    const { container } = render(
      <TokenBarChart data={[row(1, 2000, 300, null, "null")]} />,
    );
    // The existing hover-level honesty must NOT be removed by the fix...
    expect(titles(container).join(" | ")).toMatch(/n\/a/i);
    // ...and a visible caption must now ALSO exist (this half fails RED today).
    expect(visibleTexts(container).join(" | ")).toMatch(/n\/a/i);
  });

  it("renders the savings line and NO visible n/a caption when >=1 turn is known", () => {
    // Guard: the caption is for the ALL-null case only. A session with any known
    // turn shows the real "served from cache" savings, never the n/a caption.
    const { container } = render(
      <TokenBarChart
        data={[row(1, 1000, 150, 9000, "warm"), row(2, 800, 120, 7000, "warm")]}
      />,
    );
    const captions = visibleTexts(container).join(" | ");
    expect(captions).toMatch(/served from cache/i);
    expect(captions).not.toMatch(/n\/a/i);
  });
});
