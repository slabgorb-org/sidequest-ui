import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LedgerPanel } from "../LedgerPanel";
import type { MagicState, LedgerBar, LedgerBarSpec } from "../../types/magic";

function makeBar(
  id: string,
  scope: "character" | "world",
  direction: "up" | "down" | "bidirectional",
  value: number,
  thresholds: Partial<LedgerBarSpec> = {},
): [string, LedgerBar] {
  const spec: LedgerBarSpec = {
    id,
    scope,
    direction,
    range: [0.0, 1.0],
    decay_per_session: 0.0,
    starts_at_chargen: 1.0,
    ...thresholds,
  };
  const owner = scope === "world" ? "coyote_star" : "sira_mendes";
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

describe("LedgerPanel", () => {
  it("renders character bars with current values", () => {
    const ledger = Object.fromEntries(
      [
        makeBar("sanity", "character", "down", 0.78, { threshold_low: 0.40 }),
        makeBar("notice", "character", "up", 0.22, { threshold_high: 0.75 }),
      ],
    );
    const state: MagicState = {
      config: baseConfig,
      ledger,
      working_log: [],
    };

    render(<LedgerPanel magicState={state} characterId="sira_mendes" />);

    expect(screen.getByText("sanity")).toBeInTheDocument();
    expect(screen.getByText(/0\.78/)).toBeInTheDocument();
    expect(screen.getByText("notice")).toBeInTheDocument();
    expect(screen.getByText(/0\.22/)).toBeInTheDocument();
  });

  it("renders world-shared bars in their own section", () => {
    const ledger = Object.fromEntries([
      makeBar("hegemony_heat", "world", "up", 0.31, { threshold_high: 0.70 }),
    ]);
    const state: MagicState = { config: baseConfig, ledger, working_log: [] };

    render(<LedgerPanel magicState={state} characterId="sira_mendes" />);
    expect(screen.getByText("hegemony_heat")).toBeInTheDocument();
    expect(screen.getByText(/0\.31/)).toBeInTheDocument();
  });

  it("renders nothing when magicState is null", () => {
    const { container } = render(
      <LedgerPanel magicState={null} characterId="sira_mendes" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("animates bar transition when value changes", async () => {
    const ledgerInitial = Object.fromEntries([
      makeBar("sanity", "character", "down", 0.78, { threshold_low: 0.40 }),
    ]);
    const stateA: MagicState = {
      config: baseConfig,
      ledger: ledgerInitial,
      working_log: [],
    };
    const { rerender } = render(
      <LedgerPanel magicState={stateA} characterId="sira_mendes" />,
    );
    expect(screen.getByText(/0\.78/)).toBeInTheDocument();

    const ledgerNext = Object.fromEntries([
      makeBar("sanity", "character", "down", 0.66, { threshold_low: 0.40 }),
    ]);
    const stateB: MagicState = {
      config: baseConfig,
      ledger: ledgerNext,
      working_log: [],
    };
    rerender(<LedgerPanel magicState={stateB} characterId="sira_mendes" />);
    expect(screen.getByText(/0\.66/)).toBeInTheDocument();
  });

  it("highlights bars near threshold", () => {
    const ledger = Object.fromEntries([
      makeBar("sanity", "character", "down", 0.42, { threshold_low: 0.40 }),
    ]);
    const state: MagicState = { config: baseConfig, ledger, working_log: [] };
    const { container } = render(
      <LedgerPanel magicState={state} characterId="sira_mendes" />,
    );

    // Component applies a "near-threshold" class when within 10% of threshold.
    const barElement = container.querySelector(".ledger-bar.near-threshold");
    expect(barElement).not.toBeNull();
  });
});

describe("LedgerPanel wiring into CharacterPanel", () => {
  it("CharacterPanel renders LedgerPanel bars when magicState is provided", async () => {
    const { CharacterPanel } = await import("../CharacterPanel");

    // Ledger keys must match character.name — server's add_character()
    // contract uses character.core.name as the owner_id, and CharacterPanel
    // passes character.name to LedgerPanel as characterId.
    const characterName = "sira_mendes";
    const sanityBar = makeBar("sanity", "character", "down", 0.78, {
      threshold_low: 0.40,
    });
    const heatBar = makeBar("hegemony_heat", "world", "up", 0.31, {
      threshold_high: 0.70,
    });
    const ledger = Object.fromEntries([sanityBar, heatBar]);
    const magicState: MagicState = {
      config: baseConfig,
      ledger,
      working_log: [],
    };

    render(
      <CharacterPanel
        character={{
          name: characterName,
          class: "drifter",
          level: 1,
          stats: {},
          abilities: [],
          class_moves: [],
          backstory: "x",
        }}
        magicState={magicState}
      />,
    );

    expect(screen.getByText("sanity")).toBeInTheDocument();
    expect(screen.getByText("hegemony_heat")).toBeInTheDocument();
  });

  it("CharacterPanel renders without LedgerPanel when magicState is null", async () => {
    const { CharacterPanel } = await import("../CharacterPanel");

    const { container } = render(
      <CharacterPanel
        character={{
          name: "Sira Mendes",
          class: "drifter",
          level: 1,
          stats: {},
          abilities: [],
          class_moves: [],
          backstory: "x",
        }}
        magicState={null}
      />,
    );

    expect(container.querySelector(".ledger-panel")).toBeNull();
  });
});
