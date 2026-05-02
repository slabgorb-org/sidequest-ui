/**
 * Client-side mirror of sidequest/server/protocol.py.
 * Kept minimal — only what the React client needs.
 */

// CHARACTER_SHEET and INVENTORY removed 2026-04 — per-character sheet
// and inventory state are now nested inside each PartyMember carried by
// PARTY_STATUS. See sidequest-protocol `PartyMember.sheet` / `.inventory`.
//
// Const-object pattern (not a TS enum): tsconfig has `erasableSyntaxOnly`,
// which forbids enums (they generate runtime code). This pattern gives us
// the same call-site ergonomics (`MessageType.PARTY_STATUS`) while staying
// erasable — the `as const` narrows values to their string literals, and
// the type alias merges with the value export so `: MessageType` works.
export const MessageType = {
  PARTY_STATUS: "PARTY_STATUS",
  MAP_UPDATE: "MAP_UPDATE",
  PLAYER_ACTION: "PLAYER_ACTION",
  NARRATION: "NARRATION",
  TURN_STATUS: "TURN_STATUS",
  CHARACTER_CREATION: "CHARACTER_CREATION",
  SESSION_EVENT: "SESSION_EVENT",
  ERROR: "ERROR",
  IMAGE: "IMAGE",
  AUDIO_CUE: "AUDIO_CUE",
  NARRATION_END: "NARRATION_END",
  ACTION_QUEUE: "ACTION_QUEUE",
  CHAPTER_MARKER: "CHAPTER_MARKER",
  THINKING: "THINKING",
  COMBAT_EVENT: "COMBAT_EVENT",
  ACTION_REVEAL: "ACTION_REVEAL",
  SCENARIO_EVENT: "SCENARIO_EVENT",
  ACHIEVEMENT_EARNED: "ACHIEVEMENT_EARNED",
  CONFRONTATION: "CONFRONTATION",
  RENDER_QUEUED: "RENDER_QUEUED",
  JOURNAL_REQUEST: "JOURNAL_REQUEST",
  JOURNAL_RESPONSE: "JOURNAL_RESPONSE",
  ITEM_DEPLETED: "ITEM_DEPLETED",
  RESOURCE_MIN_REACHED: "RESOURCE_MIN_REACHED",
  BEAT_SELECTION: "BEAT_SELECTION",
  DICE_REQUEST: "DICE_REQUEST",
  DICE_THROW: "DICE_THROW",
  DICE_RESULT: "DICE_RESULT",
  SCRAPBOOK_ENTRY: "SCRAPBOOK_ENTRY",
  // MP-02 presence + pause protocol (see sidequest-server protocol/messages.py)
  PLAYER_PRESENCE: "PLAYER_PRESENCE",
  PLAYER_SEAT: "PLAYER_SEAT",
  SEAT_CONFIRMED: "SEAT_CONFIRMED",
  GAME_PAUSED: "GAME_PAUSED",
  GAME_RESUMED: "GAME_RESUMED",
  YIELD: "YIELD",
  // Orbital chart UI (orbital-map plan Task 15b). Inbound intent carries
  // an OrbitalIntent payload; server responds with ORBITAL_CHART carrying
  // a fresh SVG.
  ORBITAL_INTENT: "ORBITAL_INTENT",
  ORBITAL_CHART: "ORBITAL_CHART",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * Loose GameMessage — kept for backward compatibility during migration.
 * Prefer TypedGameMessage from types/payloads.ts for new code.
 */
export interface GameMessage {
  type: MessageType;
  payload: Record<string, unknown>;
  player_id: string;
}

// Re-export typed payloads for convenience
export type {
  TypedGameMessage,
  FootnoteData,
  ActionRevealEntry,
  TurnStatusEntry,
  StateDelta,
  ScenarioEventPayload,
  AchievementEarnedPayload,
} from "./payloads";

/** Per-session narrator verbosity control (story 14-3). */
export type NarratorVerbosity = 'concise' | 'standard' | 'verbose';

/** Per-session narrator vocabulary/complexity control (story 14-4). */
export type NarratorVocabulary = 'accessible' | 'literary' | 'epic';
