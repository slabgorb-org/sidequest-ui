// TypeScript types for tactical grid rendering (ADR-096 rewrite).

// ─── Shared types (grid coords, feature taxonomy) ────────────────────────────

/** Grid coordinate (x=column, y=row). */
export interface GridPos {
  readonly x: number;
  readonly y: number;
}

/** The type of a feature placed in the grid via legend. */
export type FeatureType =
  | "cover"
  | "hazard"
  | "difficult_terrain"
  | "atmosphere"
  | "interactable"
  | "door";

/** A resolved feature definition from the legend. */
export interface FeatureDef {
  readonly feature_type: FeatureType;
  readonly label: string;
}

/** A positioned tactical-map feature marker (ADR-096 token+feature phase). */
export interface TacticalFeatureMarker {
  readonly feature_type: FeatureType | "water";
  readonly cell: { readonly x: number; readonly y: number };
  readonly label: string;
}

/** An echoed tactical adjudication for the player-facing math (Story 165-4 / ADR-096 v2).
 *  Mirrors the server `TacticalAdjudication` — the client renders this, never recomputes it. */
export interface TacticalAdjudication {
  readonly actor: string;
  readonly kind: string; // "move" | "reach" | "aoe"
  readonly valid: boolean;
  readonly cells_spent?: number;
  readonly cells_budget?: number;
  readonly distance_cells?: number;
  readonly max_cells?: number;
  readonly mode?: string; // "melee" | "ranged"
  readonly reason: string;
  readonly cells: ReadonlyArray<readonly [number, number]>;
}

// ─── Image-mode types (ADR-096) ─────────────────────────────────────────────

export interface CavernCellularParams {
  readonly size: readonly [number, number];
  readonly seed: number;
  readonly density: number;
  readonly cutoff: number;
  readonly passes: number;
}

export interface CavernDerivedData {
  readonly floor_count: number;
  readonly exits: Readonly<Record<string, readonly [number, number] | null>>;
  readonly pois: ReadonlyArray<readonly [number, number]>;
}

export interface TacticalToken {
  readonly id: string;
  readonly name: string;
  readonly initial: string;
  readonly faction: "player" | "ally" | "neutral" | "hostile";
  readonly cell: { readonly x: number; readonly y: number };
  readonly hp: { readonly current: number; readonly max: number };
  readonly ac: number;
  readonly className?: string;
  readonly speed?: number;
}

/** Cavern room data. Settlement rooms route around this entirely. */
export interface TacticalGridData {
  readonly room_id: string;
  readonly room_name: string;
  readonly room_type: "cavern";
  readonly mask: string;
  readonly cavern_image_url: string;
  readonly cell_size: number;
  /** Generation params. Null for runtime-procedural caverns (Epic 52 / ADR-106) — the
   *  mask BLOB does not persist size/seed/density. Renderers must derive dimensions
   *  from the mask string when this is null. Populated for statically authored rooms. */
  readonly cellular: CavernCellularParams | null;
  readonly derived: CavernDerivedData;
  readonly tokens: readonly TacticalToken[];
  readonly features: readonly TacticalFeatureMarker[];
  /** Echoed tactical math (move budget, denied reach/range). Additive (Story 165-4):
   *  the parser always yields [] for pre-165-4 payloads, so this is effectively always
   *  present, but stays optional so older TacticalGridData fixtures still type-check. */
  readonly adjudications?: readonly TacticalAdjudication[];
}
