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
// Story 85-3 (Tier B): confrontation is promoted BACK into the dockview as a
// data-gated, auto-focused panel (it was a panel before 2026-05-13, then moved
// to a bottom strip when chandelier-swinging free actions were wired in). It
// now claims the board canvas while an encounter is active — SPLIT with
// `narrative` (which stays always-present), never a full takeover. See
// docs/design/confrontation-space-usage.md.
export type WidgetId =
  | "narrative"
  | "character"
  | "inventory"
  | "map"
  | "location"
  | "ship"
  | "knowledge"
  | "relationships"
  | "quests"
  | "gallery"
  | "audio"
  | "confrontation";

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
  // Story 54-9 / ADR-109: persistent-location panel slots between Map
  // and Knowledge. dataGated so the tab is hidden during chargen and on
  // pre-54 worlds without a delivered manifest.
  location: {
    id: "location",
    label: "Location",
    hotkey: "l",
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
  // ADR-136 Task 14: NPC relationship roster. Always present from session
  // start — renders an empty state ("No one met yet") until a RELATIONSHIPS
  // snapshot arrives. Playtest override 2026-06-04: Keith prefers a stable
  // tab over a pop-in surprise when the first NPC is met.
  relationships: {
    id: "relationships",
    label: "Relationships",
    hotkey: "r",
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    closable: true,
    dataGated: false,
  },
  // Story 77-5 / ADR-137: player-facing quest spine (quest_log + quest_anchors
  // + active_stakes). Always present from session start — renders an empty
  // state ("No objective yet") until a QUESTS snapshot arrives. dataGated:false
  // mirrors the 2026-06-04 relationships override (stable tab over a pop-in);
  // the spine is creation-seeded so it is non-empty almost immediately. Hotkey
  // 'q' — free (verified against buildHotkeyMap).
  quests: {
    id: "quests",
    label: "Quests",
    hotkey: "q",
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    closable: true,
    dataGated: false,
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
  // Story 85-3 (Tier B): confrontation mode. dataGated → GameBoard adds the
  // panel and auto-focuses it when confrontationData arrives, and removes it on
  // resolution (claims the canvas only while active). closable so a player can
  // dismiss the focus. NO hotkey — it auto-focuses on data, it isn't a manual
  // toggle. Wide default: it's the drama peak (Cost Scales with Drama).
  confrontation: {
    id: "confrontation",
    label: "Confrontation",
    minW: 4,
    minH: 4,
    defaultW: 6,
    defaultH: 7,
    closable: true,
    dataGated: true,
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
