import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterPanel } from "../components/CharacterPanel";
import type { CharacterSheetData, AbilityDefinition } from "../components/CharacterSheet";
import type { MagicState, LedgerBar, LedgerBarSpec } from "../types/magic";

const makeAbility = (name: string): AbilityDefinition => ({
  name,
  genre_description: `${name} description.`,
  mechanical_effect: `${name} effect.`,
  involuntary: false,
  source: "Class",
});

function makeBar(
  id: string,
  scope: "character" | "world",
  value: number,
  startsAtChargen: number,
): [string, LedgerBar] {
  const spec: LedgerBarSpec = {
    id,
    scope,
    direction: scope === "world" ? "up" : "down",
    range: [0.0, 1.0],
    decay_per_session: 0.0,
    starts_at_chargen: startsAtChargen,
  };
  const owner = scope === "world" ? "coyote_star" : "Itchy";
  return [`${scope}|${owner}|${id}`, { spec, value }];
}

const baseConfig = {
  world_slug: "coyote_star",
  genre_slug: "space_opera",
  allowed_sources: ["innate", "item_based"],
  active_plugins: ["innate_v1", "item_legacy_v1"],
  intensity: 0.25,
  world_knowledge: { primary: "classified" as const, local_register: "folkloric" as const },
  visibility: {},
  hard_limits: [],
  cost_types: ["sanity", "notice"],
  ledger_bars: [],
  can_build_caster: false,
  can_build_item_user: true,
  narrator_register: "",
};

const character: CharacterSheetData = {
  name: "Itchy",
  class: "smuggler",
  level: 1,
  stats: { Edge: 10 },
  abilities: [makeAbility("Read a Manifest at a Glance")],
  class_moves: [],
  backstory: "",
};

describe("Sensitivities wiring through CharacterPanel", () => {
  beforeEach(() => {
    // useLocalPrefs reads localStorage on mount — clear between tests so
    // the per-test localStorage.setItem call is the only source of state.
    window.localStorage.clear();
  });

  it("renders Sensitivities on the Abilities tab when coyote_star magicState is present", () => {
    const ledger = Object.fromEntries([
      makeBar("sanity", "character", 1.0, 1.0),
      makeBar("notice", "character", 0.0, 0.0),
      makeBar("vitality", "character", 0.5, 0.5),
    ]);
    const magicState: MagicState = { config: baseConfig, ledger, working_log: [] };

    // Force the abilities tab via localStorage prefs (the panel persists
    // activeTab through useLocalPrefs). Set BEFORE render.
    window.localStorage.setItem(
      "sq-character-panel",
      JSON.stringify({ activeTab: "abilities" }),
    );

    render(<CharacterPanel character={character} magicState={magicState} />);

    expect(screen.getByRole("heading", { name: /sensitivities/i })).toBeInTheDocument();
    expect(screen.getByText(/you hear what the others don't\. sometimes\./i)).toBeInTheDocument();
  });

  it("omits Sensitivities entirely when magicState is null", () => {
    window.localStorage.setItem(
      "sq-character-panel",
      JSON.stringify({ activeTab: "abilities" }),
    );

    render(<CharacterPanel character={character} magicState={null} />);

    expect(screen.queryByRole("heading", { name: /sensitivities/i })).not.toBeInTheDocument();
  });
});
