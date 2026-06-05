import type { NarratorVerbosity, NarratorVocabulary } from "@/types/protocol";

/**
 * Story 82-2 (ADR-049): player-chosen narrator tuning persisted in localStorage
 * (same idiom as `sq:display-name`) so the choice made in the lobby bridges
 * across the POST/navigate to App's slug-connect effect, which folds it into the
 * outbound CONNECT payload.
 *
 * No Silent Fallbacks: `loadNarratorPrefs` validates against the allowed value
 * set and OMITS anything absent or unrecognized rather than coercing to a
 * literal — an omitted axis lets the server resolve it via
 * `default_for_player_count`.
 */
export const NARRATOR_VERBOSITY_KEY = "sq:narrator-verbosity";
export const NARRATOR_VOCABULARY_KEY = "sq:narrator-vocabulary";

export const VERBOSITY_VALUES: readonly NarratorVerbosity[] = ["concise", "standard", "verbose"];
export const VOCABULARY_VALUES: readonly NarratorVocabulary[] = ["accessible", "literary", "epic"];

export interface NarratorPrefs {
  narrator_verbosity?: NarratorVerbosity;
  narrator_vocabulary?: NarratorVocabulary;
}

export function loadNarratorPrefs(): NarratorPrefs {
  const prefs: NarratorPrefs = {};
  try {
    const v = localStorage.getItem(NARRATOR_VERBOSITY_KEY);
    if (v && (VERBOSITY_VALUES as readonly string[]).includes(v)) {
      prefs.narrator_verbosity = v as NarratorVerbosity;
    }
    const w = localStorage.getItem(NARRATOR_VOCABULARY_KEY);
    if (w && (VOCABULARY_VALUES as readonly string[]).includes(w)) {
      prefs.narrator_vocabulary = w as NarratorVocabulary;
    }
  } catch {
    // non-critical — absence is handled server-side via default_for_player_count
  }
  return prefs;
}

export function saveNarratorPrefs(prefs: NarratorPrefs): void {
  try {
    if (prefs.narrator_verbosity) {
      localStorage.setItem(NARRATOR_VERBOSITY_KEY, prefs.narrator_verbosity);
    }
    if (prefs.narrator_vocabulary) {
      localStorage.setItem(NARRATOR_VOCABULARY_KEY, prefs.narrator_vocabulary);
    }
  } catch {
    // non-critical
  }
}
