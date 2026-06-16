import { describe, expect, it } from "vitest";
import { buildTurnTokenCacheRows } from "../source/telemetryAdapter";
import type { WatcherEvent } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Story 125-3 — surface a MALFORMED cache_usage instead of silently folding to null
//
// CONCERN (from the 124-1 Reviewer audit, via silent-failure-hunter): in
// buildTurnTokenCacheRows, a cache_usage that is PRESENT (a dict) but whose
// `cache_read` is absent/non-numeric falls through the `typeof === "number"`
// guard into the SAME "null" bucket as a genuinely-absent cache_usage. That masks
// server schema-drift as a benign "non-SDK" turn — a No-Silent-Fallbacks
// violation: a present-but-broken payload and a deliberately-absent one read
// identically.
//
// The server contract guarantees cache_read is an int whenever the dict is present
// (test_prompt_cache_attribution_otel.py), so this surface is nil TODAY — this is
// defensive hardening.
//
// CONTRACT (TEA's chosen assertable surface): a malformed cache_usage produces a
// DISTINCT cacheState of "malformed" (cached stays null — we have no honest
// number), separate from the "null" bucket used for genuinely-absent cache_usage.
// (cacheState is cast to string below so this file compiles RED at RUNTIME before
// Dev widens the union, rather than failing to compile.)
// ══════════════════════════════════════════════════════════════════════════════

let clock = 0;
function ts(): string {
  clock += 1000;
  return new Date(Date.UTC(2026, 5, 16, 0, 0, 0) + clock).toISOString();
}

/** prompt_assembled carrying an arbitrary (possibly malformed) cache_usage. */
function promptWithUsage(turn: number, cacheUsage: unknown): WatcherEvent {
  return {
    timestamp: ts(),
    component: "prompt_builder",
    event_type: "prompt_assembled",
    severity: "info",
    fields: {
      turn_number: turn,
      agent_name: "narrator",
      total_tokens: 1234,
      cache_usage: cacheUsage,
    } as unknown as Record<string, unknown>,
  };
}

function turnComplete(turn: number, tokensIn: number, tokensOut: number): WatcherEvent {
  return {
    timestamp: ts(),
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

describe("buildTurnTokenCacheRows — malformed cache_usage is surfaced, not hidden", () => {
  it("flags a present dict missing cache_read as 'malformed', not silently 'null'", () => {
    // The exact story example: cache_usage={cache_write:500} — present, but no
    // cache_read. Today this folds to "null" (indistinguishable from non-SDK).
    const events = [
      promptWithUsage(1, { cache_write: 500 }),
      turnComplete(1, 3000, 100),
    ];
    const r = buildTurnTokenCacheRows(events)[0];
    expect(r).toBeDefined();
    // The real assertion: schema-drift is surfaced distinctly...
    expect(r.cacheState as string).toBe("malformed");
    // ...and NOT collapsed into the benign non-SDK bucket (the silent fold).
    expect(r.cacheState as string).not.toBe("null");
    // No honest number exists, so cached must stay null — never fabricated.
    expect(r.cached).toBeNull();
    expect(r.tokensIn).toBe(3000);
  });

  it("flags a present cache_read of the wrong type (non-numeric) as 'malformed'", () => {
    const events = [
      promptWithUsage(1, { cache_read: "lots" }),
      turnComplete(1, 4200, 120),
    ];
    const r = buildTurnTokenCacheRows(events)[0];
    expect(r.cacheState as string).toBe("malformed");
    expect(r.cacheState as string).not.toBe("null");
    expect(r.cached).toBeNull();
  });

  it("does NOT mislabel a genuinely-absent cache_usage (null) as malformed", () => {
    // Guard against over-triggering: a deliberately-absent payload (non-SDK
    // backend) stays "null". Absent ≠ malformed.
    const events = [promptWithUsage(1, null), turnComplete(1, 5000, 200)];
    const r = buildTurnTokenCacheRows(events)[0];
    expect(r.cacheState).toBe("null");
    expect(r.cached).toBeNull();
  });

  it("does NOT mislabel a turn with no preceding prompt as malformed", () => {
    // No prompt_assembled at all → unknown, "null" — not a malformed payload.
    const events = [turnComplete(1, 4000, 100)];
    const r = buildTurnTokenCacheRows(events)[0];
    expect(r.cacheState).toBe("null");
    expect(r.cached).toBeNull();
  });

  it("leaves a well-formed warm cache_usage unaffected", () => {
    // Guard: the new branch must not regress the happy path.
    const events = [
      promptWithUsage(1, { cache_read: 900 }),
      turnComplete(1, 100, 10),
    ];
    const r = buildTurnTokenCacheRows(events)[0];
    expect(r.cacheState).toBe("warm");
    expect(r.cached).toBe(900);
  });
});
