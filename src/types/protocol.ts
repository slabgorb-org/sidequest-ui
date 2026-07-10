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
  // ADR-055 / story 164-5 (Track B, task 9): the site room-graph frame. Renamed
  // from DUNGEON_MAP in the 164-4 server cutover — the beneath_sunden-only
  // dungeon frame generalized to ANY declared site (megadungeon, tavern, vault…).
  // The server broadcasts this alongside the surface-cartography MAP_UPDATE
  // (sidequest-server .../map_emit.py `emit_fn(msg, "SITE_MAP")`); it carries the
  // discovered site room graph (explored[] with room_exits) + the owning site's
  // descriptor (site_id/site_name/archetype/extent) so the Map tab can draw the
  // site the player is inside, keyed per-scene, with a breadcrumb back out.
  SITE_MAP: "SITE_MAP",
  PLAYER_ACTION: "PLAYER_ACTION",
  NARRATION: "NARRATION",
  TURN_STATUS: "TURN_STATUS",
  CHARACTER_CREATION: "CHARACTER_CREATION",
  SESSION_EVENT: "SESSION_EVENT",
  ERROR: "ERROR",
  // Story 67-1: outbound crash signal. When a render subtree (e.g. GameBoard)
  // throws and its ErrorBoundary catches it, the boundary reports the crash
  // over the still-open socket so the server can release this player from the
  // submit-and-wait turn barrier instead of orphaning the whole table's turn.
  CLIENT_ERROR: "CLIENT_ERROR",
  IMAGE: "IMAGE",
  AUDIO_CUE: "AUDIO_CUE",
  NARRATION_END: "NARRATION_END",
  ACTION_QUEUE: "ACTION_QUEUE",
  CHAPTER_MARKER: "CHAPTER_MARKER",
  THINKING: "THINKING",
  COMBAT_EVENT: "COMBAT_EVENT",
  ACTION_REVEAL: "ACTION_REVEAL",
  // Out-of-band OOC GM answer to a player aside (ADR-107). Not a turn
  // record: it does not advance the world, tick the turn/round counter,
  // touch the narrative log, or count toward the MP barrier.
  ASIDE_ANSWER: "ASIDE_ANSWER",
  SCENARIO_EVENT: "SCENARIO_EVENT",
  ACHIEVEMENT_EARNED: "ACHIEVEMENT_EARNED",
  CONFRONTATION: "CONFRONTATION",
  // Phase 5 (Story 47-3): magic-confrontation outcome dispatch. Carries
  // the resolved branch + mandatory_outputs so the ConfrontationOverlay
  // mounts a reveal panel and the LedgerPanel updates.
  CONFRONTATION_OUTCOME: "CONFRONTATION_OUTCOME",
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
  // Cavern renderer revival (ADR-096 Task 20b). Emitted on room entry when
  // the world uses room_graph navigation and the room has a YAML file.
  // Carries TacticalGridPayload; the UI Automapper routes cavern rooms to
  // TacticalGridRenderer and settlement rooms to SettlementRoomView.
  TACTICAL_GRID: "TACTICAL_GRID",
  // Story 54-2 / ADR-109: snapshot channel for the persistent location
  // description (region/room prose + typed entity manifest). Server emits
  // on room enter and on overlay-bound changes that require a full
  // re-baseline. UI consumer in 54-9 (LocationPanel + state-mirror).
  LOCATION_DESCRIPTION: "LOCATION_DESCRIPTION",
  // Story 54-7 / ADR-109: delta channel for encounter location overlay
  // state changes. Fires when an encounter with a non-None
  // location_overlay activates or deactivates. UI consumer in 54-9.
  LOCATION_OVERLAY_CHANGED: "LOCATION_OVERLAY_CHANGED",
  // ADR-136: snapshot channel for the NPC relationship roster (per-NPC
  // disposition band/trend, beats, personality read, claims). Server emits
  // on demand for the relationship panel.
  RELATIONSHIPS: "RELATIONSHIPS",
  // Story 77-5 / ADR-137: snapshot channel for the player-facing quest spine
  // (quest_log + quest_anchors + active_stakes). The RELATIONSHIPS analog —
  // emitted reactively when the spine changes (a quest minted/updated, an
  // anchor added, stakes set), full-replace per message. UI consumer in 77-5
  // (QuestsPanel + state-mirror).
  QUESTS: "QUESTS",
  // ADR-144 F3c / Story 118-3: one resolved 4dF roll, surfaced to the player —
  // the four Fudge faces, ladder rating, shift total, outcome tier, and the
  // succeed-with-style flag. An EVENT (like DICE_RESULT), not change-gated state.
  FATE_ROLL: "FATE_ROLL",
  // sq-playtest 2026-06-07 (barsoom-3, blocking): a PC the genre lethality
  // policy ruled dead kept full agency for four rounds with no death surface.
  // Emitted at the moment of death (and again if a downed seat tries to act).
  // PC-scoped (payload.character_name); the UI locks that seat's input and
  // shows a death banner / re-roll CTA. Server-side intake gate is authority.
  CHARACTER_INCAPACITATED: "CHARACTER_INCAPACITATED",
  // Story 118-1/118-2 / ADR-144 F3: snapshot channel for the player-facing Fate
  // spine (per-PC fate points, skills on the ladder, aspects+pips, stress,
  // consequence slots, scene aspects, active conflict). The RELATIONSHIPS/QUESTS
  // analog. Server emits ONLY on a ruleset=='fate' pack (server #880), so the
  // Fate surface never co-renders with the WN/native ConfrontationOverlay.
  // Full-replace per message; UI consumer is the FateCharacterSheet rendered in
  // the Character→Stats tab (118-2; the standalone Fate dock tab was removed 126-26).
  FATE_STATE: "FATE_STATE",
  // Story 118-6 / ADR-144 F3f/F1d: OUTBOUND — the player committed a Fate action
  // from the conflict surface (a proactive tile, an invoke-bearing action, or a
  // concede). Carries the FateActionPayload (action, skill, invoke_aspect,
  // invoke_mode, aspect_text, player_action). The server's FateActionHandler is
  // the economy + validation authority (No Silent Fallbacks — the client mirrors).
  FATE_ACTION: "FATE_ACTION",
  // ADR-148 / Story 126-7: OUTBOUND — a player's PROACTIVE Fate roll verb
  // (overcome / create_advantage / attack). Physics-is-the-roll: carries the four
  // settled dF faces + the throw_params gesture (the Fate analog of DICE_THROW).
  // The server resolves from the faces and never rolls 4dF on the player path.
  // Distinct from FATE_ACTION (the non-roll verbs: concede / compel_*).
  FATE_THROW: "FATE_THROW",
  // ADR-148/149 / Story 126-8/126-17: INBOUND — the DEFEND barrier. When an NPC
  // attack seats on a PC the round PARKS and the server broadcasts one
  // FateDefendRequestPayload per incoming attack (the client filters by defender),
  // then blocks-and-waits with no auto-roll. The defender answers with a
  // FATE_THROW(action='defend') echoing the request_id — the defense is
  // physics-is-the-roll, exactly like the proactive throw. Dropping this message
  // hangs the exchange forever (the 126-17 showstopper).
  FATE_DEFEND_REQUEST: "FATE_DEFEND_REQUEST",
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

/**
 * ASIDE_ANSWER payload (ADR-107). The GM's out-of-character reply to a
 * player aside. `round` is for client ordering only — it is never a turn
 * record. `grounded_on` is the state-key audit trail (empty on a
 * refusal/decline outcome).
 */
export interface AsideAnswerPayload {
  asker_id: string;
  question: string;
  answer: string;
  grounded_on: string[];
  round: number;
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
