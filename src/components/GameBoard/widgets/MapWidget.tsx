import { useMemo } from "react";
import { Automapper, type ExploredRoom } from "@/components/Automapper";
import { MapOverlay, type MapState } from "@/components/MapOverlay";
import { OrbitalChartView } from "@/components/OrbitalChart";
import { useOrbitalChart } from "@/hooks/useOrbitalChart";
import { tacticalGridFromWire } from "@/lib/tacticalGridFromWire";
import type {
  OrbitalIntent,
  OrbitalIntentResponse,
} from "@/types/orbital-intent";

/** Worlds that opt into the server-rendered orbital chart (orbits.yaml). */
const ORBITAL_WORLD_SLUGS = new Set(["coyote_star"]);

interface MapWidgetProps {
  mapData: MapState | null;
  /** Active world slug — drives orbital chart routing for hierarchical worlds. */
  worldSlug?: string;
  /** Latest ORBITAL_CHART message from the server, or null. */
  lastOrbitalChart?: OrbitalIntentResponse | null;
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
 * Map tab renderer.
 *
 * Routing (highest priority first):
 * - Orbital world (e.g. coyote_star) → server-rendered OrbitalChartView,
 *   regardless of mapData. The chart is the diegetic map for hierarchical
 *   star-system worlds and renders as soon as the server returns the SVG.
 *   Pan/zoom is client-side; drill-in/out round-trips a fresh SVG.
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
 * Task 16).
 */
export function MapWidget({
  mapData,
  worldSlug,
  lastOrbitalChart = null,
  sendOrbitalIntent,
  sessionBoundEpoch = 0,
}: MapWidgetProps) {
  const orbitalEnabled = worldSlug !== undefined && ORBITAL_WORLD_SLUGS.has(worldSlug);
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
