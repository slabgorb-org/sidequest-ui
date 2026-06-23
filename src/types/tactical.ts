// TypeScript types for tactical grid rendering (ADR-096 rewrite).

// ─── SVG-mode legacy types (used by DungeonMapRenderer / PlacedRoomData) ────

/**
 * A single cell type for SVG-mode dungeon rendering.
 * Still used by DungeonMapRenderer / PlacedRoomData.
 */
export type TacticalCellType =
  | "floor"
  | "wall"
  | "void"
  | "door_closed"
  | "door_open"
  | "water"
  | "difficult_terrain"
  | "feature";

/**
 * A cell in the SVG grid with its type and optional feature glyph.
 * Feature cells carry the uppercase letter glyph (A-Z) for legend lookup.
 */
export interface TacticalCell {
  readonly type: TacticalCellType;
  /** Uppercase letter glyph for feature cells, undefined otherwise. */
  readonly glyph?: string;
}

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

/** Cardinal direction for exit gap identification. */
export type CardinalDirection = "north" | "east" | "south" | "west";

/** A gap in the wall perimeter where an exit connects to another room. */
export interface ExitGap {
  readonly wall: CardinalDirection;
  readonly cells: readonly number[];
  readonly width: number;
}

/**
 * SVG-mode room grid — used by DungeonMapRenderer and PlacedRoomData.
 * Renamed from the old TacticalGridData to free the name for image-mode.
 */
export interface LegacyTacticalGridData {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly (readonly TacticalCell[])[];
  readonly legend: Record<string, FeatureDef>;
  readonly exits: readonly ExitGap[];
}

/**
 * An entity positioned on the tactical grid (player, NPC, creature).
 * Used by DungeonMapRenderer.
 */
export interface TacticalEntity {
  readonly id: string;
  readonly name: string;
  readonly position: GridPos;
  readonly size: number;
  readonly faction: "player" | "ally" | "hostile" | "neutral";
}

/**
 * A room placed in global dungeon coordinates by the layout engine.
 */
export interface PlacedRoomData {
  readonly roomId: string;
  readonly roomName: string;
  readonly grid: LegacyTacticalGridData;
  readonly globalOffsetX: number;
  readonly globalOffsetY: number;
}

/**
 * Complete dungeon layout — all rooms positioned in a global coordinate system.
 */
export interface DungeonLayoutData {
  readonly rooms: readonly PlacedRoomData[];
  readonly globalWidth: number;
  readonly globalHeight: number;
}

/**
 * Genre-themed palette for tactical grid rendering (DungeonMapRenderer).
 * Maps cell types to visual styles.
 */
export interface TacticalThemeConfig {
  /** Color for walkable floor cells. */
  readonly floor: string;
  /** Color for impassable wall cells. */
  readonly wall: string;
  /** Color for water cells. */
  readonly water: string;
  /** Color for difficult terrain cells. */
  readonly difficultTerrain: string;
  /** Color for door cells. */
  readonly door: string;
  /** Color for grid lines on floor cells. */
  readonly gridLine: string;
  /** Feature type -> color mapping. */
  readonly features: Readonly<Record<FeatureType, string>>;
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
