/**
 * Types for the `/api/genres` endpoint response.
 *
 * Shape mirrors the Rust `GenreResponse` / `WorldResponse` structs in
 * `sidequest-server/src/lib.rs`. The lobby picker consumes this data to
 * render a rich two-column preview without a second fetch.
 */

export interface WorldMeta {
  /** Directory slug used as a stable identifier. */
  slug: string;
  /** Pretty display name (e.g., "Dust and Lead"). */
  name: string;
  /** Long-form description rendered in the preview panel. */
  description: string;
  /** Era string (e.g., "1878"). Null when not specified in world.yaml. */
  era: string | null;
  /** Setting subtitle (e.g., "Sangre Territory — Texas-Mexico borderlands"). */
  setting: string | null;
  /** Inspirations list, verbatim from world.yaml. Empty array when absent. */
  inspirations: string[];
  /** Narrative axis values (comedy, gravity, outlook, mythic, loyalty). */
  axis_snapshot: Record<string, number>;
  /**
   * Resolved URL of the cover POI image (served by the `/genre` ServeDir
   * mount), or `null` when `cover_poi` is missing from world.yaml or the
   * file cannot be found on disk. Consumers should render a placeholder
   * in the null case.
   */
  hero_image: string | null;
  /**
   * Stable location-capability signal. The world's cartography navigation
   * mode (`"region"` / `"room_graph"` / `"hierarchical"`), or `null` when the
   * world has no cartography at all. GameBoard gates the Location tab on this
   * so the tab is stable per session instead of blinking with transient
   * LOCATION_DESCRIPTION traffic.
   */
  navigation_mode: string | null;
}

export interface GenreMeta {
  /** Pretty display name from pack.yaml. */
  name: string;
  /** Multi-paragraph pack description. */
  description: string;
  /** Worlds in this genre, sorted by slug. */
  worlds: WorldMeta[];
}

/**
 * Response shape of `GET /api/genres`.
 *
 * Keyed by genre slug. Typical usage: `Object.entries(data).sort()` to get
 * an alphabetized list of genres for rendering in the picker.
 */
export type GenresResponse = Record<string, GenreMeta>;
