import type { ExploredLocation, MapState } from "@/components/MapOverlay";

/**
 * Wire shape of one discovered room in a SITE_MAP frame
 * (sidequest-server .../map_emit.py `SiteMapLocation`). It is an
 * `ExploredLocation` MINUS the coordinate fields: room graphs have no
 * coordinates (ADR-055 — the Automapper uses a layered BFS layout, no compass
 * grid), so the server never emits x/y for site rooms.
 */
export type SiteMapLocation = Omit<ExploredLocation, "x" | "y">;

/**
 * Wire shape of a SITE_MAP frame's payload
 * (sidequest-server .../map_emit.py `SiteMapPayload`). Distinct from
 * `MapUpdatePayload` (the surface-cartography frame): the site frame carries the
 * discovered room graph (`explored[]` with `room_exits`), NO `fog_bounds`, and
 * the owning site's descriptor (`site_id`/`site_name`/`archetype`/`extent`) so
 * the client can key its map state per scene (Track B, task 8/9).
 */
export interface SiteMapPayload {
  current_location: string;
  region: string;
  explored: SiteMapLocation[];
  site_id: string;
  site_name: string;
  archetype: string;
  extent: string;
}

/**
 * A `MapState` carrying the active site's descriptor. The extra fields let
 * MapWidget foreground the site scene and render the "you are inside ⟨site⟩"
 * breadcrumb without re-plumbing the whole payload.
 */
export type SiteMapState = MapState & {
  siteId: string;
  siteName: string;
  archetype: string;
  extent: string;
};

/**
 * Runtime guard for an inbound SITE_MAP payload. Validates the load-bearing
 * fields so a malformed frame is dropped LOUDLY by the caller (No Silent
 * Fallbacks) instead of silently corrupting the Map tab. `site_id`/`site_name`
 * are load-bearing NEW fields — the scene key and the breadcrumb label — so a
 * frame that cannot name its site (missing OR empty) is rejected rather than
 * rendered as "You are inside undefined"/"You are inside ". Per-room fields are
 * trusted from the server contract.
 */
export function isSiteMapPayload(p: unknown): p is SiteMapPayload {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.current_location === "string" &&
    Array.isArray(o.explored) &&
    typeof o.site_id === "string" &&
    o.site_id.length > 0 &&
    typeof o.site_name === "string" &&
    o.site_name.length > 0
  );
}

/**
 * Give every region in a SITE_MAP frame a DISTINCT label.
 *
 * The procedural deep labels each region by its THEME display name — the server
 * builds `name` from `palette.get(node.theme).display_name`
 * (sidequest-server .../map_emit.py `_build_site_map_payload`). A megadungeon
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
  explored: SiteMapLocation[]
): SiteMapLocation[] {
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
 * Adapt a SITE_MAP payload into the `MapState` the Map tab consumes, stamping
 * the site descriptor onto it. The site wire omits x/y (per room) and
 * `fog_bounds` (per frame) because the room-graph renderer (MapWidget →
 * Automapper, ADR-055) never reads them — so we fill inert defaults to satisfy
 * `MapState` WITHOUT an `as unknown as` blind cast that would hide the shape
 * difference. The explored entries keep their `room_exits` / `room_type` /
 * `is_current_room`, which is exactly what MapWidget routes to the Automapper.
 *
 * Theme-shared region labels are disambiguated first (see
 * `disambiguateRegionLabels`) so distinct deep regions get distinct labels.
 */
export function siteMapToMapState(payload: SiteMapPayload): SiteMapState {
  return {
    current_location: payload.current_location,
    region: payload.region,
    explored: disambiguateRegionLabels(payload.explored).map((loc) => ({
      ...loc,
      x: 0,
      y: 0,
    })),
    fog_bounds: { width: 0, height: 0 },
    siteId: payload.site_id,
    siteName: payload.site_name,
    archetype: payload.archetype,
    extent: payload.extent,
  };
}
