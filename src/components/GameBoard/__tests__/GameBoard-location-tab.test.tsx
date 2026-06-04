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
import { render, screen, fireEvent } from "@testing-library/react";
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

// ---------------------------------------------------------------------------
// Story 85-2: Region — Subregion breadcrumb wiring.
//
// The mandatory end-to-end wiring (CLAUDE.md "Every Test Suite Needs a Wiring
// Test"): prove the LOCAL player's per-PC current_location actually reaches the
// Location-tab breadcrumb through the real GameBoard → LocationWidget →
// LocationPanel chain. This is also where the staleness defect (L105 a/b) is
// actually fixed: the subregion rides PARTY_STATUS (every turn), so the tab
// tracks an intra-region move WITHOUT any server re-emit — the shared,
// region-keyed payload is unchanged within a region (ADR-109).
//
// RED today: GameBoard does not yet thread the local PC's current_location into
// the Location widget, so the breadcrumb shows the region alone.
// ---------------------------------------------------------------------------

const BREADCRUMB_SEP = " — "; // space · EM DASH (U+2014) · space — locked

function pc(player_id: string, current_location: string): GameBoardProps["characters"][number] {
  return {
    player_id,
    name: player_id,
    character_name: player_id,
    class: "Sleuth",
    level: 1,
    hp: 10,
    hp_max: 10,
    status_effects: [],
    portrait_url: "",
    current_location,
  };
}

const REGION: NonNullable<GameBoardProps["currentLocation"]> = {
  region_id: "outer_coyote_star",
  region_name: "The Outer Coyote Star",
  prose: "Docks ring the station core.",
  terrain: null,
  entities: [],
  overlays: [],
};

function renderBreadcrumbBoard(
  characters: GameBoardProps["characters"],
  currentPlayerId: string,
) {
  return render(
    <ImageBusProvider messages={[]}>
      <GameBoard
        messages={[]}
        characters={characters}
        currentPlayerId={currentPlayerId}
        onSend={vi.fn()}
        disabled={false}
        genreSlug="space_opera"
        worldSlug="coyote_star"
        navMode="region"
        currentLocation={REGION}
      />
    </ImageBusProvider>,
  );
}

describe("GameBoard — Region — Subregion breadcrumb wiring (Story 85-2)", () => {
  it("composes the breadcrumb from the LOCAL player's current_location, not a peer's (RED)", () => {
    // Split party in one region: local p1 at "Docking Crescent", peer p2 at
    // "Engine Room". The breadcrumb must show MY subregion — picking a peer's
    // would silently regress useRunningHeader's per-PC `ignores non-local
    // party members` invariant.
    renderBreadcrumbBoard(
      [pc("p1", "Docking Crescent"), pc("p2", "Engine Room")],
      "p1",
    );
    fireEvent.click(screen.getByRole("tab", { name: /^location$/i }));
    const header = screen.getByTestId("location-header");
    expect(header.textContent).toContain(
      `The Outer Coyote Star${BREADCRUMB_SEP}Docking Crescent`,
    );
    expect(header.textContent).not.toContain("Engine Room");
  });

  it("updates the breadcrumb subregion on an intra-region move — no stale tab (RED)", () => {
    // The core L105 a/b defect, fixed client-side: the region payload is
    // unchanged (still The Outer Coyote Star) but the local PC moved to a new
    // subregion. The tab must follow the per-turn current_location, not freeze.
    const { rerender } = renderBreadcrumbBoard([pc("p1", "Docking Crescent")], "p1");
    fireEvent.click(screen.getByRole("tab", { name: /^location$/i }));
    expect(screen.getByTestId("location-header").textContent).toContain(
      `The Outer Coyote Star${BREADCRUMB_SEP}Docking Crescent`,
    );

    // Intra-region move: SAME region payload, new per-PC current_location.
    rerender(
      <ImageBusProvider messages={[]}>
        <GameBoard
          messages={[]}
          characters={[pc("p1", "Cargo Spine")]}
          currentPlayerId="p1"
          onSend={vi.fn()}
          disabled={false}
          genreSlug="space_opera"
          worldSlug="coyote_star"
          navMode="region"
          currentLocation={REGION}
        />
      </ImageBusProvider>,
    );
    const header = screen.getByTestId("location-header");
    expect(header.textContent).toContain(
      `The Outer Coyote Star${BREADCRUMB_SEP}Cargo Spine`,
    );
    expect(header.textContent).not.toContain("Docking Crescent");
  });
});
