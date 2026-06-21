/**
 * Story 125-6 (AC1) — Fate aspect free-invoke clamp (RED).
 *
 * [MEDIUM][SEC] CONFIRMED in the 118-2 Reviewer pass, never filed until the
 * 2026-06-16 Fate deferred-cleanup triage. The Aspects sub-component renders one
 * pip per free invoke via `Array.from({ length: a.free_invokes })` (FatePanel.tsx,
 * the `Aspects` renderer). `free_invokes` is unclamped: a malformed FATE_STATE
 * payload with a huge or non-finite count passes the array-only boundary guard in
 * useStateMirror (which only checks `Array.isArray(characters/scene_aspects)`, not
 * the per-aspect scalar) and allocates a pathological array — a browser-tab DoS.
 *
 * The fix clamps the pip count before Array.from (e.g. `Math.min(Math.max(0,
 * a.free_invokes ?? 0), N)` for a sane N). These tests pin the clamp:
 *   - a pathologically large finite count renders a BOUNDED number of pips;
 *   - a non-finite (Infinity) count does NOT throw a RangeError;
 *   - a valid count still renders EXACTLY that many pips (clamp preserves truth);
 *   - free_invokes=0 renders ZERO pips (the clamp must use `?? 0`, never `|| N`,
 *     per the TS lang-review #4 nullish rule — 0 is falsy-but-valid).
 *
 * NOTE (deviation): the AC names `free_invokes = 1e9`. Rendering the CURRENT
 * (unclamped) code with 1e9 would materialize a billion DOM nodes and hang/OOM the
 * runner in the RED state (1e9 < 2**32, so Array.from does NOT throw — it
 * allocates). We use 1000 (still ~500x any legitimate pip count, a clean clamp
 * discriminator that renders instantly) for the finite case and Infinity for the
 * unbounded case. A `Math.min(_, N)` clamp reduces 1e9, 1000, and Infinity
 * identically, so the discriminator is equivalent.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FateCharacterSheet } from "../FatePanel";
import type { FateCharacterEntry } from "@/types/payloads";

// A ceiling well above any legitimate free-invoke count. Real aspects carry 0–2
// free invokes; the Fate SRD never approaches double digits. Both the huge-finite
// (1000) and unbounded (Infinity) payloads vastly exceed this, so the assertion is
// a true clamp discriminator WITHOUT coupling to Dev's exact clamp constant N.
const SANE_PIP_CEILING = 100;

/** Minimal valid one-aspect sheet; the single aspect carries `free_invokes` so the
 *  rendered `fate-pip` count maps 1:1 to the value under test. */
function sheetWithFreeInvokes(free_invokes: number): FateCharacterEntry {
  return {
    name: "Groucho",
    fate_points: 1,
    refresh: 2,
    skills: [],
    aspects: [{ kind: "high_concept", text: "Adrift in Oz", free_invokes }],
    stress: {},
    consequences: [],
  };
}

describe("FateCharacterSheet — free_invokes clamp (Story 125-6 AC1)", () => {
  it("clamps a pathologically large finite free_invokes to a bounded pip count", () => {
    render(<FateCharacterSheet character={sheetWithFreeInvokes(1000)} />);
    // RED: current code renders 1000 pips (1000 > ceiling). GREEN: bounded.
    expect(screen.queryAllByTestId("fate-pip").length).toBeLessThanOrEqual(
      SANE_PIP_CEILING,
    );
  });

  it("does not throw a RangeError on a non-finite (Infinity) free_invokes", () => {
    // RED: `Array.from({ length: Infinity })` throws RangeError synchronously, so
    // the render throws. GREEN: the clamp reduces Infinity to N and renders.
    expect(() =>
      render(<FateCharacterSheet character={sheetWithFreeInvokes(Infinity)} />),
    ).not.toThrow();
    expect(screen.queryAllByTestId("fate-pip").length).toBeLessThanOrEqual(
      SANE_PIP_CEILING,
    );
  });

  it("renders exactly the requested pip count for a valid value (clamp preserves truth)", () => {
    render(<FateCharacterSheet character={sheetWithFreeInvokes(2)} />);
    expect(screen.getAllByTestId("fate-pip")).toHaveLength(2);
  });

  it("renders zero pips for free_invokes=0 (clamp must use ?? not ||; 0 is valid)", () => {
    // Guards TS lang-review #4: a `a.free_invokes || N` fix would turn the
    // falsy-but-valid 0 into N pips. A `?? 0` clamp keeps it at 0.
    render(<FateCharacterSheet character={sheetWithFreeInvokes(0)} />);
    expect(screen.queryAllByTestId("fate-pip")).toHaveLength(0);
  });
});
