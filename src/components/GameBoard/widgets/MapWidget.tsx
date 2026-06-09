import { useMemo, useState } from "react";
import { Automapper, type ExploredRoom } from "@/components/Automapper";
import { MapOverlay, type MapState } from "@/components/MapOverlay";
import { OrbitalChartView } from "@/components/OrbitalChart";
import { useOrbitalChart } from "@/hooks/useOrbitalChart";
import { tacticalGridFromWire } from "@/lib/tacticalGridFromWire";
import type {
  OrbitalIntent,
  OrbitalIntentError,
  OrbitalIntentResponse,
} from "@/types/orbital-intent";

interface MapWidgetProps {
  mapData: MapState | null;
  /**
   * Server-announced orbital capability (GameResponse.orbital — the world
   * ships orbital content). Since ADR-141 / story 98-3 this is a
   * *capability* signal only, no longer a whole-Map router: a cluster
   * world (multi-region cartography) defaults to the campaign graph and
   * drills into the orrery; only a single-system world (≤1 region node —
   * the two scales collapse) renders orrery-as-Map directly (#748).
   */
  orbital?: boolean;
  /** Latest ORBITAL_CHART message from the server, or null. */
  lastOrbitalChart?: OrbitalIntentResponse | null;
  /**
   * Latest ORBITAL_INTENT rejection (ERROR with an orbital code), or null.
   * Drives the AC5 "no local chart" state when the party's current region
   * has no authored systems/<region_id>.yaml (server fails loud, 98-2).
   * Cleared upstream when a fresh ORBITAL_CHART arrives.
   */
  lastOrbitalError?: OrbitalIntentError | null;
  /** Send an OrbitalIntent over the WebSocket. */
  sendOrbitalIntent?: (intent: OrbitalIntent) => void;
  /**
   * Bumps every time SESSION_EVENT{ready}/{connected} arrives so the
   * orbital hook re-fetches the initial view_map after a fresh bind.
   * See ``useOrbitalChart`` JSDoc for the AwaitingConnect/zombie-bind
   * races this unsticks. Defaults to 0 — non-orbital worlds and tests
   * that don't drive reconnects don't need to thread it.
   */
  sessionBoundEpoch?: number;
}

/**
 * Map tab renderer — two-scale per ADR-141 (story 98-3).
 *
 * Routing (highest priority first):
 * - Orbital **cluster** world (multi-region cartography, e.g.
 *   perseus_cloud) → campaign scale by default: the shared d3-dag
 *   cartography graph (100-10's CartographyMap via MapOverlay). Clicking
 *   the node the party occupies drills into that system's orrery (local
 *   scale); a back affordance returns to the campaign graph. Drill-down
 *   is occupied-node-only — the server resolves the system file by the
 *   party's current region (98-2).
 * - Orbital **single-system** world (≤1 region node, e.g. coyote_star) →
 *   the two scales collapse: server-rendered OrbitalChartView is the Map
 *   (#748 behavior, preserved). Pan/zoom is client-side; drill-in/out
 *   round-trips a fresh SVG.
 * - Empty / no data → "no map yet" empty state.
 * - Room graph data (room_graph navigation mode, `explored[]` carries room
 *   exits) → graphical SVG dungeon map via Automapper. Room graphs have no
 *   compass directions per ADR-055, so Automapper's layered BFS layout
 *   applies (fed back automatically by exit direction detection).
 * - Region / cartography data (no room graph) → MapOverlay, which handles
 *   regions + routes + the coordinate SVG path.
 *
 * Wiring story: the Automapper/DungeonMapRenderer components from story
 * 29-8 were built but never imported by the widget — this file is the
 * wiring fix (sq-playtest 2026-04-09). The static client-side Orrery was
 * replaced 2026-05-02 with the server-rendered OrbitalChartView so the
 * chart can react to the orbital clock and party position (orbital-map
 * Task 16). The `orbital: bool` whole-Map toggle from playtest fix #748
 * was re-scoped to the two-scale drill 2026-06-09 (ADR-141 / 98-3).
 */
export function MapWidget({
  mapData,
  orbital = false,
  lastOrbitalChart = null,
  lastOrbitalError = null,
  sendOrbitalIntent,
  sessionBoundEpoch = 0,
}: MapWidgetProps) {
  // Campaign ↔ local scale state (ADR-141). Only meaningful for cluster
  // worlds; single-system worlds are always at local scale (collapse).
  const [drilledIn, setDrilledIn] = useState(false);

  // Cluster vs single-system is derivable from the cartography node count
  // (ADR-141: no new world-level flag) — >1 region node = cluster.
  const regionCount = mapData?.cartography
    ? Object.keys(mapData.cartography.regions ?? {}).length
    : 0;
  const isCluster = regionCount > 1;
  const currentRegionId = mapData?.current_location ?? "";

  const atLocalScale = !isCluster || drilledIn;
  const orbitalEnabled = orbital && atLocalScale;
  const noopIntent = useMemo(() => () => {}, []);

  // Plot-a-course: bump a counter every time the server-side plotted_course
  // changes so the chart re-fetches with the new overlay (or without it
  // on cancel). Hash on (to_body_id, plotted_at_t_hours) — both change on
  // every plot, neither changes on incidental snapshot updates.
  const plottedCourseRevision = useMemo(() => {
    const pc = lastOrbitalChart?.plotted_course;
    if (!pc) return 0;
    // Rolling hash; collisions are harmless (worst case: spurious extra fetch).
    return (
      (pc.to_body_id.charCodeAt(0) ?? 0) +
      Math.floor(pc.plotted_at_t_hours * 1000)
    );
  }, [lastOrbitalChart?.plotted_course]);

  const { chart, onIntent } = useOrbitalChart({
    enabled: orbitalEnabled && sendOrbitalIntent !== undefined,
    sendIntent: sendOrbitalIntent ?? noopIntent,
    lastResponse: lastOrbitalChart,
    plottedCourseRevision,
    sessionBoundEpoch,
  });

  const roomGraph = useMemo(
    () => (mapData ? toExploredRooms(mapData) : []),
    [mapData]
  );

  // Cluster world, campaign scale: the d3-dag cartography graph is the
  // Map. Clicking the occupied node drills into its orrery (ADR-141:
  // "drilled into from the node the party occupies" — the server resolves
  // systems/<region>.yaml by the party's current region, so other nodes
  // have no renderable local chart to drill into).
  if (orbital && mapData && isCluster && !drilledIn) {
    return (
      <MapOverlay
        mapData={mapData}
        onNodeSelect={(regionId) => {
          if (regionId === currentRegionId) setDrilledIn(true);
        }}
      />
    );
  }

  // Cluster world, local scale: the occupied system's orrery, with a back
  // affordance to the campaign graph in every sub-state (loading / chart /
  // no-local-chart) so the player is never trapped at local scale.
  if (orbital && mapData && isCluster) {
    return (
      <div
        data-testid="map-panel-local"
        className="flex flex-col"
        style={{ width: "100%", height: "100%" }}
      >
        <div className="shrink-0 p-1">
          <button
            data-testid="map-drill-back"
            onClick={() => setDrilledIn(false)}
            className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-[var(--primary)]"
          >
            ◂ Cluster map
          </button>
        </div>
        {lastOrbitalError && !chart ? (
          <div
            data-testid="map-panel-no-local-chart"
            className="p-4 text-sm text-muted-foreground/60 italic"
          >
            No local chart for this system yet — its orrery hasn't been
            charted. {lastOrbitalError.message}
          </div>
        ) : !chart ? (
          <div
            data-testid="map-panel-orbital-loading"
            className="p-4 text-sm text-muted-foreground/60 italic"
          >
            Loading orbital chart…
          </div>
        ) : (
          <div
            data-testid="map-panel-orbital"
            className="grow"
            style={{ width: "100%" }}
          >
            <OrbitalChartView
              svg={chart.svg}
              scopeCenter={chart.scope_center}
              tHours={chart.t_hours}
              epochDays={chart.epoch_days}
              nextConjunction={chart.next_conjunction}
              onIntent={onIntent}
            />
          </div>
        )}
      </div>
    );
  }

  // Single-system orbital world (or no cartography yet): orrery-as-Map,
  // the verified #748 behavior — the two scales collapse to one.
  if (orbitalEnabled) {
    if (!chart) {
      return (
        <div
          data-testid="map-panel-orbital-loading"
          className="p-4 text-sm text-muted-foreground/60 italic"
        >
          Loading orbital chart…
        </div>
      );
    }
    return (
      <div
        data-testid="map-panel-orbital"
        style={{ width: "100%", height: "100%" }}
      >
        <OrbitalChartView
          svg={chart.svg}
          scopeCenter={chart.scope_center}
          tHours={chart.t_hours}
          epochDays={chart.epoch_days}
          nextConjunction={chart.next_conjunction}
          onIntent={onIntent}
        />
      </div>
    );
  }

  if (!mapData) {
    return (
      <div
        data-testid="map-panel-empty"
        className="p-4 text-sm text-muted-foreground/60 italic"
      >
        No map data yet. The world map will populate as you explore.
      </div>
    );
  }

  if (roomGraph.length > 0) {
    const currentRoomId =
      roomGraph.find((r) => r.is_current)?.id ?? roomGraph[0]?.id ?? "";
    return (
      <div data-testid="map-panel-room-graph" className="p-2">
        <Automapper rooms={roomGraph} currentRoomId={currentRoomId} />
      </div>
    );
  }

  return <MapOverlay mapData={mapData} />;
}

/**
 * Adapt a protocol-level MapState into the Automapper's ExploredRoom shape.
 *
 * Returns [] when the map is in region/cartography mode (no per-location
 * `room_exits`). We key on `room_exits` rather than `connections` because
 * the room graph mode specifically populates `room_exits` with typed exit
 * info — `connections` is a plain name list that exists in both modes.
 */
function toExploredRooms(mapData: MapState): ExploredRoom[] {
  const explored = mapData.explored ?? [];
  const hasRoomGraph = explored.some(
    (loc) => loc.room_exits && loc.room_exits.length > 0
  );
  if (!hasRoomGraph) return [];

  const currentLocation = mapData.current_location;

  // Join key: prefer the protocol-level room slug (`id`), fall back to name
  // for region-mode fixtures that pre-date the id field.
  const keyFor = (loc: { id?: string; name: string }) => loc.id ?? loc.name;

  return explored.map((loc) => ({
    id: keyFor(loc),
    name: loc.name,
    room_type: loc.room_type ?? loc.type ?? "normal",
    size: "medium",
    is_current:
      loc.is_current_room === true || keyFor(loc) === currentLocation,
    exits: (loc.room_exits ?? []).map((ex) => ({
      // Direction is unknown for room graph mode — triggers Automapper's
      // layered BFS fallback layout.
      direction: "",
      exit_type: ex.exit_type,
      // RoomExitInfo.target is a RoomDef slug; it lines up with each
      // ExploredRoom.id we just assigned above via `keyFor`.
      to_room_id: ex.target,
    })),
    // ADR-096 Task 20b: cavern rooms carry their image-mode grid via the
    // TACTICAL_GRID message (parked under `cavern_payload`); the renderer
    // takes them through TacticalGridRenderer. Settlement rooms route via
    // `room_type === "settlement"` and don't populate a grid here. The
    // legacy `tactical_grid` wire field on MAP_UPDATE has a distinct shape
    // (width/height/cells/features) that no current world emits — leave it
    // unconsumed until a wire-to-LegacyTacticalGridData parser lands.
    cavernGrid: loc.cavern_payload
      ? (tacticalGridFromWire(loc.cavern_payload) ?? undefined)
      : undefined,
  }));
}
