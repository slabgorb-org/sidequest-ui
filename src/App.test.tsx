import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";

import App from "./App";

function renderApp() {
  return render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
});

afterEach(() => {
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders without crashing", () => {
    renderApp();
    // App should produce *something* in the DOM.
    expect(document.body.querySelector("#root, [data-testid='app']") ?? document.body.firstElementChild).toBeTruthy();
  });

  it("shows ConnectScreen when not connected", () => {
    renderApp();
    // ConnectScreen should be visible by default (not connected yet).
    expect(screen.getByLabelText(/player name/i)).toBeInTheDocument();
  });

  it("has a main content area", () => {
    renderApp();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WebSocket OPEN-transition wiring tests — playtest 2026-04-11 regression guard
//
// Context: InputBar was reported stuck in [disabled] state after an API-server
// restart + page reload. Root cause: the reconnect cleanup effect was a single
// useEffect gated on `readyState === OPEN && wasDisconnected && connected`. On
// page reload, `connected` is false when the WebSocket first transitions to
// OPEN, so the cleanup never fired — stale canType/thinking state could stick.
//
// The fix splits the effect into two:
//   (1) a defensive state reset that fires on ANY OPEN transition (no gate)
//   (2) a handshake re-send that keeps the `connected` gate (only real reconnects)
//
// These grep-style source tests pin the structural shape of the fix so a
// future refactor can't silently re-introduce the guard bug. Follows the same
// source-level wiring convention used in confrontation-wiring.test.tsx.
// ══════════════════════════════════════════════════════════════════════════════

describe("Wiring: App.tsx WebSocket OPEN-transition cleanup (playtest 2026-04-11)", () => {
  const readAppSrc = async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    return fs.readFileSync(path.resolve(__dirname, "./App.tsx"), "utf-8");
  };

  it("has a defensive cleanup effect that clears thinking on OPEN without a connected gate", async () => {
    const src = await readAppSrc();
    // Effect (1): must set setThinking(false) inside the OPEN-transition block.
    // Does NOT set canType — server "ready"/"waiting" event is authoritative
    // (playtest 2026-04-12 barrier reconnect fix). Must NOT reference `connected`.
    const defensiveBlock = src.match(
      /if\s*\(\s*readyState\s*===\s*WebSocket\.OPEN\s*&&\s*prevReadyState\.current\s*!==\s*WebSocket\.OPEN\s*\)\s*\{[\s\S]*?\}/,
    );
    expect(
      defensiveBlock,
      "App.tsx must contain a defensive OPEN-transition cleanup block that clears thinking without a `connected` gate.",
    ).not.toBeNull();
    const body = defensiveBlock![0];
    expect(body).toContain("setThinking(false)");
    expect(
      body.includes("setCanType(true)"),
      "Defensive cleanup must NOT set canType — server barrier state is authoritative on reconnect (playtest 2026-04-12).",
    ).toBe(false);
    expect(
      body.includes("connected"),
      "Defensive cleanup block must NOT reference `connected` — that guard is the exact bug we're fixing.",
    ).toBe(false);
  });

  it("keeps the reconnect handshake gated on `connected && wasDisconnected`", async () => {
    const src = await readAppSrc();
    // Effect (2): must still guard the re-handshake on `connected` so the
    // first-mount path (handled by the slug-connect effect) doesn't double-fire.
    expect(src).toMatch(
      /readyState\s*===\s*WebSocket\.OPEN\s*&&\s*wasDisconnected\s*&&\s*connected/,
    );
  });

  it("only sends SESSION_EVENT connect handshake when we have a saved session", async () => {
    const src = await readAppSrc();
    // The re-handshake effect must loadSession() and guard on its result,
    // otherwise we'd send connect payloads with empty fields on fresh visits.
    expect(src).toMatch(/const\s+saved\s*=\s*loadSession\(\)[\s\S]*?if\s*\(\s*saved\s*\)/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Wiring: SavedSession carries mode so auto-reconnect picks /play/ vs /solo/
// (playtest 2026-04-30 follow-on)
//
// Pre-fix the auto-reconnect navigate always wrote /solo/<slug> regardless
// of the saved session's actual mode. Reload of an MP session that briefly
// passed through "/" rewrote /play/<MP-slug> to /solo/<MP-slug>; per-prefix
// reducers and reconnect paths would then diverge from the server's notion
// of the session. saveSession now carries mode, the auto-reconnect path
// reads it, and the prefix matches the server-side session.mode.
// ══════════════════════════════════════════════════════════════════════════════

describe("Wiring: SavedSession mode + auto-reconnect prefix (playtest 2026-04-30)", () => {
  const readAppSrc = async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    return fs.readFileSync(path.resolve(__dirname, "./App.tsx"), "utf-8");
  };

  it("saveSession persists both gameSlug and mode to sessionStorage", async () => {
    const src = await readAppSrc();
    // The signature must accept a mode arg, and the persisted JSON must
    // include both fields. Pre-fix wrote only `{ gameSlug }`, which gave
    // the auto-reconnect path no way to recover the URL prefix.
    expect(src).toMatch(
      /function\s+saveSession\(\s*gameSlug:\s*string,\s*mode:\s*"solo"\s*\|\s*"multiplayer"\s*\)/,
    );
    expect(src).toMatch(
      /sessionStorage\.setItem\([^,]+,\s*JSON\.stringify\(\s*\{\s*gameSlug,\s*mode\s*\}\s*\)\s*\)/,
    );
  });

  it("SavedSession type carries an optional mode field", async () => {
    const src = await readAppSrc();
    // SavedSession must declare an optional mode field. Without it the
    // auto-reconnect path can't tell /play/ from /solo/.
    expect(src).toMatch(/mode\?:\s*"solo"\s*\|\s*"multiplayer"/);
    // And it must live on SavedSession itself (the only such interface
    // in App.tsx).
    expect(src).toMatch(/interface\s+SavedSession/);
  });

  it("auto-reconnect navigate selects /play/ when saved.mode is multiplayer, /solo/ otherwise", async () => {
    const src = await readAppSrc();
    // The branching prefix selection must be present and key on saved.mode.
    // Pre-fix line was a hardcoded `navigate(\`/solo/${saved.gameSlug}\`)`.
    expect(src).toMatch(
      /const\s+prefix\s*=\s*saved\.mode\s*===\s*"multiplayer"\s*\?\s*"\/play"\s*:\s*"\/solo"/,
    );
    expect(src).toMatch(
      /navigate\(\s*`\$\{prefix\}\/\$\{saved\.gameSlug\}`\s*\)/,
    );
    // Defensive: ensure no remaining unconditional /solo/<saved.gameSlug>
    // navigate exists in App.tsx that would re-introduce the bug.
    expect(src).not.toMatch(/navigate\(\s*`\/solo\/\$\{saved\.gameSlug\}`/);
  });

  it("slug-connect saveSession call passes the normalized server-side mode", async () => {
    const src = await readAppSrc();
    // saveSession must be called with both slug and the mode normalized
    // from the /api/games/:slug response — not bare slug. Pre-fix the
    // call was `saveSession(slug)`, which left mode unrecorded on every
    // resume.
    expect(src).toMatch(/saveSession\(\s*slug,\s*normalizedMode\s*\)/);
    // Old single-arg call site must be gone.
    expect(src).not.toMatch(/saveSession\(\s*slug\s*\)/);
  });
});
