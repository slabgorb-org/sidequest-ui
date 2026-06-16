import { describe, expect, it } from "vitest";
// RED (Story 124-1): `buildTurnTokenCacheRows` does not exist yet — import fails
// until Dev adds it to telemetryAdapter.ts. This is the join the Inspector's
// Timing token chart needs to split per-turn tokens-in into cached vs fresh.
import {
  buildTurnTokenCacheRows,
  type TurnTokenCacheRow,
} from "../source/telemetryAdapter";
import type { WatcherEvent } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Story 124-1 — per-turn cached/fresh token split (the JOIN contract)
//
// Architect ruling (The Man in Black, 2026-06-16), grounded in measured server
// facts:
//   • turn_complete.token_count_in == narrator Anthropic `input_tokens`, which is
//     ALREADY cache-EXCLUSIVE (fresh). cache_read lives on the narrator
//     prompt_assembled event's cache_usage.
//   • The honest stack is ADDITIVE: cached = cache_read, fresh = token_count_in,
//     total = cached + fresh. fresh is NEVER token_count_in − cache_read.
//   • Pair each turn with the narrator prompt_assembled that PRECEDES it in
//     stream order (NOT by turn_number — turn_number collides across sessions in
//     a forensic bundle, and a turn_number join would cross-attribute one
//     session's cache onto another's). Adjacency in the ordered stream is
//     session-safe because the server emits prompt→turn adjacently per turn.
//   • cold (cache_usage present, cache_read===0) ≠ null (no cache_usage; non-SDK
//     backend / build-time event). null renders fresh-only and is EXCLUDED from
//     hit-rate; it is never scored as a miss.
//
// These tests pin that contract. They fail RED because the join does not exist.
// ══════════════════════════════════════════════════════════════════════════════

interface CacheUsage {
  cache_read: number;
  cache_write: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cost_usd: number;
  cache_ttl: string;
}

function usage(cache_read: number, cache_write = 0): CacheUsage {
  return {
    cache_read,
    cache_write,
    cache_write_5m: 0,
    cache_write_1h: cache_write,
    cost_usd: 0.01,
    cache_ttl: "1h",
  };
}

let clock = 0;
function ts(): string {
  // Monotonic timestamps so stream order is unambiguous in fixtures.
  clock += 1000;
  return new Date(Date.UTC(2026, 5, 16, 0, 0, 0) + clock).toISOString();
}

function promptAssembled(opts: {
  turn: number;
  cacheUsage: CacheUsage | null;
  agent?: string;
}): WatcherEvent {
  return {
    timestamp: ts(),
    component: "prompt_builder",
    event_type: "prompt_assembled",
    severity: "info",
    fields: {
      turn_number: opts.turn,
      agent_name: opts.agent ?? "narrator",
      total_tokens: 1234,
      cache_usage: opts.cacheUsage,
    } as unknown as Record<string, unknown>,
  };
}

function turnComplete(opts: {
  turn: number;
  in: number;
  out: number;
  genre?: string;
  world?: string;
  player_id?: string;
}): WatcherEvent {
  return {
    timestamp: ts(),
    component: "orchestrator",
    event_type: "turn_complete",
    severity: "info",
    fields: {
      turn_number: opts.turn,
      agent_name: "narrator",
      token_count_in: opts.in,
      token_count_out: opts.out,
      genre: opts.genre,
      world: opts.world,
      player_id: opts.player_id,
    } as unknown as Record<string, unknown>,
  };
}

function rowFor(rows: TurnTokenCacheRow[], turnNumber: number): TurnTokenCacheRow {
  const r = rows.find((x) => x.turnNumber === turnNumber);
  if (!r) throw new Error(`no row for turn ${turnNumber}: ${JSON.stringify(rows)}`);
  return r;
}

describe("buildTurnTokenCacheRows — additive cached/fresh split", () => {
  it("keeps fresh = token_count_in and cached = cache_read (ADDITIVE, never subtracts)", () => {
    // A heavily-cached turn: 2000 fresh + 18000 cached. The classic mistake is
    // fresh = 2000 − 18000 = −16000. The honest answer is fresh=2000, cached=18000.
    const events = [
      promptAssembled({ turn: 1, cacheUsage: usage(18000) }),
      turnComplete({ turn: 1, in: 2000, out: 300 }),
    ];
    const rows = buildTurnTokenCacheRows(events);
    const r = rowFor(rows, 1);

    expect(r.tokensIn).toBe(2000); // fresh, taken verbatim from token_count_in
    expect(r.cached).toBe(18000); // cache_read, NOT derived from token_count_in
    expect(r.tokensOut).toBe(300);
    expect(r.cacheState).toBe("warm");
    // Guard the subtraction bug explicitly: fresh must never go negative or be
    // reduced by cache_read.
    expect(r.tokensIn).toBeGreaterThanOrEqual(0);
    expect(r.tokensIn).not.toBe(2000 - 18000);
    // The honest total prompt size is the SUM.
    expect((r.cached ?? 0) + r.tokensIn).toBe(20000);
  });

  it("carries turnIndex (1-based chronological) and turnNumber (display)", () => {
    const events = [
      promptAssembled({ turn: 7, cacheUsage: usage(50) }),
      turnComplete({ turn: 7, in: 100, out: 10 }),
      promptAssembled({ turn: 8, cacheUsage: usage(60) }),
      turnComplete({ turn: 8, in: 120, out: 12 }),
    ];
    const rows = buildTurnTokenCacheRows(events);
    expect(rows).toHaveLength(2);
    expect(rows[0].turnIndex).toBe(1);
    expect(rows[0].turnNumber).toBe(7);
    expect(rows[1].turnIndex).toBe(2);
    expect(rows[1].turnNumber).toBe(8);
  });
});

describe("buildTurnTokenCacheRows — cold vs null are DISTINCT", () => {
  it("flags a real cache miss (cache_usage present, cache_read===0) as cold with cached=0", () => {
    const events = [
      promptAssembled({ turn: 1, cacheUsage: usage(0) }),
      turnComplete({ turn: 1, in: 5000, out: 200 }),
    ];
    const r = rowFor(buildTurnTokenCacheRows(events), 1);
    expect(r.cacheState).toBe("cold");
    expect(r.cached).toBe(0); // a KNOWN zero, not unknown
    expect(r.tokensIn).toBe(5000);
  });

  it("marks a non-SDK turn (cache_usage===null) as null with cached=null — never a fabricated number", () => {
    const events = [
      promptAssembled({ turn: 1, cacheUsage: null }),
      turnComplete({ turn: 1, in: 5000, out: 200 }),
    ];
    const r = rowFor(buildTurnTokenCacheRows(events), 1);
    expect(r.cacheState).toBe("null");
    expect(r.cached).toBeNull(); // unknown — distinct from cold's known 0
    expect(r.tokensIn).toBe(5000);
  });

  it("treats a turn with NO preceding prompt_assembled as null (not cold, not zero)", () => {
    const events = [turnComplete({ turn: 1, in: 4000, out: 100 })];
    const r = rowFor(buildTurnTokenCacheRows(events), 1);
    expect(r.cacheState).toBe("null");
    expect(r.cached).toBeNull();
    expect(r.tokensIn).toBe(4000);
  });
});

describe("buildTurnTokenCacheRows — session-safe stream-order pairing", () => {
  it("pairs by adjacency in the stream, NOT by turn_number (no cross-session attribution)", () => {
    // Two different sessions BOTH have turn_number === 1. A turn_number join
    // would cross-link Session B's turn onto Session A's cache (or vice versa).
    // Adjacency pairing must keep each turn's cache local to its own session.
    const events = [
      promptAssembled({ turn: 1, cacheUsage: usage(100) }), // session A's prompt
      turnComplete({ turn: 1, in: 10, out: 1, genre: "a", world: "a", player_id: "alice" }),
      promptAssembled({ turn: 1, cacheUsage: usage(0) }), // session B's prompt (cold)
      turnComplete({ turn: 1, in: 20, out: 2, genre: "b", world: "b", player_id: "bob" }),
    ];
    const rows = buildTurnTokenCacheRows(events);
    expect(rows).toHaveLength(2);

    // Session A turn: 10 fresh + 100 cached (warm).
    expect(rows[0].tokensIn).toBe(10);
    expect(rows[0].cached).toBe(100);
    expect(rows[0].cacheState).toBe("warm");

    // Session B turn: 20 fresh, cold (cache_read 0) — must NOT inherit A's 100.
    expect(rows[1].tokensIn).toBe(20);
    expect(rows[1].cached).toBe(0);
    expect(rows[1].cacheState).toBe("cold");
    expect(rows[1].cached).not.toBe(100); // the cross-session lie this guards against
  });

  it("uses the MOST RECENT preceding prompt_assembled when several precede a turn", () => {
    // Defensive: a stale build-time event (cache_usage=null) followed by the
    // enriched narrator event (real cache_read) before the turn — the enriched
    // (closest preceding) one wins, not the stale one.
    const events = [
      promptAssembled({ turn: 1, cacheUsage: null }), // stale build-time
      promptAssembled({ turn: 1, cacheUsage: usage(900) }), // enriched, closest
      turnComplete({ turn: 1, in: 100, out: 10 }),
    ];
    const r = rowFor(buildTurnTokenCacheRows(events), 1);
    expect(r.cached).toBe(900);
    expect(r.cacheState).toBe("warm");
  });

  it("does not consume one prompt event for two turns", () => {
    // The prompt before turn 1 belongs to turn 1 only; turn 2 (no prompt of its
    // own) must be null, not a re-use of turn 1's cache.
    const events = [
      promptAssembled({ turn: 1, cacheUsage: usage(500) }),
      turnComplete({ turn: 1, in: 50, out: 5 }),
      turnComplete({ turn: 2, in: 60, out: 6 }),
    ];
    const rows = buildTurnTokenCacheRows(events);
    expect(rows[0].cached).toBe(500);
    expect(rows[0].cacheState).toBe("warm");
    expect(rows[1].cached).toBeNull();
    expect(rows[1].cacheState).toBe("null");
  });
});
