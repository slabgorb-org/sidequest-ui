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
 * Adapt a DUNGEON_MAP payload into the `MapState` the Map tab consumes. The
 * dungeon wire omits x/y (per room) and `fog_bounds` (per frame) because the
 * room-graph renderer (MapWidget → Automapper, ADR-055) never reads them — so
 * we fill inert defaults to satisfy `MapState` WITHOUT an `as unknown as` blind
 * cast that would hide the shape difference. The explored entries keep their
 * `room_exits` / `room_type` / `is_current_room`, which is exactly what
 * MapWidget routes to the Automapper.
 */
export function dungeonMapToMapState(payload: DungeonMapPayload): MapState {
  return {
    current_location: payload.current_location,
    region: payload.region,
    explored: payload.explored.map((loc) => ({ ...loc, x: 0, y: 0 })),
    fog_bounds: { width: 0, height: 0 },
  };
}
