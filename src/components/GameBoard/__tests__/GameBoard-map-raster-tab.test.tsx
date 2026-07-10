/**
 * Story 163-5 / plan task 15 (Track A, spec §4 A1): mobile tab-reachability
 * wiring test. The `map` tab is already dual-registered (widgetRegistry +
 * MobileTabView TABS) and always available (`available.add("map")`,
 * GameBoard.tsx), so RasterMap needs no new registration — it rides the
 * existing Map tab. This test proves RasterMap is REACHABLE through the
 * production mobile tab path (jsdom's test-setup forces the mobile
 * breakpoint, so GameBoard renders MobileTabView), closing the "every
 * renderer needs a reachability wiring test" rule — a unit-rendered
 * RasterMap proves nothing about the dock.
 *
 * Harness modeled on GameBoard-location-tab.test.tsx (renderBoard +
 * getByRole("tab")). The mapData prop name on GameBoardProps was verified
 * against GameBoard.tsx (`mapData?: MapState | null`, threaded to MapWidget
 * in renderWidgetContent).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { MapState } from "@/components/MapOverlay";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const RASTER_MAP: MapState = {
  current_location: "r1",
  region: "w",
  explored: [],
  fog_bounds: { width: 0, height: 0 },
  cartography: {
    navigation_mode: "region",
    starting_region: "r1",
    regions: { r1: { name: "R1" } },
    routes: [],
  },
  treatment: {
    kind: "raster",
    image_url: "https://cdn/x.jpg",
    node_anchors: { r1: [1, 2] },
    style_hints: {},
  },
};

const PLAIN_CARTOGRAPHY_MAP: MapState = {
  current_location: "r1",
  region: "w",
  explored: [],
  fog_bounds: { width: 0, height: 0 },
  cartography: {
    navigation_mode: "region",
    starting_region: "r1",
    regions: { r1: { name: "R1" } },
    routes: [],
  },
};

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

function openMapTab() {
  fireEvent.click(screen.getByRole("tab", { name: /^map$/i }));
}

describe("GameBoard — raster map reachable via Map tab (Story 163-5 task 15, wiring)", () => {
  it("renders RasterMap when the Map tab is opened with a raster treatment", () => {
    renderBoard({ mapData: RASTER_MAP });
    openMapTab();
    expect(screen.getByTestId("map-panel-raster")).toBeInTheDocument();
    expect(screen.queryByTestId("map-overlay")).not.toBeInTheDocument();
  });

  it("keeps the existing overlay path for a cartography world with no treatment (raster is treatment-gated)", () => {
    // Green-on-arrival harness proof: this passing while the raster test
    // fails localizes the RED to the missing raster wiring, not the harness.
    renderBoard({ mapData: PLAIN_CARTOGRAPHY_MAP });
    openMapTab();
    expect(screen.getByTestId("map-overlay")).toBeInTheDocument();
    expect(screen.queryByTestId("map-panel-raster")).not.toBeInTheDocument();
  });
});
