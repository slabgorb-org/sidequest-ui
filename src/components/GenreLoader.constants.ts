/**
 * Genre → loader-pair map for the narrator-thinking divider.
 *
 * Lives in its own module so the predicate `hasGenreLoader` can be exported
 * alongside the constants without tripping `react-refresh/only-export-components`
 * in GenreLoader.tsx (Fast Refresh requires component-only files).
 */

export type LoaderId =
  | "tea-rule"   | "tea-trail"
  | "cav-spell"  | "cav-room"
  | "wst-bar"    | "wst-wave"
  | "so-hud"     | "so-hyper"
  | "ele-brush"  | "ele-ripple"
  | "lf-quill"   | "lf-initial"
  | "neon-ascii" | "neon-hex"
  | "noir-type"  | "noir-redact";

export const GENRE_LOADERS: Record<string, readonly [LoaderId, LoaderId]> = {
  tea_and_murder:      ["tea-rule",   "tea-trail"],
  caverns_and_claudes: ["cav-spell",  "cav-room"],
  mutant_wasteland:    ["wst-bar",    "wst-wave"],
  space_opera:         ["so-hud",     "so-hyper"],
  elemental_harmony:   ["ele-brush",  "ele-ripple"],
  low_fantasy:         ["lf-quill",   "lf-initial"],
  neon_dystopia:       ["neon-ascii", "neon-hex"],
  pulp_noir:           ["noir-type",  "noir-redact"],
};

/** Loaders whose stage should center their content (text-glyph loaders). */
export const CENTERED_LOADERS: ReadonlySet<LoaderId> = new Set([
  "cav-spell", "neon-ascii", "neon-hex", "noir-type",
]);

export function hasGenreLoader(genre: string | null | undefined): boolean {
  return !!genre && genre in GENRE_LOADERS;
}
