/**
 * Story 47-10 AC8 + AC9 — LedgerPanel magic block render + pulse-not-popup UX.
 *
 * The LedgerPanel must render a MagicBlock for casters whose MagicState carries
 * known_spells / prepared_spells. The block shows:
 *   - Known spells (collapsible count)
 *   - Prepared spells per level with slot indicator
 *   - Spent spells struck-through-but-visible until rest
 *   - divine_favor bar (Cleric only)
 *   - Turn Undead button (Cleric only)
 *
 * Default tier is the flavor register; Sebastien-tier numeric overlay deferred.
 *
 * Pulse-not-popup: when an unprepared cast is rejected, the prepared list
 * pulses (CSS class added for ~600ms) and the unprepared spell name appears
 * struck-through in the cast-attempt log. No modal, no rollback.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LedgerPanel } from "../LedgerPanel";
import type { MagicState } from "../../types/magic";

const baseConfig = {
  world_slug: "caverns_sunden",
  genre_slug: "caverns_and_claudes",
  allowed_sources: ["innate", "item_based"],
  active_plugins: ["item_legacy_v1", "innate_v1", "learned_v1"],
  intensity: 0.4,
  world_knowledge: { primary: "folkloric" as const },
  visibility: {},
  hard_limits: [],
  cost_types: ["components", "backlash", "slot"],
  ledger_bars: [],
  can_build_caster: true,
  can_build_item_user: true,
  narrator_register: "",
};

function mageMagicState(): MagicState {
  return {
    config: baseConfig,
    ledger: {
      "character|rux|slots_l1": {
        spec: {
          id: "slots_l1",
          scope: "character",
          direction: "down",
          range: [0.0, 2.0],
          decay_per_session: 0.0,
          starts_at_chargen: 2.0,
        },
        value: 1.0,  // 1 of 2 slots remaining (Sleep already cast)
      },
    },
    known_spells: {
      rux: [
        "magic_missile",
        "sleep",
        "charm_person",
        "light",
        "read_magic",
        "detect_magic",
      ],
    },
    prepared_spells: {
      rux: { 1: ["sleep", "magic_missile"] },
    },
    spent_spells: {
      rux: { 1: ["sleep"] },  // Sleep was cast; struck-through but visible
    },
    working_log: [],
  } as unknown as MagicState;
}

describe("LedgerPanel — magic block (AC8)", () => {
  it("renders the prepared spells list for a Mage", () => {
    const { container } = render(
      <LedgerPanel magicState={mageMagicState()} characterId="rux" />,
    );
    // Both prepared spells visible (in the Memorized magic section).
    // Use getAllByText since spells appear in both Known list and Prepared list.
    const preparedSection = container.querySelector(
      "[data-testid='magic-block-prepared']",
    ) as HTMLElement;
    expect(preparedSection).toBeTruthy();
    expect(preparedSection.textContent).toMatch(/magic_missile/);
    expect(preparedSection.textContent).toMatch(/sleep/i);
  });

  it("renders an L1 slot indicator showing 1 of 2 remaining", () => {
    render(<LedgerPanel magicState={mageMagicState()} characterId="rux" />);
    // Slot count rendering — exact format up to the component author, but
    // "1/2" or "1 of 2" or two dots-with-one-empty must be visible.
    const text = document.body.textContent ?? "";
    const hasNumeric = /1\s*\/\s*2|1 of 2|●○|◉○/.test(text);
    expect(hasNumeric).toBe(true);
  });

  it("marks spent spells as struck-through-but-visible", () => {
    const { container } = render(
      <LedgerPanel magicState={mageMagicState()} characterId="rux" />,
    );
    // Sleep was cast; should appear inside the prepared section with a
    // strikethrough class or <s>/<del> tag. We look for an <s>/<del>
    // element OR an element with a 'spent' / 'struck' class containing
    // 'sleep'.
    const struckCandidates = Array.from(
      container.querySelectorAll("s, del, .spent, .struck, [class*='spent']"),
    );
    const struckSleep = struckCandidates.find((el) =>
      (el.textContent ?? "").toLowerCase().includes("sleep"),
    );
    expect(struckSleep).toBeTruthy();
  });

  it("does not render magic block for non-casters", () => {
    const fighterState = {
      ...mageMagicState(),
      known_spells: {},
      prepared_spells: {},
      spent_spells: {},
    } as unknown as MagicState;
    const { container } = render(
      <LedgerPanel magicState={fighterState} characterId="sam" />,
    );
    // No prepared/known section text should appear.
    const text = (container.textContent ?? "").toLowerCase();
    expect(/prepared/i.test(text)).toBe(false);
  });
});

describe("LedgerPanel — pulse-not-popup rejection (AC9)", () => {
  it("adds a pulse class to the prepared list when an unprepared cast is rejected", () => {
    // Render the panel with a prop / event indicating a recent rejection.
    // The shape of this trigger is at the component author's discretion;
    // the test asserts that whatever surface emits the rejection causes
    // the prepared-list element to acquire a pulse-style class.
    const { container, rerender } = render(
      <LedgerPanel
        magicState={mageMagicState()}
        characterId="rux"
        rejectedSpellId={null}
      />,
    );
    rerender(
      <LedgerPanel
        magicState={mageMagicState()}
        characterId="rux"
        rejectedSpellId="fireball"
      />,
    );
    const pulseEl = container.querySelector(".pulse, [data-pulse], [class*='pulse']");
    expect(pulseEl).toBeTruthy();
  });

  it("does NOT render a modal dialog on rejection", () => {
    const { container } = render(
      <LedgerPanel
        magicState={mageMagicState()}
        characterId="rux"
        rejectedSpellId="fireball"
      />,
    );
    // No <dialog>, no role="dialog", no element with class containing 'modal'.
    expect(container.querySelector("dialog, [role='dialog'], [class*='modal']")).toBeFalsy();
  });
});
