/**
 * Story 125-6 (rework, Reviewer [HIGH][SEC]) — Fate refresh token clamp (RED).
 *
 * Companion to FateCharacterSheet.free-invokes-clamp.test.tsx. The original fix
 * clamped the `free_invokes` pip loop but left the FatePoints `refresh` token loop
 * (`Array.from({ length: Math.max(0, refresh) }, …)`) unbounded — the IDENTICAL
 * unbounded-Array.from-on-wire-data DoS, in the same component, fed by the same
 * FateStatePayload.characters[].refresh field. `Math.max(0, refresh)` only floors
 * negatives; it does NOT cap the huge/Infinity case:
 *   - refresh = Infinity → Math.max(0, Infinity) = Infinity → Array.from throws
 *     `RangeError: Invalid array length` and CRASHES the Fate-sheet render;
 *   - refresh = 1e9 → ~1e9-node allocation → browser-tab hang.
 *
 * The fix clamps `refresh` the same way `free_invokes` is clamped (reuse the
 * helper). These tests pin it: a pathologically large finite refresh renders a
 * BOUNDED token count, a non-finite refresh does NOT throw, a valid refresh still
 * renders EXACTLY that many tokens, and refresh=0 renders ZERO tokens.
 *
 * NOTE (same deviation as the free-invokes file): the literal DoS value is 1e9,
 * but rendering the CURRENT (unclamped) code with 1e9 would materialize a billion
 * DOM nodes and hang/OOM the runner (1e9 < 2**32, so Array.from allocates rather
 * than throws). We use 1000 for the finite case and Infinity for the unbounded
 * case; a `Math.min(_, N)` clamp reduces 1e9, 1000, and Infinity identically.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FateCharacterSheet } from "../FatePanel";
import type { FateCharacterEntry } from "@/types/payloads";

// A ceiling well above any legitimate refresh (real Fate refresh is ~1–10). Both
// the huge-finite (1000) and unbounded (Infinity) payloads vastly exceed it, so
// the assertion is a true clamp discriminator without coupling to Dev's constant.
const SANE_TOKEN_CEILING = 100;

/** Minimal valid sheet carrying the `refresh` under test. `fate_points` is kept
 *  small (1) — it only drives the filled/empty state of each token, not the token
 *  COUNT (which is `refresh`). */
function sheetWithRefresh(refresh: number): FateCharacterEntry {
  return {
    name: "Groucho",
    fate_points: 1,
    refresh,
    skills: [],
    aspects: [],
    stress: {},
    consequences: [],
  };
}

describe("FateCharacterSheet — refresh token clamp (Story 125-6 rework)", () => {
  it("clamps a pathologically large finite refresh to a bounded token count", () => {
    render(<FateCharacterSheet character={sheetWithRefresh(1000)} />);
    // RED: current code renders 1000 fate-point tokens (1000 > ceiling). GREEN: bounded.
    expect(screen.queryAllByTestId("fate-point-token").length).toBeLessThanOrEqual(
      SANE_TOKEN_CEILING,
    );
  });

  it("does not throw a RangeError on a non-finite (Infinity) refresh", () => {
    // RED: `Array.from({ length: Math.max(0, Infinity) })` throws RangeError, so the
    // FatePoints render throws and crashes the sheet. GREEN: clamp reduces it to N.
    expect(() =>
      render(<FateCharacterSheet character={sheetWithRefresh(Infinity)} />),
    ).not.toThrow();
    expect(screen.queryAllByTestId("fate-point-token").length).toBeLessThanOrEqual(
      SANE_TOKEN_CEILING,
    );
  });

  it("renders exactly the requested token count for a valid refresh (clamp preserves truth)", () => {
    render(<FateCharacterSheet character={sheetWithRefresh(3)} />);
    expect(screen.getAllByTestId("fate-point-token")).toHaveLength(3);
  });

  it("renders zero tokens for refresh=0 (clamp must use ?? not ||; 0 is valid)", () => {
    render(<FateCharacterSheet character={sheetWithRefresh(0)} />);
    expect(screen.queryAllByTestId("fate-point-token")).toHaveLength(0);
  });
});
