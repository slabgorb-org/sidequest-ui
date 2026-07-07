/**
 * Story 158-56 — the "Use Mutation" beat surfaces an owned-mutation picker.
 *
 * 158-54 wired the dice-path mutation route on the server: a
 * `mutation_resolution`-marked beat commit carrying `mutation_id` names WHICH
 * owned mutation to use (the Strain/usage spine). But the overlay commits the
 * `mutant_ability` tile as a generic WIS strike — the player never says which
 * mutation, so the server raises the loud missing-`mutation_id` DiceDispatchError
 * (or the marquee mechanic is simply unusable). This is the 102-2 cast disease,
 * one beat over.
 *
 * Contract pinned here against the REAL ConfrontationOverlay (the spell-picker
 * twin, spell-picker-cast-beat-102-2.test.tsx):
 *
 *  1. Clicking a `mutation_resolution` beat with `mutation_economy` present does
 *     NOT commit immediately — it opens the picker (`data-testid="mutation-picker"`)
 *     listing the owned mutations, addressable by `data-mutation-id`.
 *  2. Each option surfaces its `strain_cost` (player-facing math — the
 *     Sebastien/Jade lane, the `casts_remaining` analog).
 *  3. Choosing a mutation commits the beat WITH the mutation id (and no spell id):
 *     `onBeatSelect("mutant_ability", undefined, "structure/iron_hide")`.
 *  4. Non-mutation beats are untouched: immediate single-arg commit, no picker.
 *  5. A `mutation_resolution` tile with NO economy must not silently commit a
 *     generic beat (No Silent Fallbacks, client edition).
 *  6. Regression: the 102-2 spell picker is unaffected — a `cast_spell` beat with
 *     `spellcasting` still opens the spell picker, not the mutation picker.
 *
 * Detection is by the beat's `mutation_resolution` marker (projected on the beat
 * dict by build_confrontation_payload, rules.yaml carries it on `mutant_ability`),
 * NOT a hardcoded beat id — content is free to name the beat anything.
 *
 * The `mutation_economy` block mirrors the server contract pinned in
 * sidequest-server/tests/server/test_confrontation_payload_mutation_economy_158_56.py:
 * `{ owned: { id, name, strain_cost }[] }` on the CONFRONTATION payload.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  ConfrontationOverlay,
  type BeatOption,
  type ConfrontationData,
} from "../components/ConfrontationOverlay";

/**
 * 158-56 contract extension — Dev moves `mutation_economy` into ConfrontationData
 * proper (and `mutation_resolution` onto BeatOption) when wiring the server
 * projection; the intersection types keep this RED suite compiling until then.
 */
type MutationBeat = BeatOption & { mutation_resolution?: boolean };

type MutantConfrontationData = ConfrontationData & {
  mutation_economy?: {
    owned: { id: string; name: string; strain_cost: number }[];
  } | null;
  spellcasting?: {
    casts_remaining: number;
    casts_per_day?: number;
    prepared: string[];
  } | null;
};

const ATTACK_BEAT: BeatOption = {
  id: "attack",
  label: "Attack",
  kind: "strike",
  base: 2,
  stat_check: "STR",
  difficulty: 12,
};

const MUTATE_BEAT: MutationBeat = {
  id: "mutant_ability",
  label: "Use Mutation",
  kind: "strike",
  base: 4,
  stat_check: "WIS",
  difficulty: 12,
  mutation_resolution: true,
};

const OWNED: NonNullable<MutantConfrontationData["mutation_economy"]> = {
  owned: [
    { id: "structure/iron_hide", name: "Iron Hide", strain_cost: 1 },
    { id: "sense/keen_sight", name: "Keen Sight", strain_cost: 0 },
  ],
};

function confrontation(
  mutation_economy: MutantConfrontationData["mutation_economy"],
): MutantConfrontationData {
  return {
    type: "combat",
    label: "Wasteland Brawl",
    category: "combat",
    actors: [
      { name: "Rust", role: "combatant" },
      { name: "Feral Raider", role: "combatant" },
    ],
    player_metric: { name: "momentum", current: 0, starting: 0, threshold: 7 },
    opponent_metric: { name: "momentum", current: 0, starting: 0, threshold: 7 },
    beats: [ATTACK_BEAT, MUTATE_BEAT],
    secondary_stats: null,
    genre_slug: "mutant_wasteland",
    mood: "combat",
    mutation_economy,
  };
}

describe("158-56: the mutation beat opens the owned-mutation picker", () => {
  it("does not commit on tile click — it opens the picker with the owned mutations", () => {
    const onBeatSelect = vi.fn();
    render(
      <ConfrontationOverlay data={confrontation(OWNED)} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Use Mutation/i }));

    // The commit is deferred until a mutation is chosen.
    expect(onBeatSelect).not.toHaveBeenCalled();

    const picker = screen.getByTestId("mutation-picker");
    const ironHide = picker.querySelector('[data-mutation-id="structure/iron_hide"]');
    const keenSight = picker.querySelector('[data-mutation-id="sense/keen_sight"]');
    expect(ironHide).not.toBeNull();
    expect(keenSight).not.toBeNull();
    // A real, labeled control — not a bare data attribute.
    expect(ironHide!.textContent ?? "").toContain("Iron Hide");
  });

  it("surfaces each mutation's strain cost on the picker (player-visible math)", () => {
    render(<ConfrontationOverlay data={confrontation(OWNED)} onBeatSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Use Mutation/i }));

    const picker = screen.getByTestId("mutation-picker");
    const ironHide = picker.querySelector('[data-mutation-id="structure/iron_hide"]');
    expect(ironHide).not.toBeNull();
    // Machine-readable pin for the economy readout; the visible text is free to
    // style it ("Strain 1", "1 STR") but the number must be THIS one.
    expect(ironHide!.getAttribute("data-strain-cost")).toBe("1");
    expect(picker.textContent ?? "").toContain("Iron Hide");
  });

  it("choosing a mutation commits the beat WITH the mutation id (and no spell id)", () => {
    const onBeatSelect = vi.fn();
    render(
      <ConfrontationOverlay data={confrontation(OWNED)} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Use Mutation/i }));
    const option = screen
      .getByTestId("mutation-picker")
      .querySelector('[data-mutation-id="structure/iron_hide"]');
    expect(option).not.toBeNull();
    fireEvent.click(option!);

    expect(onBeatSelect).toHaveBeenCalledTimes(1);
    // Overlay-level signature is (beatId, spellId?, mutationId?) — spell and
    // mutation are mutually exclusive picks, so the mutation rides its own slot
    // and the spell slot stays undefined.
    const [beatId, spellId, mutationId] = onBeatSelect.mock.calls[0] as [
      string,
      string | undefined,
      string | undefined,
    ];
    expect(beatId).toBe("mutant_ability");
    expect(mutationId).toBe("structure/iron_hide");
    expect(spellId).toBeUndefined();
  });
});

describe("158-56: non-mutation beats are untouched (regression)", () => {
  it("commits an attack immediately with no picker and no mutation id", () => {
    const onBeatSelect = vi.fn();
    render(
      <ConfrontationOverlay data={confrontation(OWNED)} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Attack/i }));

    expect(onBeatSelect).toHaveBeenCalledTimes(1);
    expect(onBeatSelect.mock.calls[0][0]).toBe("attack");
    // No spell id, no mutation id on a plain strike.
    expect(onBeatSelect.mock.calls[0][1]).toBeUndefined();
    expect(onBeatSelect.mock.calls[0][2]).toBeUndefined();
    expect(screen.queryByTestId("mutation-picker")).toBeNull();
  });
});

describe("158-56: mutation tile without economy refuses loudly", () => {
  it("never silently commits a generic mutation beat when the economy is missing", () => {
    const onBeatSelect = vi.fn();
    render(
      <ConfrontationOverlay data={confrontation(null)} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Use Mutation/i }));

    // Today's bug IS the silent generic commit. With no mutation_economy the
    // overlay may disable the tile or show an empty-state, but the one thing it
    // must never do is fire onBeatSelect("mutant_ability") bare (→ server raises
    // the missing-mutation_id DiceDispatchError).
    expect(onBeatSelect).not.toHaveBeenCalled();
  });
});

describe("158-56: the 102-2 spell picker is unaffected (regression)", () => {
  const CAST_BEAT: BeatOption = {
    id: "cast_spell",
    label: "Work a Spell",
    kind: "strike",
    base: 2,
    stat_check: "INT",
    difficulty: 12,
  };

  function casterConfrontation(): MutantConfrontationData {
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
      beats: [ATTACK_BEAT, CAST_BEAT],
      secondary_stats: null,
      genre_slug: "heavy_metal",
      mood: "grim",
      spellcasting: { casts_remaining: 2, casts_per_day: 2, prepared: ["wracking_bolt"] },
    };
  }

  it("still opens the spell picker (not the mutation picker) on a cast beat", () => {
    render(
      <ConfrontationOverlay data={casterConfrontation()} onBeatSelect={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Work a Spell/i }));

    expect(screen.getByTestId("spell-picker")).not.toBeNull();
    expect(screen.queryByTestId("mutation-picker")).toBeNull();
  });
});
