/**
 * Story 98-3 (round-trip 1) — wiring test for the `lastOrbitalError` chain.
 *
 * CLAUDE.md mandate ("Every Test Suite Needs a Wiring Test"): the AC5
 * no-local-chart state must be reachable through the REAL GameBoard →
 * MapWidget prop chain, not just a unit render of the widget. This renders
 * GameBoard with a cluster-world map feed, drills into the occupied node on
 * the Map tab, then delivers an orbital rejection through GameBoard's
 * `lastOrbitalError` prop — proving the prop is forwarded (it is consumed
 * by MapWidget inside GameBoard's widget memo, so a dropped dep or a
 * missing pass-through fails here).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { MapState } from "@/components/MapOverlay";
import type { OrbitalIntentError } from "@/types/orbital-intent";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const CLUSTER_MAP: MapState = {
  current_location: "yula",
  region: "Perseus Cloud",
  explored: [
    { id: "yula", name: "Yula", x: 0, y: 0, type: "region", connections: [] },
  ],
  fog_bounds: { width: 10, height: 10 },
  cartography: {
    navigation_mode: "region",
    starting_region: "yula",
    regions: {
      yula: { name: "Yula", adjacent: ["forma"] },
      forma: { name: "Forma", adjacent: ["yula"] },
    },
    routes: [],
    // 104-2 / M-A: real multi-system cluster — server flags it true so the
    // campaign graph + drill path engages (the test's whole subject).
    is_cluster: true,
  },
};

const ORBITAL_ERROR: OrbitalIntentError = {
  code: "orbital_unavailable",
  message: "No orbital system file authored for region 'yula' (systems/yula.yaml)",
};

function boardProps(overrides: Partial<GameBoardProps> = {}): GameBoardProps {
  return {
    messages: [],
    characters: [
      {
        player_id: "p1",
        name: "Mira",
        character_name: "Mira",
        class: "Pilot",
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
    genreSlug: "space_opera",
    worldSlug: "perseus_cloud",
    navMode: "region",
    worldOrbital: true,
    mapData: CLUSTER_MAP,
    lastOrbitalChart: null,
    sendOrbitalIntent: vi.fn(),
    ...overrides,
  };
}

function renderBoard(props: GameBoardProps) {
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
}

describe("GameBoard — lastOrbitalError wiring to MapWidget (98-3)", () => {
  it("forwards lastOrbitalError so the drilled Map tab shows the no-local-chart state", () => {
    const props = boardProps();
    const { rerender } = renderBoard(props);

    // The Map tab is dataGated on mapData — present for this cluster world.
    fireEvent.click(screen.getByRole("tab", { name: /^map$/i }));
    // Cluster default = the shared cartography graph, via the real chain.
    expect(screen.getByTestId("map-region-graph")).toBeInTheDocument();

    // Drill into the occupied node.
    fireEvent.click(screen.getByTestId("map-region-node-yula"));

    // Server rejection arrives via App state → GameBoard prop.
    rerender(
      <ImageBusProvider messages={[]}>
        <GameBoard {...boardProps({ lastOrbitalError: ORBITAL_ERROR })} />
      </ImageBusProvider>,
    );
    const panel = screen.getByTestId("map-panel-no-local-chart");
    expect(panel.textContent).toContain(ORBITAL_ERROR.message);
  });
});
