import type { ExploredLocation, MapState } from "@/components/MapOverlay";

/**
 * Wire shape of one discovered room in a DUNGEON_MAP frame
 * (sidequest-server .../map_emit.py `DungeonMapLocation`). It is an
 * `ExploredLocation` MINUS the coordinate fields: room graphs have no
 * coordinates (ADR-055 — the Automapper uses a layered BFS layout, no compass
 * grid), so the server never emits x/y for dungeon rooms.
 */
export type DungeonMapLocation = Omit<ExploredLocation, "x" | "y">;

/**
 * Wire shape of a DUNGEON_MAP frame's payload
 * (sidequest-server .../map_emit.py `DungeonMapPayload`). Distinct from
 * `MapUpdatePayload` (the surface-cartography frame): the dungeon frame carries
 * the discovered room graph (`explored[]` with `room_exits`) and NO `fog_bounds`.
 */
export interface DungeonMapPayload {
  current_location: string;
  region: string;
  explored: DungeonMapLocation[];
}

/**
 * Runtime guard for an inbound DUNGEON_MAP payload. Validates the load-bearing
 * fields so a malformed frame is dropped LOUDLY by the caller (No Silent
 * Fallbacks) instead of silently corrupting the Map tab. Per-room fields are
 * trusted from the server contract.
 */
export function isDungeonMapPayload(p: unknown): p is DungeonMapPayload {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return typeof o.current_location === "string" && Array.isArray(o.explored);
}

/**
 * Give every region in a DUNGEON_MAP frame a DISTINCT label.
 *
 * The procedural deep labels each region by its THEME display name — the server
 * builds `name` from `palette.get(node.theme).display_name`
 * (sidequest-server .../map_emit.py `_build_dungeon_map_payload`). A megadungeon
 * theme spans many regions, so every region in a "drowned cavern" zone arrives
 * with the IDENTICAL label "The Drowned Cavern" while its `id` (e.g. `exp001.r2`)
 * stays distinct. Rendered verbatim, the deep map is a wall of duplicate labels
 * you cannot navigate by (sq-playtest 2026-06-22, beneath_sunden).
 *
 * The cure is the tabletop one: when a label collides, number the duplicates
 * ("The Drowned Cavern 1/2/3"). Numbering follows the payload's array order —
 * the server's discovered-region order — so a given region keeps its number as
 * the discovered set grows (new regions append, existing labels stay put).
 * Names that occur once are left untouched. Only the human-facing `name` is
 * rewritten; `id` / `connections` / `room_exits` (which the Automapper joins on)
 * are never touched, so disambiguation cannot break the graph topology.
 */
function disambiguateRegionLabels(
  explored: DungeonMapLocation[]
): DungeonMapLocation[] {
  const totalByName = new Map<string, number>();
  for (const loc of explored) {
    totalByName.set(loc.name, (totalByName.get(loc.name) ?? 0) + 1);
  }
  const seenByName = new Map<string, number>();
  return explored.map((loc) => {
    if ((totalByName.get(loc.name) ?? 0) <= 1) return loc;
    const n = (seenByName.get(loc.name) ?? 0) + 1;
    seenByName.set(loc.name, n);
    return { ...loc, name: `${loc.name} ${n}` };
  });
}

/**
 * Adapt a DUNGEON_MAP payload into the `MapState` the Map tab consumes. The
 * dungeon wire omits x/y (per room) and `fog_bounds` (per frame) because the
 * room-graph renderer (MapWidget → Automapper, ADR-055) never reads them — so
 * we fill inert defaults to satisfy `MapState` WITHOUT an `as unknown as` blind
 * cast that would hide the shape difference. The explored entries keep their
 * `room_exits` / `room_type` / `is_current_room`, which is exactly what
 * MapWidget routes to the Automapper.
 *
 * Theme-shared region labels are disambiguated first (see
 * `disambiguateRegionLabels`) so distinct deep regions get distinct labels.
 */
export function dungeonMapToMapState(payload: DungeonMapPayload): MapState {
  return {
    current_location: payload.current_location,
    region: payload.region,
    explored: disambiguateRegionLabels(payload.explored).map((loc) => ({
      ...loc,
      x: 0,
      y: 0,
    })),
    fog_bounds: { width: 0, height: 0 },
  };
}
