import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TimingTab } from "../tabs/TimingTab";
import type { WatcherEvent } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Story 124-1 — WIRING test: the real TimingTab must surface the cached/fresh
// split end-to-end.
//
// This is the integration guard required by CLAUDE.md ("Every Test Suite Needs a
// Wiring Test"): it renders the actual TimingTab, feeds it the ordered event
// stream (turn_complete + the narrator prompt_assembled it pairs with), and
// asserts the cache split reaches the rendered chart. If TimingTab forgets to
// pass the prompt stream into the join, or the join/chart aren't wired, the
// cached numbers never appear and this fails.
//
// TimingTab gains an optional `allEvents` prop (the ordered stream from
// DashboardApp's `view.allEvents`). When absent (older callers / non-SDK), the
// token chart degrades to fresh-only with no fabricated cache — back-compat with
// the existing `<TimingTab turns={...} />` callers.
// ══════════════════════════════════════════════════════════════════════════════

function promptAssembled(turn: number, cacheRead: number | null): WatcherEvent {
  return {
    timestamp: `2026-06-16T00:00:0${turn}.000Z`,
    component: "prompt_builder",
    event_type: "prompt_assembled",
    severity: "info",
    fields: {
      turn_number: turn,
      agent_name: "narrator",
      total_tokens: 1000,
      cache_usage:
        cacheRead === null
          ? null
          : {
              cache_read: cacheRead,
              cache_write: 0,
              cache_write_5m: 0,
              cache_write_1h: 0,
              cost_usd: 0.01,
              cache_ttl: "1h",
            },
    } as unknown as Record<string, unknown>,
  };
}

function turnComplete(turn: number, tokensIn: number, tokensOut: number): WatcherEvent {
  return {
    timestamp: `2026-06-16T00:00:0${turn}.500Z`,
    component: "orchestrator",
    event_type: "turn_complete",
    severity: "info",
    fields: {
      turn_number: turn,
      agent_name: "narrator",
      token_count_in: tokensIn,
      token_count_out: tokensOut,
    } as unknown as Record<string, unknown>,
  };
}

describe("TimingTab — cached/fresh split wiring (Story 124-1)", () => {
  it("surfaces the cache split when fed the ordered event stream", () => {
    const turn = turnComplete(1, 2000, 300);
    const prompt = promptAssembled(1, 18000);
    render(<TimingTab turns={[turn]} allEvents={[prompt, turn]} />);

    // The join (adapter) → chart must produce the savings summary from the real
    // cache_read. Its presence proves the stream reached the chart.
    expect(screen.getByText(/served from cache/i)).toBeInTheDocument();
    expect(document.body.textContent ?? "").toMatch(/18[,.]?000/);
  });

  it("degrades to fresh-only with NO fabricated cache when no prompt stream is given", () => {
    // Mirrors the existing `<TimingTab turns={...} />` callers and non-SDK data.
    const turn = turnComplete(1, 2000, 300);
    render(<TimingTab turns={[turn]} />);

    const body = document.body.textContent ?? "";
    // Renders without crashing; the token section is still there.
    expect(screen.getByText(/Token usage/i)).toBeInTheDocument();
    // No cache number is invented when there's no cache telemetry.
    expect(body).not.toMatch(/served from cache[^0-9]*[1-9]/i);
  });

  it("shows the warm turn's cache but not a fabricated number for a null turn", () => {
    const t1 = turnComplete(1, 2000, 300);
    const p1 = promptAssembled(1, 9000); // warm
    const t2 = turnComplete(2, 1800, 280);
    const p2 = promptAssembled(2, null); // non-SDK → unknown
    render(<TimingTab turns={[t1, t2]} allEvents={[p1, t1, p2, t2]} />);

    const body = document.body.textContent ?? "";
    expect(body).toMatch(/9[,.]?000/); // real cache_read from the warm turn
    // The null turn contributes nothing fabricated to savings (still 9,000 total).
    expect(body).not.toMatch(/served from cache[^0-9]*0?9[,.]?00[1-9]/i);
  });
});
