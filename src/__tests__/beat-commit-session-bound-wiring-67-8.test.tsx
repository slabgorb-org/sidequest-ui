import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Story 67-8, Layer 3 — wiring guard for the beat-commit session-bound gate.
//
// beatDispatch.test.ts proves the gate LOGIC (refuse a beat when unbound).
// This file proves the gate is actually WIRED into App.tsx's production
// beat-commit path and that the `sessionBound` signal is driven from the real
// session lifecycle — not declared-and-ignored. Same source-assertion style as
// confrontation-wiring.test.tsx (App.tsx is too heavy to mount for this).

const appSrc = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");

describe("Wiring: 67-8 Layer 3 — handleBeatSelect gates on sessionBound", () => {
  it("App.tsx imports the beatDispatchBlockReason gate", () => {
    // Tolerate co-imports from the same module (e.g. isItemUseBeat, story
    // 106-4 Part C) — the guard is "beatDispatchBlockReason is imported from
    // @/lib/beatDispatch", not "it is the SOLE import".
    expect(appSrc).toMatch(
      /import\s*\{[^}]*\bbeatDispatchBlockReason\b[^}]*\}\s*from\s*["']@\/lib\/beatDispatch["']/,
    );
  });

  it("handleBeatSelect calls the gate with the sessionBound signal and bails on a block", () => {
    // The gate must receive sessionBound (not just thinking/confrontationData)
    // and an early return must follow — otherwise the commit proceeds unbound.
    expect(appSrc).toMatch(
      /beatDispatchBlockReason\(\s*beatId\s*,\s*\{[\s\S]*?sessionBound[\s\S]*?\}\s*\)/,
    );
    expect(appSrc).toMatch(/if\s*\(\s*block\s*\)\s*\{[\s\S]*?return;[\s\S]*?\}/);
  });

  it("sessionBound is in handleBeatSelect's dependency array", () => {
    // Stale-closure guard: without sessionBound in deps the callback would
    // capture the initial `false` and block every beat forever.
    expect(appSrc).toMatch(
      /const handleBeatSelect\s*=\s*useCallback\([\s\S]*?\[\s*confrontationData,\s*thinking,\s*sessionBound,/,
    );
  });

  it("sessionBound is SET true on server connected/ready", () => {
    // The bind confirmation that makes commit safe.
    expect(appSrc).toMatch(/setSessionBound\(true\)/);
    expect(appSrc).toMatch(/event === "connected" \|\| event === "ready"/);
  });

  it("sessionBound is RESET false on socket drop / re-handshake (non-OPEN readyState)", () => {
    expect(appSrc).toMatch(
      /if\s*\(\s*readyState\s*!==\s*WebSocket\.OPEN\s*\)\s*setSessionBound\(false\)/,
    );
  });

  it("sessionBound is RESET false on a session_unbound rejection", () => {
    // The zombie-bind path (socket stays OPEN but server session is unbound).
    expect(appSrc).toMatch(
      /code === "session_unbound"[\s\S]*?setSessionBound\(false\)/,
    );
  });

  it("handleDiceThrow ALSO gates on sessionBound (post-review): refuse a throw if the session unbinds mid-physics", () => {
    // handleBeatSelect gates roll START; the session can unbind during the
    // 1-2s dice animation, so handleDiceThrow must re-check sessionBound at
    // SEND time and refuse (reset dice state) rather than flush a DICE_THROW
    // into an unbound socket. Without this, AC3 still costs one bounce in the
    // mid-physics race.
    const throwBody = appSrc.match(
      /const handleDiceThrow\s*=\s*useCallback\([\s\S]*?\n\s*\[diceRequest[\s\S]*?\],\s*\n\s*\);/,
    );
    expect(throwBody).not.toBeNull();
    const body = throwBody?.[0] ?? "";
    // Guards on !sessionBound and bails (does not call send for that frame).
    expect(body).toMatch(/if\s*\(\s*!sessionBound\s*\)\s*\{[\s\S]*?return;[\s\S]*?\}/);
    // sessionBound is in the dependency array (no stale closure).
    expect(body).toMatch(/\[diceRequest,\s*sessionBound,\s*send\]/);
  });
});
