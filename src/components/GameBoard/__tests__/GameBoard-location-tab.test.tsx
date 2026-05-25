/**
 * Story 54-9 / ADR-109 + 2026-05-21 glenross flicker fix: the Location tab.
 *
 * Two contracts are proven here:
 *   1. Wiring — LocationWidget/LocationPanel are importable and registered.
 *   2. Stable gating — the tab's *existence* is gated on the world's STABLE
 *      navigation mode (region / room_graph), NOT on the transient
 *      `currentLocation` payload. Gating on `currentLocation` made the tab
 *      blink in/out on every reconnect (a --reload restart re-baselines it to
 *      null); Keith flagged this as "confusing ui" in the 2026-05-21 glenross
 *      playtest. The behavior tests below render GameBoard (jsdom → mobile
 *      MobileTabView path) and assert the tab is present for cartography
 *      worlds even when `currentLocation` is null, absent for worlds with no
 *      location capability, and stable across a null transition.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function renderBoard(overrides: Partial<GameBoardProps> = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [
      {
        player_id: "p1",
        name: "Mira",
        character_name: "Mira",
        class: "Sleuth",
        level: 1,
        hp: 10,
        hp_max: 10,
        status_effects: [],
        portrait_url: "",
        current_location: "",
      },
    ],
    onSend: vi.fn(),
    disabled: false,
  };
  const props = { ...defaults, ...overrides };
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
}

function locationTab() {
  return screen.queryByRole("tab", { name: /^location$/i });
}

describe("GameBoard — location tab wiring (Story 54-9)", () => {
  it("LocationWidget is importable from the registered path", async () => {
    const mod = await import("@/components/GameBoard/widgets/LocationWidget");
    expect(typeof mod.LocationWidget).toBe("function");
  });

  it("LocationPanel is importable from the components path", async () => {
    const mod = await import("@/components/LocationPanel");
    expect(typeof mod.LocationPanel).toBe("function");
  });

  it("widgetRegistry includes the 'location' entry with hotkey 'l' and dataGated:true", async () => {
    const mod = await import("@/components/GameBoard/widgetRegistry");
    const entry = (mod.WIDGET_REGISTRY as Record<string, unknown>).location as
      | { hotkey?: string; dataGated?: boolean }
      | undefined;
    expect(entry).toBeDefined();
    expect(entry!.hotkey).toBe("l");
    expect(entry!.dataGated).toBe(true);
  });
});

describe("GameBoard — Location tab stability (navMode gating)", () => {
  it("shows the Location tab for a region-mode world even when currentLocation is null", () => {
    renderBoard({
      genreSlug: "tea_and_murder",
      worldSlug: "glenross",
      navMode: "region",
      currentLocation: null,
    });
    expect(locationTab()).toBeInTheDocument();
  });

  it("shows the Location tab for a room_graph world", () => {
    renderBoard({
      genreSlug: "caverns_and_claudes",
      worldSlug: "beneath_sunden",
      navMode: "room_graph",
      currentLocation: null,
    });
    expect(locationTab()).toBeInTheDocument();
  });

  it("does NOT show the Location tab for a world with no location capability", () => {
    renderBoard({
      genreSlug: "space_opera",
      worldSlug: "coyote_star",
      navMode: undefined,
      currentLocation: null,
    });
    expect(locationTab()).not.toBeInTheDocument();
  });

  it("keeps the Location tab present across a currentLocation null transition (no flicker)", () => {
    const characters: GameBoardProps["characters"] = [
      {
        player_id: "p1",
        name: "Mira",
        character_name: "Mira",
        class: "Sleuth",
        level: 1,
        hp: 10,
        hp_max: 10,
        status_effects: [],
        portrait_url: "",
        current_location: "",
      },
    ];
    const { rerender } = renderBoard({
      genreSlug: "tea_and_murder",
      worldSlug: "glenross",
      navMode: "region",
      currentLocation: {
        region_id: "glenross_pub",
        prose: "The pub door is ajar.",
        terrain: "building",
        entities: [],
        overlays: [],
      },
    });
    expect(locationTab()).toBeInTheDocument();

    // Simulate a reconnect re-baselining currentLocation to null.
    rerender(
      <ImageBusProvider messages={[]}>
        <GameBoard
          messages={[]}
          characters={characters}
          onSend={vi.fn()}
          disabled={false}
          genreSlug="tea_and_murder"
          worldSlug="glenross"
          navMode="region"
          currentLocation={null}
        />
      </ImageBusProvider>,
    );
    expect(locationTab()).toBeInTheDocument();
  });
});
