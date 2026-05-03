import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SensitivitiesSection } from "../SensitivitiesSection";
import type { MagicState, LedgerBar, LedgerBarSpec } from "../../types/magic";

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

describe("SensitivitiesSection", () => {
  it("renders cryptic pre-bleed copy when all character bars are at starts_at_chargen", () => {
    const ledger = Object.fromEntries([
      makeBar("sanity", "character", 1.0, 1.0),
      makeBar("notice", "character", 0.0, 0.0),
      makeBar("vitality", "character", 0.5, 0.5),
    ]);
    const state: MagicState = { config: baseConfig, ledger, working_log: [] };

    render(<SensitivitiesSection magicState={state} characterId="Itchy" />);

    expect(screen.getByRole("heading", { name: /sensitivities/i })).toBeInTheDocument();
    expect(screen.getByText(/you hear what the others don't\. sometimes\./i)).toBeInTheDocument();
    expect(screen.queryByText(/something stirred/i)).not.toBeInTheDocument();
  });

  it("renders expanded post-bleed copy when any character bar has drifted from starts_at_chargen", () => {
    const ledger = Object.fromEntries([
      // sanity drifted: starts at 1.0, now 0.95 (microbleed cost applied)
      makeBar("sanity", "character", 0.95, 1.0),
      makeBar("notice", "character", 0.0, 0.0),
      makeBar("vitality", "character", 0.5, 0.5),
    ]);
    const state: MagicState = { config: baseConfig, ledger, working_log: [] };

    render(<SensitivitiesSection magicState={state} characterId="Itchy" />);

    expect(screen.getByRole("heading", { name: /sensitivities/i })).toBeInTheDocument();
    expect(screen.getByText(/something stirred\. you felt it\./i)).toBeInTheDocument();
    // Cost-vocabulary line spans inline <strong> tags; narrow to the <p>
    // that contains all three labels (Sanity / Notice / Vitality) so the
    // match is unambiguous and proves the bold structure is intact.
    expect(
      screen.getByText((_, node) => {
        if (node?.tagName !== "P") return false;
        const t = node.textContent ?? "";
        return (
          t.includes("Sanity is the price of staying open") &&
          t.includes("Notice measures what you catch") &&
          t.includes("Vitality decides whether you can carry it back")
        );
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your own words, in the input bar/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/you hear what the others don't\. sometimes\./i),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when magicState is null (other genres / pre-magic worlds)", () => {
    const { container } = render(
      <SensitivitiesSection magicState={null} characterId="Itchy" />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("heading", { name: /sensitivities/i })).not.toBeInTheDocument();
  });

  it("renders nothing when the character has no ledger bars", () => {
    // magicState present but only world bars — character has not been added
    // to the ledger yet.
    const ledger = Object.fromEntries([makeBar("hegemony_heat", "world", 0.3, 0.3)]);
    const state: MagicState = { config: baseConfig, ledger, working_log: [] };

    const { container } = render(
      <SensitivitiesSection magicState={state} characterId="Itchy" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
