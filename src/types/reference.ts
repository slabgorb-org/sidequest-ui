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

/** Any section the reference document may carry — the generic node-tree section
 * plus the Phase-3 dedicated section types. */
export type ReferenceSection =
  | GenericSection
  | PoiSectionData
  | CastSectionData
  | TimelineSectionData;

/** Flat CSS-variable token dict, e.g. `{ "--primary": "#c0392b" }`. */
export type ReferenceTheme = Record<string, string>;

/** Lore projection — world-tier (`GET /reference/api/lore/{pack}/{world}`). */
export interface LoreProjection {
  schema_version: number;
  pack: string;
  world: string;
  sections: ReferenceSection[];
  theme?: ReferenceTheme;
}

/** Rules projection — pack-tier (`GET /reference/api/rules/{pack}`), no world. */
export interface RulesProjection {
  schema_version: number;
  pack: string;
  sections: GenericSection[];
  theme?: ReferenceTheme;
}
