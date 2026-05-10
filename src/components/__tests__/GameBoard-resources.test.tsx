import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameBoard, type GameBoardProps } from "../GameBoard/GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { ResourcePool } from "../CharacterPanel";

// ═══════════════════════════════════════════════════════════
// Test fixtures
// ═══════════════════════════════════════════════════════════

const CHARACTER_SHEET = {
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
      source: "Class" as const,
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

const mockPlaySfx = vi.fn();
const mockAudio = {
  resume: vi.fn(),
  playMusic: vi.fn(),
  stopMusic: vi.fn(),
  playSfx: mockPlaySfx,
  setVolume: vi.fn(),
  getVolume: vi.fn().mockReturnValue(1.0),
  mute: vi.fn(),
  unmute: vi.fn(),
};

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function renderLayout(overrides: Partial<GameBoardProps> = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [{ player_id: "p1", name: "Kael", character_name: "Kael", class: "Ranger", level: 3, hp: 20, hp_max: 25, status_effects: [], portrait_url: "/renders/kael.png", current_location: "" }],
    onSend: vi.fn(),
    disabled: false,
    characterSheet: CHARACTER_SHEET,
    audio: mockAudio as unknown as GameBoardProps["audio"],
  };
  const props = { ...defaults, ...overrides };
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>
  );
}

// In jsdom, GameBoard renders via MobileTabView (test-setup defaults
// matchMedia to mobile so dockview's panel content is reachable). Resources
// live inside the Character widget's "Status" sub-tab, so we have to
// navigate to Character first, then click the Status sub-tab.
function openStatusTab() {
  // Step 1: open the Character widget in the mobile tab bar.
  fireEvent.click(screen.getByRole("tab", { name: /^character$/i }));
  // Step 2: open the Status sub-tab inside CharacterPanel.
  fireEvent.click(screen.getByRole("tab", { name: /^status$/i }));
}

// ═══════════════════════════════════════════════════════════
// AC-2: GameBoard passes resources and genreSlug to CharacterPanel
// ═══════════════════════════════════════════════════════════

describe("25-11 AC-2: GameBoard passes resources to CharacterPanel", () => {
  it("GameBoardProps accepts resources prop", () => {
    // This test fails if GameBoardProps doesn't include resources
    renderLayout({
      resources: MOCK_RESOURCES,
      genreSlug: "spaghetti_western",
    });
    fireEvent.click(screen.getByRole("tab", { name: /^character$/i }));
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
  });

  it("GameBoardProps accepts genreSlug prop", () => {
    renderLayout({
      genreSlug: "spaghetti_western",
    });
    fireEvent.click(screen.getByRole("tab", { name: /^character$/i }));
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
  });

  it("renders resource bars in CharacterPanel when resources provided", () => {
    renderLayout({
      resources: MOCK_RESOURCES,
      genreSlug: "spaghetti_western",
    });
    // Click the Status tab to see resource bars
    openStatusTab();
    const bars = screen.getAllByTestId("resource-bar");
    expect(bars).toHaveLength(2);
  });

  it("passes genreSlug through to GenericResourceBar data-genre attribute", () => {
    renderLayout({
      resources: { Luck: LUCK_RESOURCE },
      genreSlug: "spaghetti_western",
    });
    openStatusTab();
    const bar = screen.getByTestId("resource-bar");
    expect(bar).toHaveAttribute("data-genre", "spaghetti_western");
  });

  it("renders neon_dystopia Humanity through the full pipeline", () => {
    renderLayout({
      resources: { Humanity: HUMANITY_RESOURCE },
      genreSlug: "neon_dystopia",
    });
    openStatusTab();
    expect(screen.getByText("Humanity")).toBeInTheDocument();
    expect(screen.getByText(/60\s*\/\s*100/)).toBeInTheDocument();
    expect(screen.getByTestId("resource-bar")).toHaveAttribute("data-genre", "neon_dystopia");
  });

  it("does not render Status sub-tab when resources are absent", () => {
    renderLayout();
    // Navigate to Character widget so its sub-tab strip is mounted.
    fireEvent.click(screen.getByRole("tab", { name: /^character$/i }));
    expect(
      screen.queryByRole("tab", { name: /^status$/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render Status sub-tab when resources are empty", () => {
    renderLayout({
      resources: {},
      genreSlug: "spaghetti_western",
    });
    fireEvent.click(screen.getByRole("tab", { name: /^character$/i }));
    expect(
      screen.queryByRole("tab", { name: /^status$/i }),
    ).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// AC-3: GameBoard wires onResourceThresholdCrossed to audio
// ═══════════════════════════════════════════════════════════

describe("25-11 AC-3: Threshold crossing routes to AudioEngine", () => {
  it("calls audio.playSfx when a resource threshold is crossed", () => {
    // Fuel value=2 crosses "Running on Fumes" low threshold at 2
    renderLayout({
      resources: { Fuel: FUEL_RESOURCE },
      genreSlug: "road_warrior",
    });
    openStatusTab();
    // GenericResourceBar fires onThresholdCrossed via useEffect on mount
    // when value <= threshold. GameBoard should route this to audio.playSfx
    expect(mockPlaySfx).toHaveBeenCalled();
  });

  it("does not call audio.playSfx when no threshold is crossed", () => {
    // Luck value=4, thresholds at 1 (low) and 5 (high) — 4 is between them
    renderLayout({
      resources: { Luck: LUCK_RESOURCE },
      genreSlug: "spaghetti_western",
    });
    openStatusTab();
    expect(mockPlaySfx).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
// AC-5: No silent fallbacks
// ═══════════════════════════════════════════════════════════

describe("25-11 AC-5: No silent fallbacks", () => {
  it("renders resource bars only when both resources and genreSlug are provided", () => {
    renderLayout({
      resources: MOCK_RESOURCES,
      genreSlug: "spaghetti_western",
    });
    openStatusTab();
    expect(screen.getAllByTestId("resource-bar")).toHaveLength(2);
  });

  it("logs warning when resources present but genreSlug missing and threshold fires", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Fuel value=2 crosses threshold — callback fires but genreSlug is missing
    renderLayout({
      resources: { Fuel: FUEL_RESOURCE },
      // genreSlug intentionally omitted — should warn, not silently fallback
    });
    openStatusTab();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("genreSlug"),
    );
    consoleSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════
// AC-4: End-to-end data flow verification
// ═══════════════════════════════════════════════════════════

describe("25-11 AC-4: End-to-end pipeline verification", () => {
  it("full pipeline: resources in GameBoard props → CharacterPanel → GenericResourceBar renders with correct values", () => {
    renderLayout({
      resources: {
        Luck: { value: 3, max: 6, thresholds: [{ value: 1, label: "Snake Eyes", direction: "low" as const }] },
      },
      genreSlug: "spaghetti_western",
    });
    openStatusTab();

    // Verify the bar renders with correct data all the way through
    expect(screen.getByText("Luck")).toBeInTheDocument();
    expect(screen.getByText(/3\s*\/\s*6/)).toBeInTheDocument();
    expect(screen.getByTestId("resource-bar")).toHaveAttribute("data-genre", "spaghetti_western");
    expect(screen.getAllByTestId("threshold-marker")).toHaveLength(1);
  });

  it("full pipeline: multiple resources render independently through GameBoard", () => {
    renderLayout({
      resources: MOCK_RESOURCES,
      genreSlug: "spaghetti_western",
    });
    openStatusTab();

    expect(screen.getByText("Luck")).toBeInTheDocument();
    expect(screen.getByText("Humanity")).toBeInTheDocument();
    const bars = screen.getAllByTestId("resource-bar");
    expect(bars).toHaveLength(2);
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute("data-genre", "spaghetti_western");
    });
  });

  it("full pipeline: resource updates propagate through GameBoard to rendered bars", () => {
    const { rerender } = renderLayout({
      resources: { Luck: LUCK_RESOURCE },
      genreSlug: "spaghetti_western",
    });
    openStatusTab();
    expect(screen.getByText(/4\s*\/\s*6/)).toBeInTheDocument();

    // Simulate resource update via new props (as would happen from PARTY_STATUS)
    rerender(
      <ImageBusProvider messages={[]}>
        <GameBoard
          messages={[]}
          characters={[{ player_id: "p1", name: "Kael", character_name: "Kael", class: "Ranger", level: 3, hp: 20, hp_max: 25, status_effects: [], portrait_url: "/renders/kael.png", current_location: "" }]}
          onSend={vi.fn()}
          disabled={false}
          characterSheet={CHARACTER_SHEET}
          audio={mockAudio as unknown as GameBoardProps["audio"]}
          resources={{ Luck: { ...LUCK_RESOURCE, value: 1 } }}
          genreSlug="spaghetti_western"
        />
      </ImageBusProvider>,
    );
    expect(screen.getByText(/1\s*\/\s*6/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// Wiring verification — GameBoard is non-test consumer
// ═══════════════════════════════════════════════════════════

describe("25-11 Wiring: resources flow through GameBoard", () => {
  it("GameBoard imports and passes resources to CharacterPanel (non-test consumer)", () => {
    // This is the critical wiring test — resources must flow through GameBoard,
    // not just be accepted by CharacterPanel in isolation
    renderLayout({
      resources: { Luck: LUCK_RESOURCE },
      genreSlug: "spaghetti_western",
    });
    openStatusTab();
    // If GameBoard doesn't pass resources to CharacterPanel, no resource bar renders
    expect(screen.getByTestId("resource-bar")).toBeInTheDocument();
    expect(screen.getByText("Luck")).toBeInTheDocument();
  });
});
