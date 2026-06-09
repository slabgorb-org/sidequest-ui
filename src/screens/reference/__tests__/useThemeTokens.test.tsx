// Story 100-9 (Phase 2) — RED.
//
// Session-free theme injector (Concern C3). The reference projection JSON
// carries a FLAT CSS-variable token dict at `doc["theme"]`
// (`{ "--primary": "#c0392b", ... }`, see 100-7 server + src/types/reference.ts
// `ReferenceTheme`). This hook applies those tokens onto a DOM element via
// `element.style.setProperty(name, value)` — the SAME var-application mechanism
// the in-game `useGenreTheme` uses on `:root` — but fed from REST projection
// JSON, NOT the in-game WebSocket `theme_css` SESSION_EVENT channel. It must
// work on the `/reference/*` pages where there is NO WebSocket session.
//
// PINNED CONTRACT (the unit under test, to be created by Dev in GREEN):
//   src/screens/reference/useThemeTokens.ts
//   export function useThemeTokens(
//     theme: ReferenceTheme | undefined,
//     target?: HTMLElement,   // default: document.documentElement (:root)
//   ): void
//
// Semantics this suite pins:
//   1. Vars LAND — each "--var" in the dict is setProperty'd on the target.
//   2. NO WebSocket / game session is required or constructed.
//   3. CLEANUP on unmount — every var the hook set is removed (no leak back
//      into the lobby / in-game theme).
//   4. CLEANUP on theme change (pack switch) — vars from the PREVIOUS pack
//      that are absent from the new pack are removed (no cross-pack leak),
//      and shared vars are updated to the new value.
//   5. undefined / empty theme is a safe no-op (theme is optional on the
//      projection — RulesProjection/LoreProjection.theme?).
//   6. Default scope is document.documentElement; an explicit target element
//      is honored and documentElement is left untouched in that case.

import { renderHook } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { useThemeTokens } from "@/screens/reference/useThemeTokens";
import type { ReferenceTheme } from "@/types/reference";

// Defensive de-pollution: the default scope is the shared document element, so
// strip any fixture vars between tests in case a buggy implementation fails to
// clean up after itself (the cleanup tests are what *prove* it does).
const FIXTURE_VARS = ["--primary", "--background", "--accent", "--foreground"];
function stripFixtureVars(el: HTMLElement = document.documentElement) {
  for (const name of FIXTURE_VARS) el.style.removeProperty(name);
}
afterEach(() => stripFixtureVars());

const PACK_A: ReferenceTheme = {
  "--primary": "#c0392b",
  "--background": "#1a1a1a",
  "--accent": "#e67e22",
};

function read(name: string, el: HTMLElement = document.documentElement): string {
  return el.style.getPropertyValue(name).trim();
}

describe("useThemeTokens — session-free CSS-var injector (C3)", () => {
  it("applies each --var from the projection theme dict onto :root (vars LAND)", () => {
    renderHook(() => useThemeTokens(PACK_A));
    expect(read("--primary")).toBe("#c0392b");
    expect(read("--background")).toBe("#1a1a1a");
    expect(read("--accent")).toBe("#e67e22");
  });

  it("requires NO WebSocket / game session — none is constructed while applying the theme (C3)", () => {
    let wsConstructed = false;
    const RealWebSocket = globalThis.WebSocket;
    // @ts-expect-error — replace the constructor with a tripwire for the test.
    globalThis.WebSocket = function () {
      wsConstructed = true;
    } as unknown as typeof WebSocket;
    try {
      renderHook(() => useThemeTokens(PACK_A));
      expect(read("--primary")).toBe("#c0392b");
      expect(wsConstructed).toBe(false);
    } finally {
      globalThis.WebSocket = RealWebSocket;
    }
  });

  it("removes every applied var on unmount (no leak back into the in-game theme)", () => {
    const { unmount } = renderHook(() => useThemeTokens(PACK_A));
    expect(read("--primary")).toBe("#c0392b");
    unmount();
    expect(read("--primary")).toBe("");
    expect(read("--background")).toBe("");
    expect(read("--accent")).toBe("");
  });

  it("drops vars absent from the new pack and updates shared vars on a pack switch (no cross-pack leak)", () => {
    const packB: ReferenceTheme = {
      "--primary": "#2c3e50", // shared key, new value
      "--background": "#fafafa", // shared key, new value
      // NOTE: pack B has NO --accent — pack A's --accent must be removed.
    };
    const { rerender } = renderHook(({ theme }) => useThemeTokens(theme), {
      initialProps: { theme: PACK_A },
    });
    expect(read("--accent")).toBe("#e67e22");

    rerender({ theme: packB });
    expect(read("--primary")).toBe("#2c3e50");
    expect(read("--background")).toBe("#fafafa");
    // The stale var from pack A must NOT survive the switch.
    expect(read("--accent")).toBe("");
  });

  it("is a safe no-op when the projection carries no theme (theme is optional)", () => {
    expect(() => renderHook(() => useThemeTokens(undefined))).not.toThrow();
    expect(read("--primary")).toBe("");
  });

  it("honors an explicit target element and leaves documentElement untouched (scope contract)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      renderHook(() => useThemeTokens(PACK_A, container));
      expect(read("--primary", container)).toBe("#c0392b");
      // Default-scope element must NOT have been mutated.
      expect(read("--primary", document.documentElement)).toBe("");
    } finally {
      container.remove();
    }
  });
});
