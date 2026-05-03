// Playtest 2026-04-11: the "journal" widget (labeled "Handouts" in the UI)
// was removed from the right-side tab strip per Keith's playtest decision —
// the empty tab was clutter, never populated, and invited "what's this for?"
// questions. The render pipeline's handout classification code is kept on
// the server side (sidequest-server/src/render_integration.rs) so the
// concept can be revived later with a clear trigger and populated example.
//
// Underlying client-side surfaces still alive (intentionally not removed):
//   - JournalEntry type and gameState.journal pipeline (provider/hook level)
//   - JournalView component (the UI shell, ready for re-mounting)
// These can be reattached when the feature ships properly. Only the
// visible tab + JournalWidget wrapper + /journal slash command were removed.
export type WidgetId =
  | "narrative"
  | "character"
  | "inventory"
  | "map"
  | "ship"
  | "knowledge"
  | "gallery"
  | "confrontation"
  | "audio";

export interface WidgetDef {
  id: WidgetId;
  label: string;
  hotkey?: string;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  closable: boolean;
  /** Widget auto-appears/disappears based on data availability */
  dataGated: boolean;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDef> = {
  narrative: {
    id: "narrative",
    label: "Narrative",
    minW: 3,
    minH: 3,
    defaultW: 8,
    defaultH: 8,
    closable: false,
    dataGated: false,
  },
  character: {
    id: "character",
    label: "Character",
    hotkey: "c",
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 6,
    closable: true,
    dataGated: true,
  },
  inventory: {
    id: "inventory",
    label: "Inventory",
    hotkey: "i",
    minW: 2,
    minH: 2,
    defaultW: 3,
    defaultH: 4,
    closable: true,
    dataGated: true,
  },
  map: {
    id: "map",
    label: "Map",
    hotkey: "m",
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    closable: true,
    dataGated: true,
  },
  ship: {
    id: "ship",
    label: "Ship",
    hotkey: "s",
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    closable: true,
    dataGated: true,
  },
  knowledge: {
    id: "knowledge",
    label: "Knowledge",
    hotkey: "k",
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 4,
    closable: true,
    dataGated: true,
  },
  gallery: {
    id: "gallery",
    label: "Scrapbook",
    hotkey: "g",
    minW: 2,
    minH: 2,
    defaultW: 4,
    defaultH: 4,
    closable: true,
    dataGated: false,
  },
  confrontation: {
    id: "confrontation",
    label: "Confrontation",
    minW: 4,
    minH: 2,
    defaultW: 6,
    defaultH: 3,
    closable: false,
    dataGated: true,
  },
  audio: {
    id: "audio",
    label: "Audio",
    minW: 2,
    minH: 1,
    defaultW: 2,
    defaultH: 1,
    closable: true,
    dataGated: false,
  },
};

/** Build a hotkey → WidgetId lookup from the registry */
export function buildHotkeyMap(): Record<string, WidgetId> {
  const map: Record<string, WidgetId> = {};
  for (const def of Object.values(WIDGET_REGISTRY)) {
    if (def.hotkey) {
      map[def.hotkey] = def.id;
    }
  }
  return map;
}
