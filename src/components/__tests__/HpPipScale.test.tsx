/**
 * RED tests — Story 68-1 (AC4): per-genre survivability-pool label reskin.
 *
 * The co-located HP pip scale is the glanceable survivability readout next to
 * the action input (the primary player-facing survivability HUD). For social
 * genre packs the pool is flavored "Composure / Standing / Poise" rather than
 * "HP". This surface must render whatever label the genre supplies, and fall
 * back to "HP" when none is supplied (AC5 — mechanical packs are unchanged).
 *
 * These fail against the current component, which hardcodes "HP {cur}/{max}"
 * and `title="HP / Vitality"` with no way to override the label.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HpPipScale } from "@/components/HpPipScale";
import type { CharacterSummary } from "@/types/party";

function character(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
  return {
    player_id: "p1",
    name: "Lady Ashcombe",
    character_name: "Lady Ashcombe",
    hp: 3,
    hp_max: 4,
    status_effects: [],
    class: "Detective",
    level: 1,
    current_location: "the parlour",
    ...overrides,
  };
}

describe("HpPipScale survivability label (Story 68-1)", () => {
  it("renders the genre-supplied survivability label instead of 'HP'", () => {
    render(
      <HpPipScale
        characters={[character()]}
        currentPlayerId="p1"
        survivabilityLabel="Composure"
      />,
    );

    // The numeric readout must wear the social label, not the default "HP".
    expect(screen.getByText("Composure 3/4")).toBeInTheDocument();
    expect(screen.queryByText("HP 3/4")).not.toBeInTheDocument();
  });

  it("exposes the label on the accessible name as well", () => {
    render(
      <HpPipScale
        characters={[character()]}
        currentPlayerId="p1"
        survivabilityLabel="Composure"
      />,
    );

    // The aria-label is the screen-reader survivability announcement; it must
    // not still say "HP" once the pool is reskinned.
    const group = screen.getByLabelText("Composure 3 of 4");
    expect(group).toBeInTheDocument();
  });

  it("falls back to 'HP' when the genre supplies no survivability label", () => {
    // AC5 — mechanical packs (no label) keep the legacy HP surface.
    render(<HpPipScale characters={[character()]} currentPlayerId="p1" />);

    expect(screen.getByText("HP 3/4")).toBeInTheDocument();
    expect(screen.getByLabelText("HP 3 of 4")).toBeInTheDocument();
  });
});
