import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TokenBarChart } from "../charts/TokenBarChart";
// RED (Story 124-1): TokenBarChart still renders only tokens in/out. It does not
// yet read `cached` / `cacheState`, draw the stacked cached+fresh segments, the
// cache-hit-rate sparkline, the cold-start accent, or the savings summary.
import type { TurnTokenCacheRow } from "../source/telemetryAdapter";

// ══════════════════════════════════════════════════════════════════════════════
// Story 124-1 — TokenBarChart cached/fresh stack + hit-rate sparkline + savings
//
// Contract (Architect ruling 2026-06-16):
//   • cached (cache_read, faded) stacks UNDER fresh (token_count_in, solid) on
//     the existing ONE shared scale — total bar = cached + fresh.
//   • "served from cache" savings = SUM of real cache_read over turns that have
//     it (warm + cold). NEVER an estimate.
//   • cold-start turns (cacheState "cold") are flagged in accent on the hit-rate
//     track. null turns (cacheState "null") are fresh-only, carry NO cache
//     number, and are EXCLUDED from the hit-rate (you can't rate an unknown).
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

describe("TokenBarChart — cached/fresh stack (additive, shared scale)", () => {
  it("renders cached and fresh as distinct stacked segments with the honest values", () => {
    // 2000 fresh + 18000 cached: cached must show as 18000 (not derived from in),
    // fresh as 2000 (not 2000 − 18000).
    const { container } = render(
      <TokenBarChart data={[row(1, 2000, 300, 18000, "warm")]} />,
    );
    const allTitles = titles(container).join(" | ");
    expect(allTitles).toMatch(/cached[^0-9]*18000/i);
    expect(allTitles).toMatch(/fresh[^0-9]*2000/i);
    // The subtraction bug would surface as a negative/16000 fresh — forbid it.
    expect(allTitles).not.toMatch(/-16000|fresh[^0-9]*16000/i);
  });

  it("reflects the combined cached+fresh total on the shared scale (peak = 20000)", () => {
    const { container } = render(
      <TokenBarChart data={[row(1, 2000, 300, 18000, "warm")]} />,
    );
    // The shared-scale peak must account for the full prompt (cached+fresh),
    // otherwise the cached segment is drawn off an in-only scale and the bar lies.
    expect(container.textContent ?? "").toMatch(/20[,.]?000/);
  });
});

describe("TokenBarChart — served-from-cache savings (real cache_read only)", () => {
  it("sums real cache_read across turns for the savings summary", () => {
    const { container } = render(
      <TokenBarChart
        data={[
          row(1, 2000, 300, 18000, "warm"),
          row(2, 1500, 250, 12000, "warm"),
        ]}
      />,
    );
    // 18000 + 12000 = 30000 tokens served from cache.
    expect(screen.getByText(/served from cache/i)).toBeInTheDocument();
    expect(container.textContent ?? "").toMatch(/30[,.]?000/);
  });

  it("does not invent savings when every turn is null (non-SDK)", () => {
    const { container } = render(
      <TokenBarChart
        data={[row(1, 2000, 300, null, "null"), row(2, 1800, 250, null, "null")]}
      />,
    );
    const body = container.textContent ?? "";
    // No fabricated cache number for unknown turns...
    expect(body).not.toMatch(/18[,.]?000/);
    // ...and the unknown cache state is shown honestly as n/a (RED until built),
    // never as "0 saved" — that would falsely imply the SDK ran and cached
    // nothing. null is UNKNOWN, not a measured zero.
    expect(body).toMatch(/n\/a/i);
    expect(body).not.toMatch(/served from cache[^a-z0-9]*[1-9]/i);
  });
});

describe("TokenBarChart — cold vs null on the hit-rate track", () => {
  it("flags a cold-start turn (cache miss) distinctly", () => {
    const { container } = render(
      <TokenBarChart
        data={[row(1, 5000, 200, 0, "cold"), row(2, 1000, 150, 9000, "warm")]}
      />,
    );
    // A cold-start miss is called out (accent annotation) somewhere in the chart.
    expect(container.textContent ?? "").toMatch(/cold/i);
  });

  it("does NOT label warm-only series as cold (but DOES render their cache)", () => {
    const { container } = render(
      <TokenBarChart
        data={[row(1, 1000, 150, 9000, "warm"), row(2, 800, 120, 7000, "warm")]}
      />,
    );
    // Anchor (RED until built): the warm turns' real cache_read is rendered,
    // proving the chart actually processed the split rather than ignoring it.
    expect(titles(container).join(" | ")).toMatch(/9000/);
    // The real assertion: warm turns are never flagged as cold misses.
    expect(container.textContent ?? "").not.toMatch(/cold/i);
  });

  it("does NOT treat a null turn as a cold miss (unknown ≠ miss)", () => {
    const { container } = render(
      <TokenBarChart data={[row(1, 5000, 200, null, "null")]} />,
    );
    const body = container.textContent ?? "";
    // Anchor (RED until built): the unknown state is rendered honestly as n/a.
    expect(body).toMatch(/n\/a/i);
    // The real assertion: null is unknown, not a miss — never flagged cold.
    expect(body).not.toMatch(/cold/i);
  });

  it("renders fresh for a null turn but no cache number (honest n/a)", () => {
    const { container } = render(
      <TokenBarChart data={[row(1, 5000, 200, null, "null")]} />,
    );
    const allTitles = titles(container).join(" | ");
    // fresh still renders...
    expect(allTitles).toMatch(/fresh[^0-9]*5000/i);
    // ...but the cache portion is explicitly unavailable, never a fabricated 0+.
    expect(allTitles).toMatch(/n\/a/i);
  });
});

describe("TokenBarChart — empty state preserved", () => {
  it("shows the empty-state message with no data", () => {
    render(<TokenBarChart data={[]} />);
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });
});
