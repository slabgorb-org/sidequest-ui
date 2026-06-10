/**
 * Story 102-2 AC3 — the "Work a Spell" beat surfaces a prepared-spell picker.
 *
 * Measured AC5b gap #2 (epic 102): clicking the cast tile commits a generic
 * INT throw immediately — the player never says WHICH spell, so the server
 * can't route the cast spine, casts_remaining never moves, and Jade/Sebastien
 * watch a "cast" that spends nothing.
 *
 * Contract pinned here against the REAL ConfrontationOverlay:
 *
 *  1. Clicking the cast_spell tile with spellcasting data present does NOT
 *     commit immediately — it opens the picker (`data-testid="spell-picker"`)
 *     listing the prepared spells, with `casts_remaining` legible
 *     (player-facing math — CLAUDE.md Sebastien/Jade lane).
 *  2. Choosing a spell commits the beat WITH the spell id:
 *     `onBeatSelect("cast_spell", "wracking_bolt")`.
 *  3. Non-cast beats are untouched: immediate single-arg commit, no picker.
 *  4. A cast tile with NO spellcasting data must not silently commit a
 *     generic beat (No Silent Fallbacks, client edition).
 *
 * The `spellcasting` block mirrors the server contract pinned in
 * sidequest-server/tests/server/test_confrontation_payload_spellcasting_102_2.py:
 * `{ casts_remaining, casts_per_day, prepared: string[] }` on the
 * CONFRONTATION payload.
 *
 * Zork Problem guardrail: the picker is an alternate submit verb layered on
 * the existing beat-tile flow — typed free-text casting is 102-3, and the
 * `player_action` carry is pinned in cast-spell-throw-wiring-102-2.test.tsx.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  ConfrontationOverlay,
  type BeatOption,
  type ConfrontationData,
} from "../components/ConfrontationOverlay";

/**
 * 102-2 contract extension — Dev moves `spellcasting` into ConfrontationData
 * proper when wiring the server projection; the intersection type keeps this
 * RED suite compiling until then.
 */
type CastConfrontationData = ConfrontationData & {
  spellcasting?: {
    casts_remaining: number;
    casts_per_day?: number;
    prepared: string[];
  } | null;
};

const STRIKE_BEAT: BeatOption = {
  id: "strike",
  label: "Strike",
  kind: "strike",
  base: 2,
  stat_check: "STR",
  difficulty: 14,
};

const CAST_BEAT: BeatOption = {
  id: "cast_spell",
  label: "Work a Spell",
  kind: "strike",
  base: 2,
  stat_check: "INT",
  difficulty: 12,
};

function confrontation(
  spellcasting: CastConfrontationData["spellcasting"],
): CastConfrontationData {
  return {
    type: "combat",
    label: "Blade-work",
    category: "combat",
    actors: [
      { name: "Vesska", role: "combatant" },
      { name: "Furnace Thrall", role: "combatant" },
    ],
    player_metric: { name: "momentum", current: 0, starting: 0, threshold: 10 },
    opponent_metric: { name: "momentum", current: 0, starting: 0, threshold: 10 },
    beats: [STRIKE_BEAT, CAST_BEAT],
    secondary_stats: null,
    genre_slug: "heavy_metal",
    mood: "grim",
    spellcasting,
  };
}

const CASTER = {
  casts_remaining: 2,
  casts_per_day: 2,
  prepared: ["wracking_bolt", "grave_chill"],
};

describe("102-2: cast_spell tile opens the prepared-spell picker", () => {
  it("does not commit on tile click — it opens the picker with the prepared spells", () => {
    const onBeatSelect = vi.fn();
    render(
      <ConfrontationOverlay data={confrontation(CASTER)} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Work a Spell/i }));

    // The commit is deferred until a spell is chosen.
    expect(onBeatSelect).not.toHaveBeenCalled();

    const picker = screen.getByTestId("spell-picker");
    // One selectable option per prepared spell, addressable by spell id.
    const bolt = picker.querySelector('[data-spell-id="wracking_bolt"]');
    const chill = picker.querySelector('[data-spell-id="grave_chill"]');
    expect(bolt).not.toBeNull();
    expect(chill).not.toBeNull();
    // The option is a real, labeled control — not a bare data attribute.
    expect(bolt!.textContent ?? "").not.toBe("");
  });

  it("surfaces casts_remaining on the picker (player-visible math)", () => {
    render(<ConfrontationOverlay data={confrontation(CASTER)} onBeatSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Work a Spell/i }));

    const picker = screen.getByTestId("spell-picker");
    // Machine-readable pin for the economy readout; the visible text is free
    // to style it ("2/2 casts", "Casts: 2") but the number must be THIS one.
    expect(picker.getAttribute("data-casts-remaining")).toBe("2");
    expect(picker.textContent ?? "").toContain("2");
  });

  it("choosing a spell commits the beat WITH the spell id", () => {
    const onBeatSelect = vi.fn();
    render(
      <ConfrontationOverlay data={confrontation(CASTER)} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Work a Spell/i }));
    const option = screen
      .getByTestId("spell-picker")
      .querySelector('[data-spell-id="wracking_bolt"]');
    expect(option).not.toBeNull();
    fireEvent.click(option!);

    expect(onBeatSelect).toHaveBeenCalledTimes(1);
    const [beatId, spellId] = onBeatSelect.mock.calls[0] as [string, string];
    expect(beatId).toBe("cast_spell");
    expect(spellId).toBe("wracking_bolt");
  });
});

describe("102-2: non-cast beats are untouched (regression)", () => {
  it("commits a strike immediately with no picker and no spell id", () => {
    const onBeatSelect = vi.fn();
    render(
      <ConfrontationOverlay data={confrontation(CASTER)} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Strike/i }));

    expect(onBeatSelect).toHaveBeenCalledTimes(1);
    expect(onBeatSelect.mock.calls[0][0]).toBe("strike");
    expect(onBeatSelect.mock.calls[0][1]).toBeUndefined();
    expect(screen.queryByTestId("spell-picker")).toBeNull();
  });
});

describe("102-2: cast tile without spellcasting data refuses loudly", () => {
  it("never silently commits a generic cast when the economy is missing", () => {
    const onBeatSelect = vi.fn();
    render(
      <ConfrontationOverlay data={confrontation(null)} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Work a Spell/i }));

    // Today's bug IS the silent generic commit. With no spellcasting block the
    // overlay may disable the tile or render an empty-state message, but the
    // one thing it must never do is fire onBeatSelect("cast_spell") bare.
    expect(onBeatSelect).not.toHaveBeenCalled();
  });
});
