/**
 * Story 47-3 — LedgerPanel renders promote_to_status on near-threshold bars.
 *
 * AC5: "LedgerPanel updates reflect outcome changes (bars, Status list
 * updated)". A bar that is near or past its threshold AND carries a
 * StatusPromotion definition (server-driven world-content per architect
 * addendum §5.3) must surface the promotion text + severity so the
 * player can see the impending or active status without opening a
 * separate panel.
 *
 * The current LedgerPanel ignores `promote_to_status`; this test fails
 * RED until the green-phase implementer wires the field through.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LedgerPanel } from "../LedgerPanel";
import type {
  LedgerBar,
  LedgerBarSpec,
  MagicState,
  WorldKnowledge,
} from "../../types/magic";

const WORLD_KNOWLEDGE: WorldKnowledge = {
  primary: "classified",
  local_register: "folkloric",
};

function makeState(bars: Array<[string, LedgerBar]>): MagicState {
  return {
    config: {
      world_slug: "coyote_star",
      genre_slug: "space_opera",
      allowed_sources: ["innate"],
      active_plugins: ["innate_v1"],
      intensity: 0.25,
      world_knowledge: WORLD_KNOWLEDGE,
      visibility: {},
      hard_limits: [],
      cost_types: ["sanity"],
      ledger_bars: bars.map(([, bar]) => bar.spec),
      can_build_caster: true,
      can_build_item_user: false,
      narrator_register: "x",
    },
    ledger: Object.fromEntries(bars),
    working_log: [],
  };
}

const SANITY_SPEC: LedgerBarSpec = {
  id: "sanity",
  scope: "character",
  direction: "down",
  range: [0.0, 1.0],
  threshold_low: 0.4,
  decay_per_session: 0.0,
  starts_at_chargen: 1.0,
  promote_to_status: { text: "Bleeding through", severity: "Wound" },
};

describe("LedgerPanel — promote_to_status surfacing (Story 47-3 AC5)", () => {
  it("renders promotion text when a bar is near its threshold and carries promote_to_status", () => {
    // sanity 0.42, threshold_low 0.40 — within 10% near-threshold band.
    const state = makeState([
      [
        "character|sira_mendes|sanity",
        { spec: SANITY_SPEC, value: 0.42 },
      ],
    ]);
    render(<LedgerPanel magicState={state} characterId="sira_mendes" />);

    const bar = screen.getByTestId("ledger-sanity");
    // Promotion text must appear within the bar so the player sees
    // the looming Status without opening another panel.
    expect(bar.textContent ?? "").toMatch(/Bleeding through/i);
  });

  it("exposes the promotion severity via a stable selector or attribute", () => {
    const state = makeState([
      [
        "character|sira_mendes|sanity",
        { spec: SANITY_SPEC, value: 0.42 },
      ],
    ]);
    render(<LedgerPanel magicState={state} characterId="sira_mendes" />);

    const bar = screen.getByTestId("ledger-sanity");
    // The DOM must expose the severity in a way styling and tests can
    // pin against — preferred contract: a `data-promotion-severity`
    // attribute on the bar root or its promotion subnode. The exact
    // location is implementer's choice; the *contract* is that the
    // severity is surfaced.
    const severityAttr =
      bar.getAttribute("data-promotion-severity") ??
      bar.querySelector("[data-promotion-severity]")?.getAttribute(
        "data-promotion-severity",
      );
    expect(severityAttr).toBe("Wound");
  });

  it("does not render promotion text when the bar lacks promote_to_status", () => {
    const noPromotionSpec: LedgerBarSpec = {
      id: "vitality",
      scope: "character",
      direction: "down",
      range: [0.0, 1.0],
      threshold_low: 0.3,
      decay_per_session: 0.0,
      starts_at_chargen: 1.0,
    };
    const state = makeState([
      [
        "character|sira_mendes|vitality",
        { spec: noPromotionSpec, value: 0.31 },
      ],
    ]);
    render(<LedgerPanel magicState={state} characterId="sira_mendes" />);

    const bar = screen.getByTestId("ledger-vitality");
    expect(
      bar.querySelector("[data-promotion-severity]"),
    ).toBeNull();
  });
});
