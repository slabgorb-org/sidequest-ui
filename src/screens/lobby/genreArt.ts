/**
 * Per-genre visual fingerprints for the Standing Folio lobby (story 83-1).
 *
 * Two outputs per genre:
 *   - `accent`  — the genre's accent colour, set as the `--accent` CSS var on
 *                 a `[data-genre]` ancestor. Drives the "subtle accent shift"
 *                 (AC7): only the accent travels; type + structure stay the
 *                 manuscript house style.
 *   - `art`     — a layered CSS gradient standing in for the runtime AI hero
 *                 render (the designer's explicit placeholder; AC4). Used as
 *                 the hero background when a world has no `hero_image`.
 *
 * Values lifted from the design handoff `tokens.css` `[data-genre]` map. An
 * unknown genre slug falls back to the neutral house gold + a parchment
 * gradient — a presentation default for an unrecognised pack, not a masked
 * configuration error.
 */

export interface GenreArt {
  accent: string;
  art: string;
}

/** Neutral house treatment for an unrecognised genre slug. */
const HOUSE: GenreArt = {
  accent: "#d4a945",
  art:
    "radial-gradient(110% 80% at 30% 16%, #4a4030 0%, #2e261a 34%, transparent 62%)," +
    " linear-gradient(180deg, #2b2012 0%, #1a140d 80%)",
};

const GENRE_ART: Record<string, GenreArt> = {
  low_fantasy: {
    accent: "#b88a4e",
    art:
      "radial-gradient(120% 90% at 70% 12%, #5a6b66 0%, #3c4a47 32%, transparent 60%)," +
      " linear-gradient(180deg, #2e3a39 0%, #1f1810 80%)",
  },
  tea_and_murder: {
    accent: "#cdb06b",
    art:
      "radial-gradient(110% 80% at 28% 18%, #e9d8b0 0%, #c9a96e 30%, transparent 62%)," +
      " radial-gradient(80% 70% at 88% 92%, #5c7a4f 0%, transparent 55%)," +
      " linear-gradient(180deg, #b59b6e 0%, #4a3a24 78%)",
  },
  elemental_harmony: {
    accent: "#c98a4a",
    art:
      "radial-gradient(100% 80% at 30% 20%, #d6d4e6 0%, #a89ec0 32%, transparent 60%)," +
      " linear-gradient(180deg, #6a6480 0%, #281f12 80%)",
  },
  caverns_and_claudes: {
    accent: "#d4a843",
    art:
      "radial-gradient(110% 80% at 32% 16%, #6b5536 0%, #3e2f1a 34%, transparent 60%)," +
      " radial-gradient(80% 70% at 82% 94%, #b5472b 0%, transparent 48%)," +
      " linear-gradient(180deg, #3a2c18 0%, #1a140d 80%)",
  },
  space_opera: {
    accent: "#6fa8e0",
    art:
      "radial-gradient(120% 90% at 70% 14%, #2a3c5a 0%, #16223a 34%, transparent 62%)," +
      " radial-gradient(70% 60% at 18% 90%, #e8a838 0%, transparent 44%)," +
      " linear-gradient(180deg, #14203a 0%, #0d1018 82%)",
  },
  neon_dystopia: {
    accent: "#39d8d8",
    art:
      "radial-gradient(110% 80% at 72% 16%, #1c4a4a 0%, #102a2a 34%, transparent 60%)," +
      " radial-gradient(80% 70% at 16% 92%, #c264c2 0%, transparent 50%)," +
      " linear-gradient(180deg, #10222a 0%, #0d1014 82%)",
  },
  mutant_wasteland: {
    accent: "#9bc46a",
    art:
      "radial-gradient(110% 80% at 30% 18%, #5a5a2a 0%, #34341a 34%, transparent 60%)," +
      " radial-gradient(80% 70% at 84% 92%, #ff6600 0%, transparent 46%)," +
      " linear-gradient(180deg, #3a3a1f 0%, #1a160d 80%)",
  },
  road_warrior: {
    accent: "#d08a3e",
    art:
      "radial-gradient(110% 80% at 30% 18%, #7a5a36 0%, #4a3420 34%, transparent 60%)," +
      " radial-gradient(80% 70% at 84% 92%, #7a3b1a 0%, transparent 50%)," +
      " linear-gradient(180deg, #4a3420 0%, #1a140d 82%)",
  },
  spaghetti_western: {
    accent: "#cca24f",
    art:
      "radial-gradient(110% 80% at 30% 18%, #c9a05a 0%, #8a6a36 32%, transparent 60%)," +
      " radial-gradient(80% 70% at 86% 92%, #9a5a24 0%, transparent 50%)," +
      " linear-gradient(180deg, #7a5a32 0%, #2a1f10 80%)",
  },
  pulp_noir: {
    accent: "#c4a35a",
    art:
      "radial-gradient(110% 80% at 30% 16%, #4a4636 0%, #2a281c 34%, transparent 60%)," +
      " radial-gradient(70% 60% at 84% 92%, #d4a017 0%, transparent 42%)," +
      " linear-gradient(180deg, #2a281c 0%, #14120c 82%)",
  },
  heavy_metal: {
    accent: "#c25460",
    art:
      "radial-gradient(110% 80% at 30% 16%, #4a1a22 0%, #2a0e12 34%, transparent 60%)," +
      " radial-gradient(80% 70% at 84% 92%, #6a1119 0%, transparent 50%)," +
      " linear-gradient(180deg, #2a0e12 0%, #120a0c 82%)",
  },
};

/** Resolve a genre's art + accent, falling back to the neutral house treatment. */
export function getGenreArt(genreSlug: string | null | undefined): GenreArt {
  if (!genreSlug) return HOUSE;
  return GENRE_ART[genreSlug] ?? HOUSE;
}
