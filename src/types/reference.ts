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

/** Flat CSS-variable token dict, e.g. `{ "--primary": "#c0392b" }`. */
export type ReferenceTheme = Record<string, string>;

/** Lore projection — world-tier (`GET /reference/api/lore/{pack}/{world}`). */
export interface LoreProjection {
  schema_version: number;
  pack: string;
  world: string;
  sections: GenericSection[];
  theme?: ReferenceTheme;
}

/** Rules projection — pack-tier (`GET /reference/api/rules/{pack}`), no world. */
export interface RulesProjection {
  schema_version: number;
  pack: string;
  sections: GenericSection[];
  theme?: ReferenceTheme;
}
