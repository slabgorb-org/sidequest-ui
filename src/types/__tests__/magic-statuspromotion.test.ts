/**
 * Phase 5 prerequisite tests — Story 47-3 Task 5.1.
 *
 * Server has `StatusPromotion` (sidequest-server `sidequest/magic/models.py:114`)
 * and `LedgerBarSpec.promote_to_status: StatusPromotion | None`
 * (`models.py:151`). The TS mirror is missing both — discovered as a
 * "Major" drift during 47-1 verification.
 *
 * Without these the Phase 5 mandatory_outputs `status_add_wound` and
 * `status_add_scar` cannot render their promotion text/severity in the
 * LedgerPanel. Adding the type is the unblocker for the rest of the
 * story.
 *
 * These tests are runtime-shape assertions backed by static types: the
 * imports and casts fail at compile time when the type is missing, so
 * the test suite fails RED until the type is added to
 * `sidequest-ui/src/types/magic.ts`.
 */

import { describe, it, expect } from "vitest";

// Will fail to type-check (and therefore fail to compile under vitest)
// until `StatusPromotion` is exported from `../magic`.
import type { LedgerBarSpec, StatusPromotion } from "../magic";

describe("Phase 5 prerequisite — StatusPromotion type", () => {
  it("exposes StatusPromotion with text and severity", () => {
    const promotion: StatusPromotion = {
      text: "Bleeding through",
      severity: "Wound",
    };
    expect(promotion.text).toBe("Bleeding through");
    expect(promotion.severity).toBe("Wound");
  });

  it("constrains severity to the four valid promotion levels", () => {
    const wound: StatusPromotion["severity"] = "Wound";
    const scar: StatusPromotion["severity"] = "Scar";
    const scratch: StatusPromotion["severity"] = "Scratch";
    const boon: StatusPromotion["severity"] = "Boon";
    // Each constant must round-trip through the union without tsc errors.
    expect([wound, scar, scratch, boon]).toEqual([
      "Wound",
      "Scar",
      "Scratch",
      "Boon",
    ]);
  });

  it("LedgerBarSpec accepts a StatusPromotion under promote_to_status", () => {
    const spec: LedgerBarSpec = {
      id: "sanity",
      scope: "character",
      direction: "down",
      range: [0.0, 1.0],
      threshold_low: 0.4,
      decay_per_session: 0.0,
      starts_at_chargen: 1.0,
      promote_to_status: { text: "Bleeding through", severity: "Wound" },
    };
    expect(spec.promote_to_status?.text).toBe("Bleeding through");
    expect(spec.promote_to_status?.severity).toBe("Wound");
  });

  it("LedgerBarSpec.promote_to_status is optional and nullable", () => {
    // Bars with no promotion (world-scope hegemony_heat etc.) leave the
    // field absent. Server emits `null`; UI accepts both `null` and
    // `undefined`.
    const noPromotion: LedgerBarSpec = {
      id: "hegemony_heat",
      scope: "world",
      direction: "up",
      range: [0.0, 1.0],
      threshold_high: 0.7,
      decay_per_session: 0.05,
      starts_at_chargen: 0.3,
    };
    const explicitlyNull: LedgerBarSpec = {
      ...noPromotion,
      promote_to_status: null,
    };
    expect(noPromotion.promote_to_status).toBeUndefined();
    expect(explicitlyNull.promote_to_status).toBeNull();
  });
});
