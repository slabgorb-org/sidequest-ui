// Story 100-8 (Phase 2) — TypeScript types for the reference-page projection
// JSON (AC6). Pinned from the live Phase-1 server projection
// (sidequest-server/sidequest/server/reference_projection.py): the projector
// emits exactly three node kinds, generic sections of `{id, label, node}`, and
// per-document `{schema_version, pack, [world], sections, theme?}`.
//
// `theme` is a FLAT CSS-variable token dict (`{"--var": value}`) consumed by
// the 100-9 session-free theme injector; this story only renders the sections.

/** A single rendered value in the generic node tree. */
export type ReferenceNode =
  | { type: "scalar"; value: string | number | boolean | null }
  | { type: "list"; items: ReferenceNode[] }
  | { type: "dict"; entries: ReferenceDictEntry[] };

/** One key/value pair inside a `dict` node. */
export interface ReferenceDictEntry {
  key: string;
  label: string;
  node: ReferenceNode;
}

/** A generic YAML section projected into a labelled node tree. */
export interface GenericSection {
  id: string;
  label: string;
  node: ReferenceNode;
}

// Story 100-11 (Phase 3) — dedicated lore-section shapes, pinned verbatim from
// the live server projection (reference_projection.py). These carry their own
// typed payload (`entries` / `members`) instead of a generic `node`, and each is
// routed to a purpose-built renderer by `SectionDispatch`.

/** One Point of Interest. `image_url` is ALWAYS present — the server only
 * projects a POI when its landscape art is on R2 (gallery exclusion model). */
export interface PoiEntry {
  slug: string;
  name: string;
  region: string | null;
  description: string | null;
  image_url: string;
}

/** The `poi` section (`build_poi_section`). */
export interface PoiSectionData {
  id: "poi";
  label: string;
  entries: PoiEntry[];
}

/** One cast member. `portrait_url` is nullable — the server resolves the R2 URL
 * only when the portrait slug is on R2, else `null` (the member still ships). */
export interface CastMember {
  slug: string;
  name: string;
  role: string | null;
  appearance: string | null;
  portrait_url: string | null;
}

/** The `cast` section (`build_cast_section`). */
export interface CastSectionData {
  id: "cast";
  label: string;
  members: CastMember[];
}

/** One timeline (legend) entry. `temporal` is the era/year label, or `null`. */
export interface TimelineEntry {
  slug: string;
  name: string;
  summary: string;
  temporal: string | null;
}

/** The `timeline` section (`build_timeline_section`). The server has ALREADY
 * ordered `entries` (dated spine first, undated last) per `sort_mode`; the
 * client renders the array verbatim and never re-sorts. */
export interface TimelineSectionData {
  id: "timeline";
  label: string;
  sort_mode: "sorted" | "authored_order";
  preamble: string | null;
  entries: TimelineEntry[];
}

// Story 104-3 (M-C) — the lore-page `map` section, pinned verbatim from the live
// server projection (reference_projection.py::build_lore_map_section). It carries
// graph TOPOLOGY only — regions (a list, each with embedded NPC pins), edges, and
// dropped (dangling) adjacencies — and is adapted by `MapSection` into the shared
// `CartographyMap`'s `CartographyMetadata`. Completes story 100-12's dropped seam.

/** One NPC portrait pin on a region. `portrait_url` is nullable — the server
 * resolves the R2 URL only when the portrait slug is on R2, else `null` (the pin
 * still ships, but renders no portrait image — parity with the Cast section). */
export interface MapPin {
  slug: string;
  label: string;
  portrait_url: string | null;
}

/** One region in the `map` section. Unlike the in-game `CartographyMetadata`
 * (a Record), the projection emits regions as a LIST with embedded `pins`. */
export interface MapRegion {
  id: string;
  name: string;
  adjacent: string[];
  pins: MapPin[];
}

/** The `map` section (`build_lore_map_section`). `is_cluster` (Story 104-1 / M-A)
 * rides the section so the Map surface can branch single-system vs cluster off the
 * same authoritative server flag as the in-game map. `edges`/`dangling` are
 * sorted-endpoint pairs the server already de-duped. */
export interface MapSectionData {
  id: "map";
  label: string;
  starting_region: string;
  is_cluster: boolean;
  regions: MapRegion[];
  edges: [string, string][];
  dangling: [string, string][];
}

/** Any section the reference document may carry — the generic node-tree section
 * plus the Phase-3 dedicated section types and the Story 104-3 map section. */
export type ReferenceSection =
  | GenericSection
  | PoiSectionData
  | CastSectionData
  | TimelineSectionData
  | MapSectionData;

/** Flat CSS-variable token dict, e.g. `{ "--primary": "#c0392b" }`. */
export type ReferenceTheme = Record<string, string>;

/** Masthead chrome (2026-06-09 reference redesign), attached at the route
 * layer like `theme` (`build_reference_meta`). `dateline` is omitted when the
 * pack has no blurb chrome (the server fires a `meta_missing` ERROR span);
 * `world_name` rides only the lore tier. The dinkus glyph is NOT here — it
 * arrives in the theme token set as `--dinkus-light`. */
export interface ReferenceMeta {
  pack_label: string;
  dateline?: string;
  world_name?: string;
}

/** Lore projection — world-tier (`GET /reference/api/lore/{pack}/{world}`). */
export interface LoreProjection {
  schema_version: number;
  pack: string;
  world: string;
  sections: ReferenceSection[];
  theme?: ReferenceTheme;
  meta?: ReferenceMeta;
}

/** Rules projection — pack-tier (`GET /reference/api/rules/{pack}`), no world. */
export interface RulesProjection {
  schema_version: number;
  pack: string;
  sections: GenericSection[];
  theme?: ReferenceTheme;
  meta?: ReferenceMeta;
}
