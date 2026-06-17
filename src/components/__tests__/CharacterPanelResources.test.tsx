import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CharacterPanel } from "../CharacterPanel";
import type { CharacterPanelProps, ResourcePool } from "../CharacterPanel";
import type { CharacterSheetData } from "../CharacterSheet";

// ═══════════════════════════════════════════════════════════
// Test fixtures
// ═══════════════════════════════════════════════════════════

const CHARACTER: CharacterSheetData = {
  name: "Kael",
  class: "Ranger",
  level: 3,
  stats: { strength: 14, dexterity: 18 },
  abilities: [
    {
      name: "Tracker",
      genre_description: "",
      mechanical_effect: "",
      involuntary: false,
      source: "Class",
    },
  ],
  class_moves: [],
  backstory: "Born in the Ashwood.",
  portrait_url: "/renders/kael.png",
  current_location: "The Rusty Cantina",
};

const LUCK_RESOURCE: ResourcePool = {
  value: 4,
  max: 6,
  thresholds: [
    { value: 1, label: "Snake Eyes", direction: "low" },
    { value: 5, label: "Hot Hand", direction: "high" },
  ],
};

const HUMANITY_RESOURCE: ResourcePool = {
  value: 60,
  max: 100,
  thresholds: [
    { value: 50, label: "Fading", direction: "low" },
    { value: 25, label: "Losing Grip", direction: "low" },
    { value: 0, label: "Gone", direction: "low" },
  ],
};

const HEAT_RESOURCE: ResourcePool = {
  value: 3,
  max: 10,
  thresholds: [
    { value: 7, label: "Too Hot", direction: "high" },
  ],
};

const FUEL_RESOURCE: ResourcePool = {
  value: 2,
  max: 10,
  thresholds: [
    { value: 2, label: "Running on Fumes", direction: "low" },
  ],
};

const MOCK_RESOURCES: Record<string, ResourcePool> = {
  Luck: LUCK_RESOURCE,
  Humanity: HUMANITY_RESOURCE,
};

beforeEach(() => {
  localStorage.clear();
});

// ═══════════════════════════════════════════════════════════
// AC-1: CharacterPanel accepts resources prop
// ═══════════════════════════════════════════════════════════

describe("25-10 AC-1: CharacterPanel accepts resources prop", () => {
  it("accepts resources in props without error", () => {
    // CharacterPanelProps must include an optional resources field
    const props: CharacterPanelProps = {
      character: CHARACTER,
      resources: MOCK_RESOURCES,
      genreSlug: "spaghetti_western",
    };
    render(<CharacterPanel {...props} />);
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
  });

  it("renders without resources prop (backward compatible)", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// AC-2: Status tab renders resource bars
// ═══════════════════════════════════════════════════════════

describe("25-10 AC-2: Status tab renders resource bars", () => {
  it("shows a Status tab when resources are provided", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={MOCK_RESOURCES}
        genreSlug="spaghetti_western"
      />,
    );
    expect(screen.getByRole("tab", { name: /status/i })).toBeInTheDocument();
  });

  it("does not show Status tab when resources are empty", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{}}
        genreSlug="spaghetti_western"
      />,
    );
    expect(screen.queryByRole("tab", { name: /status/i })).not.toBeInTheDocument();
  });

  it("does not show Status tab when resources are absent", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.queryByRole("tab", { name: /status/i })).not.toBeInTheDocument();
  });

  it("renders one GenericResourceBar per resource when Status tab selected", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={MOCK_RESOURCES}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    const bars = screen.getAllByTestId("resource-bar");
    expect(bars).toHaveLength(2);
  });

  it("passes correct name to each GenericResourceBar", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={MOCK_RESOURCES}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(screen.getByText("Luck")).toBeInTheDocument();
    expect(screen.getByText("Humanity")).toBeInTheDocument();
  });

  it("passes correct value and max to each bar", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Luck: LUCK_RESOURCE }}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    // Luck: 4 / 6 → 66.67% fill
    expect(screen.getByText(/4\s*\/\s*6/)).toBeInTheDocument();
  });

  it("passes genre_slug to each GenericResourceBar", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Luck: LUCK_RESOURCE }}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    const bar = screen.getByTestId("resource-bar");
    expect(bar).toHaveAttribute("data-genre", "spaghetti_western");
  });

  it("renders threshold markers on bars", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Luck: LUCK_RESOURCE }}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    const markers = screen.getAllByTestId("threshold-marker");
    // Luck has 2 thresholds
    expect(markers).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Regression (playtest 2026-06-17): a pool with the `thresholds` key
// OMITTED (the PARTY_STATUS wire drops empty-default lists — ProtocolBase
// `is_empty` parity) must NOT crash the GameBoard. pulp_noir's `heat` pool
// declares no thresholds, so the deserialized pool has `thresholds ===
// undefined`; the old `for (const t of thresholds)` in GenericResourceBar
// threw `TypeError: thresholds is not iterable` and the error boundary ate
// the whole <Game>. This is the wiring test for that path
// (CharacterPanel → StatusContent → GenericResourceBar).
// ═══════════════════════════════════════════════════════════

describe("Regression: pool with omitted thresholds does not crash the panel", () => {
  // Exactly what the wire delivers for pulp_noir `heat`: no `thresholds` key.
  // Cast through unknown because the absent-key shape is what the deserialized
  // payload produces at runtime even though the (now-optional) type allows it.
  const HEAT_NO_THRESHOLDS = { value: 3, max: 5 } as ResourcePool;

  it("renders the Status tab with a thresholds-less pool without throwing", () => {
    expect(() =>
      render(
        <CharacterPanel
          character={CHARACTER}
          resources={{ Heat: HEAT_NO_THRESHOLDS }}
          genreSlug="pulp_noir"
        />,
      ),
    ).not.toThrow();
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(screen.getByTestId("resource-bar")).toBeInTheDocument();
    expect(screen.getByText("Heat")).toBeInTheDocument();
    expect(screen.getByText(/3\s*\/\s*5/)).toBeInTheDocument();
    // No thresholds ⇒ no markers, but the bar (and the board) survive.
    expect(screen.queryAllByTestId("threshold-marker")).toHaveLength(0);
  });

  it("renders a mix of thresholds-bearing and thresholds-less pools", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Luck: LUCK_RESOURCE, Heat: HEAT_NO_THRESHOLDS }}
        genreSlug="pulp_noir"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(screen.getAllByTestId("resource-bar")).toHaveLength(2);
    // Only Luck contributes markers (2); Heat contributes none.
    expect(screen.getAllByTestId("threshold-marker")).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// AC-3: Resource state updates (data mapping)
// ═══════════════════════════════════════════════════════════

describe("25-10 AC-3: Resource state updates", () => {
  it("updates bars when resources prop changes", () => {
    const { rerender } = render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Luck: LUCK_RESOURCE }}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(screen.getByText(/4\s*\/\s*6/)).toBeInTheDocument();

    // Resource value changes (Luck drops to 1)
    const updatedResources = {
      Luck: { ...LUCK_RESOURCE, value: 1 },
    };
    rerender(
      <CharacterPanel
        character={CHARACTER}
        resources={updatedResources}
        genreSlug="spaghetti_western"
      />,
    );
    expect(screen.getByText(/1\s*\/\s*6/)).toBeInTheDocument();
  });

  it("handles resources appearing after initial render", () => {
    const { rerender } = render(
      <CharacterPanel character={CHARACTER} genreSlug="spaghetti_western" />,
    );
    // No Status tab initially
    expect(screen.queryByRole("tab", { name: /status/i })).not.toBeInTheDocument();

    // Resources arrive
    rerender(
      <CharacterPanel
        character={CHARACTER}
        resources={MOCK_RESOURCES}
        genreSlug="spaghetti_western"
      />,
    );
    expect(screen.getByRole("tab", { name: /status/i })).toBeInTheDocument();
  });

  it("handles resources disappearing", () => {
    const { rerender } = render(
      <CharacterPanel
        character={CHARACTER}
        resources={MOCK_RESOURCES}
        genreSlug="spaghetti_western"
      />,
    );
    expect(screen.getByRole("tab", { name: /status/i })).toBeInTheDocument();

    rerender(<CharacterPanel character={CHARACTER} />);
    expect(screen.queryByRole("tab", { name: /status/i })).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// AC-4: Threshold crossing fires onThresholdCrossed callback
// ═══════════════════════════════════════════════════════════

describe("25-10 AC-4: Threshold crossing callback", () => {
  it("fires onResourceThresholdCrossed when a resource crosses a threshold", () => {
    const onCrossed = vi.fn();
    // Fuel value 2 crosses the "Running on Fumes" low threshold at 2
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Fuel: FUEL_RESOURCE }}
        genreSlug="road_warrior"
        onResourceThresholdCrossed={onCrossed}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(onCrossed).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "Fuel",
        threshold: expect.objectContaining({
          label: "Running on Fumes",
          direction: "low",
        }),
      }),
    );
  });

  it("does not fire callback when no threshold is crossed", () => {
    const onCrossed = vi.fn();
    // Heat at 3 is below the "Too Hot" threshold at 7
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Heat: HEAT_RESOURCE }}
        genreSlug="pulp_noir"
        onResourceThresholdCrossed={onCrossed}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(onCrossed).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
// AC-5: Genre-specific rendering
// ═══════════════════════════════════════════════════════════

describe("25-10 AC-5: Genre-specific resource rendering", () => {
  it("renders spaghetti_western Luck with correct range", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Luck: LUCK_RESOURCE }}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(screen.getByText("Luck")).toBeInTheDocument();
    expect(screen.getByText(/4\s*\/\s*6/)).toBeInTheDocument();
    expect(screen.getByTestId("resource-bar")).toHaveAttribute(
      "data-genre",
      "spaghetti_western",
    );
  });

  it("renders neon_dystopia Humanity with multiple thresholds", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Humanity: HUMANITY_RESOURCE }}
        genreSlug="neon_dystopia"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(screen.getByText("Humanity")).toBeInTheDocument();
    expect(screen.getByText(/60\s*\/\s*100/)).toBeInTheDocument();
    // Humanity has 3 thresholds
    const markers = screen.getAllByTestId("threshold-marker");
    expect(markers).toHaveLength(3);
  });

  it("applies genre_slug to all bars for the active genre", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={MOCK_RESOURCES}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    const bars = screen.getAllByTestId("resource-bar");
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute("data-genre", "spaghetti_western");
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

describe("25-10 Edge cases", () => {
  it("renders single resource correctly", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Heat: HEAT_RESOURCE }}
        genreSlug="pulp_noir"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    const bars = screen.getAllByTestId("resource-bar");
    expect(bars).toHaveLength(1);
    expect(screen.getByText("Heat")).toBeInTheDocument();
  });

  it("renders many resources without breaking layout", () => {
    const manyResources: Record<string, ResourcePool> = {
      Luck: LUCK_RESOURCE,
      Humanity: HUMANITY_RESOURCE,
      Heat: HEAT_RESOURCE,
      Fuel: FUEL_RESOURCE,
    };
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={manyResources}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    const bars = screen.getAllByTestId("resource-bar");
    expect(bars).toHaveLength(4);
  });

  it("handles resource with zero max gracefully", () => {
    const zeroMax: Record<string, ResourcePool> = {
      Broken: { value: 0, max: 0, thresholds: [] },
    };
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={zeroMax}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    expect(screen.getByTestId("resource-bar")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// Wiring test — GenericResourceBar used as non-test consumer
// ═══════════════════════════════════════════════════════════

describe("25-10 Wiring: GenericResourceBar imported in CharacterPanel", () => {
  it("CharacterPanel imports and renders GenericResourceBar (non-test consumer)", async () => {
    // This verifies that CharacterPanel actually imports GenericResourceBar,
    // not just that the test file can import both independently
    // The compiled function should reference GenericResourceBar or resource-bar testid
    // This is a structural wiring check — if CharacterPanel doesn't import it, this fails
    render(
      <CharacterPanel
        character={CHARACTER}
        resources={{ Luck: LUCK_RESOURCE }}
        genreSlug="spaghetti_western"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /status/i }));
    // The bar rendered must come from GenericResourceBar (has data-genre attr)
    const bar = screen.getByTestId("resource-bar");
    expect(bar).toHaveAttribute("data-genre", "spaghetti_western");
  });
});
