/**
 * Story 26-10: Wire map cartography data through dispatch to UI
 *
 * RED tests — verify MapOverlay renders cartography metadata
 * (navigation mode, region info, routes) when present in MAP_UPDATE.
 *
 * Currently failing because:
 * 1. MapState interface has no `cartography` field
 * 2. MapOverlay doesn't render cartography metadata
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MapOverlay, type MapState } from '../MapOverlay';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** MapState with cartography metadata — region navigation mode. */
const MAP_WITH_CARTOGRAPHY: MapState = {
  current_location: 'The Ashwood Tavern',
  region: 'Eldergrove',
  explored: [
    { name: 'The Ashwood Tavern', x: 5, y: 3, type: 'settlement', connections: ['Forest Path'] },
    { name: 'Forest Path', x: 6, y: 4, type: 'road', connections: ['The Ashwood Tavern', 'Ruins'] },
  ],
  fog_bounds: { width: 20, height: 15 },
  cartography: {
    navigation_mode: 'region',
    starting_region: 'Eldergrove',
    regions: {
      Eldergrove: {
        name: 'Eldergrove',
        description: 'Ancient forest with towering oaks',
        adjacent: ['Shadowlands'],
      },
      Shadowlands: {
        name: 'Shadowlands',
        description: 'Dark and foreboding lands',
        adjacent: ['Eldergrove'],
      },
    },
    routes: [
      {
        name: 'Forest Trail',
        description: 'A winding path through old growth',
        from_id: 'Eldergrove',
        to_id: 'Shadowlands',
      },
    ],
  },
};

/** MapState with room_graph navigation mode. */
const MAP_WITH_ROOM_GRAPH: MapState = {
  current_location: 'Entry Hall',
  region: 'Dungeon Level 1',
  explored: [
    { name: 'Entry Hall', x: 0, y: 0, type: 'room', connections: ['Corridor'] },
  ],
  fog_bounds: { width: 10, height: 10 },
  cartography: {
    navigation_mode: 'room_graph',
    starting_region: 'entry_hall',
    regions: {},
    routes: [],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MapOverlay — Cartography Wiring (Story 26-10)', () => {
  // --- AC-1: Navigation mode indicator ---
  describe('AC-1: Navigation mode display', () => {
    it('displays the navigation mode when cartography is present', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      // Should show the navigation mode somewhere in the overlay
      expect(screen.getByTestId('map-navigation-mode')).toHaveTextContent(/region/i);
    });

    it('displays room_graph mode for dungeon navigation', () => {
      render(<MapOverlay mapData={MAP_WITH_ROOM_GRAPH} onClose={() => {}} />);
      expect(screen.getByTestId('map-navigation-mode')).toHaveTextContent(/room.graph/i);
    });
  });

  // --- AC-2: Region metadata display ---
  describe('AC-2: Region metadata', () => {
    it('renders known regions from cartography', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      // Regions panel should list all regions from cartography
      expect(screen.getByTestId('map-regions-panel')).toBeInTheDocument();
      expect(screen.getByTestId('map-region-Eldergrove')).toBeInTheDocument();
      expect(screen.getByTestId('map-region-Shadowlands')).toBeInTheDocument();
    });

    it('shows region descriptions on hover or in detail view', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      // The region description should be accessible
      expect(screen.getByText(/Ancient forest with towering oaks/)).toBeInTheDocument();
    });
  });

  // --- AC-3: Route display ---
  describe('AC-3: Routes between regions', () => {
    it('renders route connections from cartography', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      // Routes should be rendered as connections between regions
      const routes = screen.getAllByTestId(/^map-route-/);
      expect(routes.length).toBeGreaterThanOrEqual(1);
    });

    it('route carries from/to metadata', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      const route = screen.getByTestId('map-route-Forest Trail');
      expect(route).toHaveAttribute('data-from', 'Eldergrove');
      expect(route).toHaveAttribute('data-to', 'Shadowlands');
    });
  });

  // --- AC-4: Starting region indicator ---
  describe('AC-4: Starting region', () => {
    it('marks the starting region from cartography', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      // Starting region should have a visual indicator
      const startRegion = screen.getByTestId('map-region-Eldergrove');
      expect(startRegion).toHaveAttribute('data-starting', 'true');
    });
  });

  // --- Node-graph (region adjacency visualisation) ---
  describe('Region node-graph', () => {
    it('renders an SVG node-graph for region-mode cartography', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      expect(screen.getByTestId('map-region-graph')).toBeInTheDocument();
    });

    it('renders one graph node per region', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      // regions keyed by id (Eldergrove, Shadowlands)
      expect(screen.getByTestId('map-region-node-Eldergrove')).toBeInTheDocument();
      expect(screen.getByTestId('map-region-node-Shadowlands')).toBeInTheDocument();
      const nodes = screen.getAllByTestId(/^map-region-node-/);
      expect(nodes).toHaveLength(2);
    });

    it('renders an edge per de-duplicated adjacency', () => {
      render(<MapOverlay mapData={MAP_WITH_CARTOGRAPHY} onClose={() => {}} />);
      // Eldergrove↔Shadowlands is reciprocal → collapses to one edge.
      const edges = screen.getAllByTestId(/^map-region-edge-/);
      expect(edges).toHaveLength(1);
      expect(
        screen.getByTestId('map-region-edge-Eldergrove--Shadowlands')
      ).toBeInTheDocument();
    });

    it('marks the current region ("you are here")', () => {
      const map: MapState = {
        ...MAP_WITH_CARTOGRAPHY,
        // region-mode MAP_UPDATE carries the current region id in current_location
        current_location: 'Shadowlands',
      };
      render(<MapOverlay mapData={map} onClose={() => {}} />);
      expect(screen.getByTestId('map-region-node-Shadowlands')).toHaveAttribute(
        'data-current',
        'true'
      );
      expect(
        screen.getByTestId('map-region-node-Eldergrove')
      ).not.toHaveAttribute('data-current', 'true');
    });

    it('marks the current region as visited', () => {
      const map: MapState = {
        ...MAP_WITH_CARTOGRAPHY,
        current_location: 'Eldergrove',
      };
      render(<MapOverlay mapData={map} onClose={() => {}} />);
      expect(screen.getByTestId('map-region-node-Eldergrove')).toHaveAttribute(
        'data-visited',
        'true'
      );
      // Non-current, non-explored region is base-layer (unvisited).
      expect(
        screen.getByTestId('map-region-node-Shadowlands')
      ).not.toHaveAttribute('data-visited', 'true');
    });

    it('does not render a region graph for room_graph cartography (empty regions)', () => {
      render(<MapOverlay mapData={MAP_WITH_ROOM_GRAPH} onClose={() => {}} />);
      expect(screen.queryByTestId('map-region-graph')).not.toBeInTheDocument();
    });

    // Regression (DRIVER 2026-06-04, Groucho wonderland-2): the REAL region-mode
    // MAP_UPDATE payload ships explored entries as {id, name, connections} with
    // NO x/y coordinates (server #632/#637). The old `hasCoordinates` test
    // (`loc.x !== 0 || loc.y !== 0`) read `undefined !== 0` as TRUE, so it
    // rendered the COORDINATE fog SVG where `<text y={loc.y + 1.2}>` resolved to
    // `undefined + 1.2` = NaN — 3× `<text> attribute y: Expected length, "NaN"`
    // console errors on every render. The node-graph IS the map for region mode;
    // the coordinate fog / list block must not render alongside it.
    const MAP_REGION_MODE_NO_COORDS = {
      current_location: 'the_hall_of_doors',
      region: 'wonderland',
      explored: [
        { id: 'the_hall_of_doors', name: 'The Hall of Doors', connections: ['the_pool_of_tears'] },
        { id: 'the_pool_of_tears', name: 'The Pool of Tears', connections: ['the_hall_of_doors'] },
      ],
      fog_bounds: { width: 10, height: 10 },
      cartography: {
        navigation_mode: 'region',
        starting_region: 'the_hall_of_doors',
        regions: {
          the_hall_of_doors: { name: 'The Hall of Doors', adjacent: ['the_pool_of_tears'] },
          the_pool_of_tears: { name: 'The Pool of Tears', adjacent: ['the_hall_of_doors'] },
        },
        routes: [],
      },
    } as unknown as MapState;

    it('produces no NaN coordinate attributes for region-mode explored entries lacking x/y', () => {
      const { container } = render(
        <MapOverlay mapData={MAP_REGION_MODE_NO_COORDS} onClose={() => {}} />
      );
      const nanAttrs = container.querySelectorAll(
        '[x="NaN"], [y="NaN"], [cx="NaN"], [cy="NaN"], [x1="NaN"], [y1="NaN"], [x2="NaN"], [y2="NaN"]'
      );
      expect(nanAttrs).toHaveLength(0);
    });

    it('does not render the coordinate fog map or list when the region node-graph is shown', () => {
      render(<MapOverlay mapData={MAP_REGION_MODE_NO_COORDS} onClose={() => {}} />);
      expect(screen.getByTestId('map-region-graph')).toBeInTheDocument();
      // The node-graph is the sole map view for region mode — no coordinate fog,
      // no redundant list (regions are already in the regions-panel).
      expect(screen.queryByTestId('map-fog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('map-list')).not.toBeInTheDocument();
    });

    it('gives region-graph labels a backing halo so adjacency edges do not cut through the text', () => {
      const { container } = render(
        <MapOverlay mapData={MAP_REGION_MODE_NO_COORDS} onClose={() => {}} />
      );
      const graph = container.querySelector('[data-testid="map-region-graph"]');
      const labels = graph?.querySelectorAll('text') ?? [];
      expect(labels.length).toBeGreaterThan(0);
      // Each label paints its stroke (halo) under the fill so a line behind it
      // can't visually cut through the glyphs.
      labels.forEach((label) => {
        expect(label.getAttribute('paint-order')).toBe('stroke');
      });
    });

    it('does not crash when an explored location has no connections field', () => {
      const map = {
        ...MAP_WITH_CARTOGRAPHY,
        explored: [
          // No `connections` key at all — mimics a pre-#632 / malformed payload.
          { name: 'The Ashwood Tavern', x: 5, y: 3, type: 'settlement' },
          { name: 'Forest Path', x: 6, y: 4, type: 'road', connections: ['The Ashwood Tavern'] },
        ],
      } as unknown as MapState;
      expect(() =>
        render(<MapOverlay mapData={map} onClose={() => {}} />)
      ).not.toThrow();
      expect(screen.getByTestId('map-region-graph')).toBeInTheDocument();
    });
  });

  // --- Backward compat ---
  describe('Backward compatibility', () => {
    it('renders without cartography field (existing behavior preserved)', () => {
      const plainMap: MapState = {
        current_location: 'Town Square',
        region: 'Starting Zone',
        explored: [
          { name: 'Town Square', x: 10, y: 7, type: 'settlement', connections: [] },
        ],
        fog_bounds: { width: 20, height: 15 },
      };
      render(<MapOverlay mapData={plainMap} onClose={() => {}} />);
      expect(screen.getByTestId('map-overlay')).toBeInTheDocument();
      expect(screen.getByText('Town Square')).toBeInTheDocument();
      // No cartography elements should be rendered
      expect(screen.queryByTestId('map-navigation-mode')).not.toBeInTheDocument();
    });

    it('renders list view when no coordinates are present', () => {
      const noCoordMap: MapState = {
        current_location: 'Tavern',
        region: 'Market District',
        explored: [
          { name: 'Tavern', x: 0, y: 0, type: 'settlement', connections: [] },
          { name: 'Market', x: 0, y: 0, type: 'market', connections: ['Tavern'] },
        ],
        fog_bounds: { width: 10, height: 10 },
      };
      render(<MapOverlay mapData={noCoordMap} onClose={() => {}} />);
      // Should render list view instead of SVG
      expect(screen.getByTestId('map-list')).toBeInTheDocument();
      expect(screen.queryByTestId('map-fog')).not.toBeInTheDocument();
    });
  });
});
