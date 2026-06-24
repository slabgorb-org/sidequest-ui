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
}
