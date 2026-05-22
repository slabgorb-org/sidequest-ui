import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PromptTab } from "../tabs/PromptTab";
import type { WatcherEvent } from "@/types/watcher";

/**
 * RED tests for Story 60-2 — the Prompt-tab cache-attribution display.
 *
 * Epic 60: the wasted cache_write is system_blocks[0] (Primacy+Early)
 * being re-written every turn because three `state`-category sections are
 * mis-zoned into the cached Early zone. The bug hid because the Prompt tab
 * showed a char/4 estimate decoupled from the real blocks and the real API
 * usage. This story makes caching legible in the existing PromptTab:
 *
 *  - AC-1: each zone labeled cached (rides system_blocks[0]) vs uncached.
 *  - AC-2: real API usage (read/write, 5m/1h, cost, ttl) shown; "n/a" loudly
 *          when no SDK usage exists — never a fabricated estimate.
 *  - AC-3: per-cacheable-block digest + drift vs the previous turn (a cached
 *          block whose digest changed = a wasted write).
 *  - AC-4: a `state`-category section in a cached zone shows a mis-zoned chip.
 *  - AC-6: PromptTab is the live consumer of the enriched event (wiring).
 *
 * These assert on the NEW emitted contract (zones[*].cached,
 * zones[*].sections[*].mis_zoned, cache_blocks[*].digest, cache_usage). The
 * current PromptTab renders none of it, so every test here fails RED.
 */

interface ZoneSection {
  name: string;
  token_estimate: number;
  category: string;
  mis_zoned: boolean;
  content?: string;
}
interface Zone {
  zone: string;
  total_tokens: number;
  cached: boolean;
  sections: ZoneSection[];
}
interface CacheBlock {
  label: string;
  digest: string;
  cached: boolean;
}
interface CacheUsage {
  cache_read: number;
  cache_write: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cost_usd: number;
  cache_ttl: string;
}

function makeEvent(opts: {
  turn: number;
  stableDigest?: string;
  miszoned?: boolean;
  usage?: CacheUsage | null;
}): WatcherEvent {
  const zones: Zone[] = [
    {
      zone: "Primacy",
      total_tokens: 100,
      cached: true,
      sections: [
        {
          name: "narrator_identity",
          token_estimate: 100,
          category: "identity",
          mis_zoned: false,
        },
      ],
    },
    {
      zone: "Early",
      total_tokens: 80,
      cached: true,
      sections: [
        {
          name: "narrator_available_confrontations",
          token_estimate: 80,
          category: "state",
          mis_zoned: opts.miszoned ?? true,
        },
      ],
    },
    {
      zone: "Valley",
      total_tokens: 50,
      cached: false,
      sections: [
        { name: "game_state", token_estimate: 50, category: "state", mis_zoned: false },
      ],
    },
  ];
  const cache_blocks: CacheBlock[] = [
    { label: "stable", digest: opts.stableDigest ?? "aaaa1111", cached: true },
    { label: "valley", digest: "bbbb2222", cached: false },
    { label: "tools", digest: "cccc3333", cached: true },
  ];
  const usage: CacheUsage | null =
    opts.usage === undefined
      ? {
          cache_read: 11168,
          cache_write: 12281,
          cache_write_5m: 0,
          cache_write_1h: 12281,
          cost_usd: 0.059,
          cache_ttl: "1h",
        }
      : opts.usage;

  return {
    timestamp: new Date().toISOString(),
    component: "prompt_builder",
    event_type: "prompt_assembled",
    severity: "info",
    fields: {
      turn_number: opts.turn,
      agent_name: "narrator",
      total_tokens: 230,
      zones,
      cache_blocks,
      cache_usage: usage,
    } as unknown as Record<string, unknown>,
  };
}

/** Select the turn at index `idx` in the PromptTab dropdown. */
function selectTurn(idx: number): void {
  const combobox = screen.getByRole("combobox");
  fireEvent.change(combobox, { target: { value: String(idx) } });
}

describe("PromptTab — cache attribution (Story 60-2)", () => {
  // --- AC-1: cache boundary visible ---------------------------------------
  it("labels each zone as cached or uncached", () => {
    render(<PromptTab promptEvents={[makeEvent({ turn: 0 })]} />);
    selectTurn(0);
    const body = document.body.textContent ?? "";
    // \bcached\b does not match inside "uncached" (no word boundary between
    // n|c), so these two assertions are independent.
    expect(body).toMatch(/\bcached\b/i);
    expect(body).toMatch(/\buncached\b/i);
  });

  // --- AC-2: real usage joined --------------------------------------------
  it("shows the real API cache usage numbers, not estimates", () => {
    render(<PromptTab promptEvents={[makeEvent({ turn: 0 })]} />);
    selectTurn(0);
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/11[,.]?168/); // cache_read
    expect(body).toMatch(/12[,.]?281/); // cache_write
    expect(body).toMatch(/1h/); // cache_ttl
    expect(body).toMatch(/0\.05/); // cost_usd ~ $0.059
  });

  it("shows an explicit n/a when cache usage is unavailable", () => {
    render(<PromptTab promptEvents={[makeEvent({ turn: 0, usage: null })]} />);
    selectTurn(0);
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/n\/a/i);
    // And must NOT fabricate a cache number when there is none.
    expect(body).not.toMatch(/11[,.]?168/);
  });

  // --- AC-3: drift vs previous turn ---------------------------------------
  it("renders the per-block content digest", () => {
    render(<PromptTab promptEvents={[makeEvent({ turn: 0, stableDigest: "deadbeef" })]} />);
    selectTurn(0);
    expect(document.body.textContent ?? "").toContain("deadbeef");
  });

  it("flags a cached block whose digest changed vs the previous turn as a wasted write", () => {
    const events = [
      makeEvent({ turn: 0, stableDigest: "aaaa0000" }),
      makeEvent({ turn: 1, stableDigest: "bbbb1111" }), // stable digest CHANGED
    ];
    render(<PromptTab promptEvents={events} />);
    selectTurn(1);
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/drift|wasted|changed/i);
  });

  it("does not flag drift when the cached block digest is unchanged", () => {
    const events = [
      makeEvent({ turn: 0, stableDigest: "aaaa0000" }),
      makeEvent({ turn: 1, stableDigest: "aaaa0000" }), // unchanged
    ];
    render(<PromptTab promptEvents={events} />);
    selectTurn(1);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/wasted/i);
  });

  // --- AC-4: mis-zoned state flag -----------------------------------------
  it("shows a mis-zoned chip for a state section in a cached zone", () => {
    render(<PromptTab promptEvents={[makeEvent({ turn: 0, miszoned: true })]} />);
    selectTurn(0);
    expect(document.body.textContent ?? "").toMatch(/mis-?zoned/i);
  });

  it("does not show a mis-zoned chip when no state section rides a cached zone", () => {
    render(<PromptTab promptEvents={[makeEvent({ turn: 0, miszoned: false })]} />);
    selectTurn(0);
    expect(document.body.textContent ?? "").not.toMatch(/mis-?zoned/i);
  });

  // --- AC-6: PromptTab is the live consumer (wiring) ----------------------
  it("consumes the enriched event end-to-end (cached labels + usage + digest)", () => {
    render(<PromptTab promptEvents={[makeEvent({ turn: 0, stableDigest: "feedface" })]} />);
    selectTurn(0);
    const body = document.body.textContent ?? "";
    // All three new field groups must be reflected in the rendered output —
    // proving PromptTab actually reads zones.cached, cache_usage, and
    // cache_blocks.digest rather than ignoring the new contract.
    expect(body).toMatch(/\buncached\b/i);
    expect(body).toMatch(/11[,.]?168/);
    expect(body).toContain("feedface");
  });
});
