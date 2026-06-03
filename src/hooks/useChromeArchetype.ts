import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export type ChromeArchetype = "parchment" | "terminal" | "rugged" | "house";

const GENRE_TO_ARCHETYPE: Record<string, ChromeArchetype> = {
  low_fantasy: "parchment",
  tea_and_murder: "parchment",
  elemental_harmony: "parchment",
  // wry_whimsy — golden-age literary portal fairytale (Denslow 1900 storybook).
  // Bookish serif chrome, same family as the other literary parchment packs.
  wry_whimsy: "parchment",
  neon_dystopia: "terminal",
  space_opera: "terminal",
  road_warrior: "rugged",
  mutant_wasteland: "rugged",
  spaghetti_western: "rugged",
  pulp_noir: "rugged",
  caverns_and_claudes: "rugged",
  // heavy_metal was previously mapped to parchment AND rugged (duplicate key —
  // last-wins made it effectively rugged). The 2026-04-10 rework moved
  // heavy_metal to rugged; the stale parchment entry is removed here.
  heavy_metal: "rugged",
};

export function getArchetypeForGenre(genre: string): ChromeArchetype {
  const archetype = GENRE_TO_ARCHETYPE[genre];
  if (!archetype) {
    throw new Error(`Unknown genre slug: "${genre}"`);
  }
  return archetype;
}

export const ARCHETYPE_PROPERTIES: Record<
  ChromeArchetype,
  Record<string, string>
> = {
  parchment: {
    "--font-body": "'EB Garamond', Georgia, serif",
    "--font-ui": "'EB Garamond', Georgia, serif",
    "--font-display": "'Cinzel', 'EB Garamond', serif",
    "--border-radius": "2px",
  },
  terminal: {
    "--font-body": "'Share Tech Mono', 'Courier New', monospace",
    "--font-ui": "'Orbitron', monospace",
    "--font-display": "'Orbitron', monospace",
    "--border-radius": "0px",
  },
  rugged: {
    "--font-body": "'Source Sans 3', 'Helvetica Neue', sans-serif",
    "--font-ui": "'Oswald', Impact, sans-serif",
    "--font-display": "'Pirata One', 'Oswald', serif",
    "--border-radius": "4px",
  },
  // House — the neutral SideQuest lobby chrome. NOT a genre: a humanist serif
  // body over a clean UI sans, distinct 3px radius (parchment=2px, terminal=0px,
  // rugged=4px, so all four stay distinct). Reads as "the menu", so a themed
  // world-preview card visibly lights up against it.
  house: {
    "--font-body": "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
    "--font-ui": "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    "--font-display": "'Iowan Old Style', Georgia, serif",
    "--border-radius": "3px",
  },
};

/**
 * Apply (or clear) a chrome archetype on a specific element. Sets the
 * `data-archetype` attribute and the archetype's structural CSS custom
 * properties. Returns the list of property keys it set, so the caller can
 * remove exactly those on the next change (no leak across archetype swaps).
 * Passing `null` removes the attribute and clears previously-set keys.
 */
export function applyArchetypeToElement(
  el: HTMLElement,
  archetype: ChromeArchetype | null,
  prevKeys: string[],
): string[] {
  const style = el.style;
  for (const key of prevKeys) {
    style.removeProperty(key);
  }
  if (!archetype) {
    el.removeAttribute("data-archetype");
    return [];
  }
  el.setAttribute("data-archetype", archetype);
  const props = ARCHETYPE_PROPERTIES[archetype];
  const newKeys: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    style.setProperty(key, value);
    newKeys.push(key);
  }
  return newKeys;
}

/**
 * Apply a chrome archetype to the document root (`<html>`). Pass `null` to
 * clear it. Callers resolve genre slugs via `getArchetypeForGenre` before
 * calling — the hook itself is archetype-driven so it can also apply the
 * non-genre `house` chrome.
 */
export function useChromeArchetype(
  archetype: ChromeArchetype | null,
): ChromeArchetype | null {
  const prevKeysRef = useRef<string[]>([]);

  useEffect(() => {
    prevKeysRef.current = applyArchetypeToElement(
      document.documentElement,
      archetype,
      prevKeysRef.current,
    );
  }, [archetype]);

  return archetype;
}

/**
 * Apply a chrome archetype to a specific element (a subtree), leaving the
 * document root untouched. Used to confine a world's genre flavor to the
 * lobby preview card without leaking onto the lobby shell.
 */
export function useScopedChromeArchetype(
  ref: RefObject<HTMLElement | null>,
  archetype: ChromeArchetype | null,
): void {
  const prevKeysRef = useRef<string[]>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    prevKeysRef.current = applyArchetypeToElement(el, archetype, prevKeysRef.current);
  }, [ref, archetype]);
}
