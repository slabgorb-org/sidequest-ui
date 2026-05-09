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
import { render, screen } from "@testing-library/react";
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
      "character|rux|spell_slots_l1": {
        spec: {
          id: "spell_slots_l1",
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
    render(<LedgerPanel magicState={mageMagicState()} actorId="rux" />);
    // Both prepared spells visible. Magic Missile is still ready; Sleep is spent.
    expect(screen.getByText(/magic.?missile/i)).toBeTruthy();
    expect(screen.getByText(/sleep/i)).toBeTruthy();
  });

  it("renders an L1 slot indicator showing 1 of 2 remaining", () => {
    render(<LedgerPanel magicState={mageMagicState()} actorId="rux" />);
    // Slot count rendering — exact format up to the component author, but
    // "1/2" or "1 of 2" or two dots-with-one-empty must be visible.
    const text = document.body.textContent ?? "";
    const hasNumeric = /1\s*\/\s*2|1 of 2|●○|◉○/.test(text);
    expect(hasNumeric).toBe(true);
  });

  it("marks spent spells as struck-through-but-visible", () => {
    const { container } = render(
      <LedgerPanel magicState={mageMagicState()} actorId="rux" />,
    );
    // Sleep was cast; should appear with a strikethrough class or <s>/<del> tag.
    // The CSS class is up to the author; the test asserts "Sleep" is NOT
    // hidden but DOES carry a 'spent' or 'struck' marker (via class, tag,
    // or aria attribute).
    const sleepEl = Array.from(container.querySelectorAll("*")).find((el) =>
      (el.textContent ?? "").toLowerCase().includes("sleep"),
    );
    expect(sleepEl).toBeTruthy();
    // Walk up to find a strikethrough indicator.
    let cursor: Element | null = sleepEl ?? null;
    let foundStrike = false;
    while (cursor && cursor !== container) {
      const cls = cursor.getAttribute("class") ?? "";
      if (
        /spent|struck|cast/i.test(cls) ||
        cursor.tagName === "S" ||
        cursor.tagName === "DEL"
      ) {
        foundStrike = true;
        break;
      }
      cursor = cursor.parentElement;
    }
    expect(foundStrike).toBe(true);
  });

  it("does not render magic block for non-casters", () => {
    const fighterState = {
      ...mageMagicState(),
      known_spells: {},
      prepared_spells: {},
      spent_spells: {},
    } as unknown as MagicState;
    const { container } = render(
      <LedgerPanel magicState={fighterState} actorId="sam" />,
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
        actorId="rux"
        // @ts-expect-error — new prop introduced by 47-10
        rejectedSpellId={null}
      />,
    );
    rerender(
      <LedgerPanel
        magicState={mageMagicState()}
        actorId="rux"
        // @ts-expect-error — new prop introduced by 47-10
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
        actorId="rux"
        // @ts-expect-error — new prop introduced by 47-10
        rejectedSpellId="fireball"
      />,
    );
    // No <dialog>, no role="dialog", no element with class containing 'modal'.
    expect(container.querySelector("dialog, [role='dialog'], [class*='modal']")).toBeFalsy();
  });
});
