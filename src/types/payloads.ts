/**
 * Typed payload interfaces for each GameMessage type.
 *
 * These replace the loose `Record<string, unknown>` payload with
 * discriminated union members, eliminating manual `as` casts across
 * App.tsx, narrativeSegments.ts, useStateMirror.ts, useAudioCue.ts,
 * useGenreTheme.ts, and ImageBusProvider.tsx.
 *
 * Mirrors sidequest-protocol (Rust) payload structs.
 */

import { MessageType } from "./protocol";

// ---------------------------------------------------------------------------
// Shared sub-types (re-exported from here as canonical location)
// ---------------------------------------------------------------------------

export interface FootnoteData {
  marker?: number;
  fact_id?: string;
  summary: string;
  category?: string;
  is_new?: boolean;
}

/** A durable per-scene chargen answer carried on the character sheet (story
 *  93-2). The History section (story 93-3) renders one row per entry: the
 *  prompt the player saw and the answer they gave. For `choice` kinds `value`
 *  holds the chosen option LABEL; for `freeform` it holds the player's verbatim
 *  text — the UI renders `value` either way. `archetype_inferred` marks scenes
 *  whose freeform fed the 93-1 archetype inference (server defaults it false).
 *  Mirrors sidequest-server protocol `CreationAnswer`. */
export interface CreationAnswer {
  scene_id: string;
  prompt: string;
  kind: "choice" | "freeform";
  value: string;
  archetype_inferred?: boolean;
}

/** A creation-seed lore fragment linked to a character's History (story
 *  93-4). Surfaced by the server on `members[].sheet.lore_fragments` — the
 *  character's own chosen chargen options, projected from the ADR-048 lore
 *  store. The History section renders these as a "Lore" subsection beneath
 *  the origin block. `lore_route` links the title to a lore page when one
 *  exists; when null the title renders as plain text (never a fabricated
 *  href). Mirrors sidequest-server protocol `LinkedLoreFragment`. */
export interface LinkedLoreFragment {
  fragment_id: string;
  title: string;
  summary: string;
  source: string;
  lore_route?: string | null;
}

export type ActionRevealStatus = "composing" | "submitted" | "cleared";

export interface ActionRevealEntry {
  player_id: string;
  character_name: string;
  status: ActionRevealStatus;
  action: string;
  aside: boolean;
  seq: number;
  round: number;
}

export interface TurnStatusEntry {
  player_id: string;
  character_name: string;
  status: "pending" | "submitted" | "auto_resolved";
  /**
   * The player's sealed action text, carried on the authoritative roster for
   * submitted/auto_resolved players (server sources it from its pending_actions
   * buffer). ADR-036: peer action text is visible during WAIT. This is the
   * recovery channel — when the best-effort ACTION_REVEAL frame is missed
   * (e.g. a submitted-only fast-typist turn), the WAIT strip recovers the text
   * from here rather than depending solely on the best-effort frame. Absent on
   * the wire for pending players (ProtocolBase drops empty defaults).
   */
  action?: string;
}

export interface StateDelta {
  location?: string;
  quests?: Record<string, string>;
  characters?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface PartyMemberPayload {
  player_id: string;
  name: string;
  /** Authenticated player identity (email / dev host) distinct from the
   *  display-name handle. Server emits this on PARTY_STATUS members when
   *  an authenticated session is active. Undefined for disconnected peers
   *  or when the server has not yet resolved identity. Story 67-6. */
  player_identity?: string;
  character_name?: string;
  current_hp: number;
  max_hp: number;
  statuses?: string[];
  class: string;
  level: number;
  portrait_url?: string;
  current_location?: string;
  sheet?: Record<string, unknown>;
  inventory?: Record<string, unknown>;
  /** URL to the reference page anchor for the character's class; null when no anchor exists. */
  class_reference_url?: string | null;
}

/** A resource-pool threshold as projected onto the PARTY_STATUS wire by the
 *  server (sidequest/protocol/messages.py ResourceThresholdPayload). Field
 *  names match the UI's GenericResourceBar.ResourceThreshold so the wire shape
 *  drops straight into the component with no remap. */
export interface ResourceThresholdPayload {
  value: number;
  label: string;
  direction: "low" | "high";
}

/** A genre/world resource pool as projected onto PARTY_STATUS
 *  (sidequest/protocol/messages.py ResourcePoolPayload). The server renames the
 *  engine's `current` to `value` so this matches what CharacterPanel reads
 *  (pool.value / pool.max / pool.thresholds) — no lossy client-side cast. */
export interface ResourcePoolPayload {
  name: string;
  label?: string;
  value: number;
  min: number;
  max: number;
  voluntary: boolean;
  /** Optional on the wire: ProtocolBase omits this field when the pool's
   *  thresholds list is empty (matches its default — Rust `is_empty` parity).
   *  Consumers must treat an absent list as "no thresholds". */
  thresholds?: ResourceThresholdPayload[];
}

export interface RolledStat {
  name: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Per-message-type payload interfaces
// ---------------------------------------------------------------------------

/** Spinner indicator — no fields, presence is the signal. */
export type ThinkingPayload = Record<string, never>;

export interface NarrationPayload {
  text: string;
  state_delta?: StateDelta;
  footnotes?: FootnoteData[];
}

export interface NarrationEndPayload {
  state_delta?: StateDelta;
}

export interface SessionEventPayload {
  event: string;
  player_name?: string;
  text?: string;
  genre?: string;
  world?: string;
  has_character?: boolean;
  initial_state?: Record<string, unknown>;
  narrator_verbosity?: string;
  narrator_vocabulary?: string;
  image_cooldown_seconds?: number;
  css?: string;
}

/** Mechanical deltas of one stock option (103-2) — rendered pre-confirmation. */
export interface StockDeltasPayload {
  attr_mods?: Record<string, number>;
  move?: number | null;
  ac?: number | null;
  trauma_target_mod?: number;
  /** Granted mutation DISPLAY NAMES (never catalog ids). */
  granted_mutations?: string[];
}

/** One stock on the chargen stock step (input_type "stock", 103-2). */
export interface StockOptionPayload {
  id: string;
  label: string;
  description?: string;
  deltas: StockDeltasPayload;
}

export interface CharacterCreationPayload {
  phase: string;
  scene_index?: number;
  total_scenes?: number;
  prompt?: string;
  summary?: string;
  message?: string;
  choices?: string[];
  allows_freeform?: boolean;
  input_type?: string;
  loading_text?: string;
  character_preview?: Record<string, unknown>;
  rolled_stats?: RolledStat[];
  choice?: string;
  character?: Record<string, unknown>;
  /** Stock step (103-2): present only when input_type is "stock". */
  stock_options?: StockOptionPayload[];
  /** Roll the Bones (103-3): rerolls left; present when input_type is "roll_the_bones". */
  reroll_budget_remaining?: number;
  /** Portrait picker step (66): whether this world ships any available portraits. */
  portraits_available?: boolean;
  /** Portrait picker step (66): in-progress build archetype, for UI soft-suggest. Server sends explicit null when no hint accumulated. */
  suggest_archetype?: string | null;
  /** Portrait picker step (66): in-progress build culture hint, for UI soft-suggest. Server sends explicit null when no hint accumulated. */
  suggest_culture?: string | null;
  /** Portrait picker step (66): selected portrait ref (client → server on portrait_confirm). */
  selected_portrait_ref?: string | null;
  /** Ability-score names in declaration order, for the arrange panel's slots.
   * Flavor-named packs (e.g. elemental_harmony) send non-STR/DEX names here.
   * The server's arrange render normally ALWAYS sends this with the pack's
   * authoritative names (standard STR/DEX/CON/INT/WIS/CHA or flavor names) — it
   * is the source of truth for slot labels. Optional in the type only because a
   * payload may omit it (older servers / non-arrange phases); the server never
   * sends explicit null. When absent, CharacterCreation.tsx falls back to the
   * standard STR/DEX/CON/INT/WIS/CHA list as a safety net, not the expected path. */
  ability_names?: string[];
  // --- Fate chargen steps (story 121-8, ADR-144 F4a3) ---
  // The UI mirrors these; the server (validate_fate_sheet) stays the authority.
  /** fate_aspects: editable aspect slots (HC + Trouble + N free). */
  fate_aspect_slots?: FateAspectSlotPayload[];
  /** fate_skill_pyramid: the pack skills the player may place. */
  fate_available_skills?: string[];
  /** fate_skill_pyramid: rung counts (apex-narrowest, e.g. [1,2,3,4]). */
  fate_pyramid?: number[];
  /** fate_skill_pyramid: the top ladder rating (e.g. 4 = Great). */
  fate_apex_rating?: number;
  /** fate_skill_pyramid: in-progress {skill: rating} allocation (also client → server submit). */
  fate_current_allocation?: Record<string, number>;
  /** fate_skill_pyramid: ladder rating → adjective (4→Great … 1→Average).
   *  JSON object keys are strings, so the runtime shape is Record<string,string>. */
  fate_ladder_labels?: Record<string, string>;
  /** fate_stunts: the pack stunt catalog. */
  fate_available_stunts?: FateStuntOptionPayload[];
  /** fate_stunts: selected stunt names (render echo AND client → server submit). */
  fate_selected_stunts?: string[];
  /** fate_stunts: stunts free before refresh is debited. */
  fate_free_stunts?: number;
  /** fate_stunts: the pack starting refresh before any debit. */
  fate_base_refresh?: number;
  /** fate_stunts: refresh remaining for the current selection (the readout). */
  fate_current_refresh?: number;
  /** Live-legality mirror for the current step (pyramid/stunts). */
  fate_legal?: boolean;
  /** Human-readable violations for the current step (mirror; server re-validates). */
  fate_violations?: string[];
  /** client → server (fate_aspects_confirm). */
  fate_high_concept?: string;
  /** client → server (fate_aspects_confirm). */
  fate_trouble?: string;
  /** client → server (fate_aspects_confirm). */
  fate_free_aspects?: string[];
  /** client → server (fate_pyramid_confirm): submitted {skill: rating}. */
  fate_allocation?: Record<string, number>;
}

/** One editable aspect slot on the Fate aspects step (121-8). */
export interface FateAspectSlotPayload {
  kind: string;
  label: string;
  value?: string;
  required?: boolean;
  suggestion?: string;
}

/** One stunt in the catalog on the Fate stunts step (121-8). */
export interface FateStuntOptionPayload {
  name: string;
  description?: string;
}

export interface TurnStatusPayload {
  player_name?: string;
  status?: string;
  player_id?: string;
  state_delta?: StateDelta;
  entries?: Array<{
    player_id: string;
    character_name?: string;
    player_name?: string;
    status: string;
  }>;
}

export interface CompanionMemberPayload {
  name: string;
  role?: string;
  description?: string;
  notes?: string;
  recruited_turn?: number;
  recruited_by?: string;
}

export interface PartyStatusPayload {
  members: PartyMemberPayload[];
  resources?: Record<string, ResourcePoolPayload>;
  companions?: CompanionMemberPayload[];
}

export interface PlayerActionPayload {
  action: string;
  aside?: boolean;
  /** Round (ADR-051) the action was submitted in. Anchors the peer-action
   * transcript by exact round instead of arrival position (Story 71-10).
   * REQUIRED by the server's GameMessage schema (ge=0) — a missing round
   * fails loud and tears down the socket; the UI threads it on every submit. */
  round: number;
}

export interface MapUpdatePayload {
  current_location: string;
  region?: string;
  explored?: string[];
  fog_bounds?: Record<string, unknown>;
  cartography?: Record<string, unknown>;
}

export interface ConfrontationPayload {
  active: boolean;
  encounter_type?: string;
  title?: string;
  actors?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ErrorPayload {
  message: string;
  reconnect_required?: boolean;
  /**
   * Optional machine-readable error code so the UI can branch without
   * keyword-matching the human message. Known codes:
   *  - `save_schema_invalid` — saved snapshot does not match the current
   *    schema (legacy single-metric encounter under dual-dial migration,
   *    etc.). The UI should NOT auto-reconnect; show a fatal error panel
   *    with escape actions.
   *  - `server_error` — unexpected exception during message handling
   *    (caught at the WebSocket boundary as a safety net).
   */
  code?: string;
}

export interface ImagePayload {
  url: string;
  alt?: string;
  description?: string;
  caption?: string;
  render_id?: string;
  tier?: string;
  width?: number;
  height?: number;
  handout?: boolean;
}

export interface AudioCuePayload {
  mood?: string;
  music_track?: string;
  sfx_triggers?: string[];
  action?: string;
  music_volume?: number;
  sfx_volume?: number;
  crossfade_ms?: number;
}

export interface RenderQueuedPayload {
  render_id: string;
}

export interface ChapterMarkerPayload {
  location: string;
}

// Wire shape: server emits one ACTION_REVEAL message per entry, not a batch.
// The previous batch-of-entries shape was an unwired stub; collapsed to a
// single-entry alias so the message matches what the server actually sends.
export type ActionRevealPayload = ActionRevealEntry;

export interface ItemDepletedPayload {
  item_name: string;
  remaining_before: number;
}

export interface ResourceMinReachedPayload {
  resource_name: string;
  min_value: number;
}

export interface JournalRequestPayload {
  filter?: string;
}

export interface JournalResponsePayload {
  entries: Array<{
    fact_id: string;
    content: string;
    category: string;
    source: string;
    confidence: string;
    learned_turn: number;
  }>;
}

export interface ScenarioEventPayload {
  event_type: string;
  description: string;
  details?: Record<string, unknown>;
}

export interface AchievementEarnedPayload {
  achievement_id: string;
  name: string;
  description: string;
  trope_id: string;
  trigger: string;
  emoji?: string;
}

/**
 * Scrapbook entry payload — story 33-18.
 *
 * Bundles per-turn metadata (turn id, location, narration excerpt, world
 * facts, NPCs present, optional image) into one atomic message keyed by
 * `turn_id`. Emitted by the server after `NarrationEnd` so `world_facts`
 * and `npcs_present` are settled before delivery.
 *
 * `image_url`, `scene_title`, and `scene_type` arrive on an async render
 * channel — the ImageBusProvider merges them with later IMAGE messages by
 * `turn_id`. Same story for NpcRef fields: they match the Rust NpcRef and
 * are always non-blank on the wire because the server builds them from
 * `NonBlankString` fields.
 */
export interface ScrapbookEntryNpcRef {
  name: string;
  role: string;
  disposition: string;
  /**
   * World-scoped portrait URL (Story 65-6), present when the invoked NPC
   * matches a portrait_manifest entry for the current world. `undefined`/`null`
   * for ad-hoc NPCs with no authored portrait — the UI guards on presence.
   */
  portrait_url?: string | null;
}

export interface ScrapbookEntryPayload {
  turn_id: number;
  scene_title?: string;
  scene_type?: string;
  location: string;
  image_url?: string;
  narrative_excerpt: string;
  world_facts?: string[];
  npcs_present?: ScrapbookEntryNpcRef[];
}

// ---------------------------------------------------------------------------
// Dice types (story 34-2, mirroring sidequest-protocol wire types)
// ---------------------------------------------------------------------------

/** One group of dice in a pool — e.g., `{ sides: 20, count: 1 }` for a d20. */
export interface DieSpec {
  /** Die face count (4, 6, 8, 10, 12, 20, 100). 0 = Unknown. */
  sides: number;
  /** How many dice of this type to throw (1-255). */
  count: number;
}

/** Throw gesture parameters — controls animation, NOT outcome (ADR-074). */
export interface DiceThrowParams {
  /** Initial linear velocity `[x, y, z]`. */
  velocity: [number, number, number];
  /** Initial angular velocity `[x, y, z]`. */
  angular: [number, number, number];
  /** Release point, normalized `[x, y]` in `[0.0, 1.0]`. */
  position: [number, number];
}

/** Outcome classification — feeds narrator tone. Server has 5 tiers
 * (sidequest-server/sidequest/protocol/dice.py:RollOutcome); Tie was missing
 * here, which let UI switches fall through to the default Fail branch. */
export type RollOutcome = "CritSuccess" | "Success" | "Tie" | "Fail" | "CritFail";

/** Per-group face values paired with the originating DieSpec. */
export interface DieGroupResult {
  spec: DieSpec;
  faces: number[];
}

/** Server -> all clients: request a dice roll during the reveal phase. */
/**
 * Which roll in a multi-roll beat turn a dice frame is.
 * - `check` (default): the PRIMARY beat/skill roll the player committed —
 *   its value+tier are authoritative and own the d20 overlay.
 * - `damage`: the strike's follow-on weapon-damage roll (ADR-114 §2). It shares
 *   the rolling player's id, so without this tag the dice-guard rendered it as
 *   the primary roll (2d6 total on the d20 with a bogus "need 2" banner —
 *   playtest 2026-06-10). The overlay must keep the check roll and not let a
 *   damage frame replace it.
 */
export type DiceRollRole = "check" | "damage";

export interface DiceRequestPayload {
  request_id: string;
  rolling_player_id: string;
  character_name: string;
  dice: DieSpec[];
  modifier: number;
  stat: string;
  difficulty: number;
  context: string;
  /** Defaults to `check` when absent (older server frames). */
  roll_role?: DiceRollRole;
}

/** Client -> server: rolling player submits throw after local physics settles.
 *
 * Physics-is-the-roll (story 34-12): the client runs Rapier locally to visual
 * completion, reads the settled face for each die, and submits the face
 * values alongside the throw parameters. The server uses `face` as the
 * authoritative roll result (no server RNG) and echoes `throw_params` so
 * spectators can replay deterministically.
 *
 * `face` is one entry per physical die in the pool, flat order matching the
 * `DieSpec` iteration in the triggering `DiceRequest`.
 */
export interface DiceThrowPayload {
  request_id: string;
  throw_params: DiceThrowParams;
  face: number[];
  /** Beat ID from confrontation — when present, server applies beat + narrates in one tick. */
  beat_id?: string;
  /**
   * Freeform text the player typed into the InputBar at the moment they
   * clicked a beat tile (D2 confrontation panel, 2026-05-13). Beats are an
   * alternate submit verb for whatever's in the InputBar — "I swing from
   * the chandelier" + click Attack carries the chandelier swing as the
   * player's stated action. Server prepends it to the narrator's
   * ``replay_action_text`` so the chandelier reaches the prose. Empty /
   * whitespace-only values are equivalent to omitting the field.
   */
  player_action?: string;
  /**
   * Story 102-2: the prepared spell chosen in the overlay's "Work a Spell"
   * picker. Only present on a WN-family `cast_spell` beat commit — it lets
   * the server route the WN cast spine (`wwn.spell.cast` + cast-economy
   * spend) instead of resolving a generic stat throw. The key is OMITTED
   * (never `undefined`-serialized) on every non-cast beat, keeping the
   * pre-102-2 wire shape byte-for-byte.
   */
  spell_id?: string;
}

/** Server -> all clients: resolved dice roll outcome. */
export interface DiceResultPayload {
  request_id: string;
  rolling_player_id: string;
  character_name: string;
  rolls: DieGroupResult[];
  modifier: number;
  total: number;
  difficulty: number;
  outcome: RollOutcome;
  seed: number;
  throw_params: DiceThrowParams;
  /** See DiceRequestPayload.roll_role. Defaults to `check` when absent. */
  roll_role?: DiceRollRole;
}

/** Server -> all clients: one resolved 4dF roll (ADR-144 F3c, Story 118-3).
 *
 * The player-facing Fate roll surface — the four Fudge faces, the ladder
 * rating (value + adjective), the shift total, the outcome tier, and a
 * succeed-with-style flag. A momentary EVENT, like DiceResult. */
export interface FateRollPayload {
  /** The four raw Fudge faces, each -1 / 0 / +1. */
  dice: number[];
  roll_total: number;
  ladder_total: number;
  /** The Fate ladder adjective for `ladder_total` (e.g. "Great"). */
  ladder_name: string;
  opposition: number;
  shifts: number;
  /** One of Fail / Tie / Succeed / SucceedWithStyle. */
  tier: string;
  succeeded_with_style: boolean;
  /** Drag-and-flick gesture for the 3D dice animation (animation only, not
   * outcome). Mirrors DiceResultPayload — Story 125-4 / ADR-144 F3g. */
  throw_params: DiceThrowParams;
  /** Deterministic physics seed so every seat replays the same tumble. */
  seed: number;
}

/**
 * Client → server: a player's PROACTIVE Fate roll (ADR-148 / Story 126-7).
 *
 * Physics-is-the-roll, the Fate analog of DiceThrowPayload: the four settled dF
 * faces ARE the roll. The server resolves the action from `face` and never rolls
 * 4dF on the player path; `throw_params` is the thrower's gesture, echoed on the
 * broadcast FATE_ROLL so every seat replays the same tumble. `action` is a ROLL
 * verb only — the non-roll verbs (concede / compel_*) stay on FATE_ACTION.
 */
export interface FateThrowPayload {
  request_id: string;
  // ADR-148/149 / Story 126-8: "defend" answers a FATE_DEFEND_REQUEST — the
  // defender's settled faces ARE the roll (never roll_4df), exactly like the
  // proactive verbs. The non-roll verbs (concede / compel_*) stay on FATE_ACTION.
  action: "overcome" | "create_advantage" | "attack" | "defend";
  skill?: string;
  target?: string | null;
  difficulty?: number;
  invoke_aspect?: string;
  invoke_mode?: "bonus" | "reroll";
  aspect_text?: string;
  player_action?: string;
  // Story 126-14: a defend throw may CONCEDE instead of rolling — the defender
  // folds against this attack and throws no dice, so `face` is omitted on that
  // path only. Meaningful solely for action='defend' (server validates).
  concede?: boolean;
  throw_params: DiceThrowParams;
  /** Exactly 4 settled dF faces, each -1 / 0 / +1. Omitted ONLY on a concede
   *  (Story 126-14) — a concession folds without rolling. */
  face?: number[];
  // Story 125-5: index signature so a FateThrowMessage is assignable to the
  // GameMessage union (payload: Record<string, unknown>) at App.tsx's send()
  // call — sibling sent payloads carry this; FateThrowPayload (126-7/ADR-148)
  // shipped without it and red-built develop's tsc -b.
  [key: string]: unknown;
}

/**
 * Server → client: "you are attacked by `attacker` with `attack_skill` at total
 * `attack_total` — defend" (ADR-148/149, Story 126-8 §6). Mirrors the server's
 * FateDefendRequestPayload (sidequest-server/sidequest/protocol/fate.py).
 *
 * One per incoming attack on a seated PC, broadcast when the round PARKS at the
 * DEFEND barrier. The defender is INFORMED — they see the committed attack total
 * before they throw — then answer with a FATE_THROW(action='defend') that echoes
 * `request_id`. `mental` is True for a social conflict (the defense skill / stress
 * track is mental rather than physical). The client filters by `defender`.
 */
export interface FateDefendRequestPayload {
  request_id: string;
  defender: string;
  attacker: string;
  attack_skill: string;
  attack_total: number;
  mental: boolean;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

interface BaseMessage {
  player_id: string;
}

export interface ThinkingMessage extends BaseMessage {
  type: typeof MessageType.THINKING;
  payload: ThinkingPayload;
}

export interface NarrationMessage extends BaseMessage {
  type: typeof MessageType.NARRATION;
  payload: NarrationPayload;
}

export interface NarrationEndMessage extends BaseMessage {
  type: typeof MessageType.NARRATION_END;
  payload: NarrationEndPayload;
}

export interface SessionEventMessage extends BaseMessage {
  type: typeof MessageType.SESSION_EVENT;
  payload: SessionEventPayload;
}

export interface CharacterCreationMessage extends BaseMessage {
  type: typeof MessageType.CHARACTER_CREATION;
  payload: CharacterCreationPayload;
}

export interface TurnStatusMessage extends BaseMessage {
  type: typeof MessageType.TURN_STATUS;
  payload: TurnStatusPayload;
}

export interface PartyStatusMessage extends BaseMessage {
  type: typeof MessageType.PARTY_STATUS;
  payload: PartyStatusPayload;
}

export interface PlayerActionMessage extends BaseMessage {
  type: typeof MessageType.PLAYER_ACTION;
  payload: PlayerActionPayload;
}

export interface MapUpdateMessage extends BaseMessage {
  type: typeof MessageType.MAP_UPDATE;
  payload: MapUpdatePayload;
}

export interface ConfrontationMessage extends BaseMessage {
  type: typeof MessageType.CONFRONTATION;
  payload: ConfrontationPayload;
}

export interface ErrorMessage extends BaseMessage {
  type: typeof MessageType.ERROR;
  payload: ErrorPayload;
}

export interface ImageMessage extends BaseMessage {
  type: typeof MessageType.IMAGE;
  payload: ImagePayload;
}

export interface AudioCueMessage extends BaseMessage {
  type: typeof MessageType.AUDIO_CUE;
  payload: AudioCuePayload;
}

export interface RenderQueuedMessage extends BaseMessage {
  type: typeof MessageType.RENDER_QUEUED;
  payload: RenderQueuedPayload;
}

export interface ChapterMarkerMessage extends BaseMessage {
  type: typeof MessageType.CHAPTER_MARKER;
  payload: ChapterMarkerPayload;
}

export interface ActionRevealMessage extends BaseMessage {
  type: typeof MessageType.ACTION_REVEAL;
  payload: ActionRevealPayload;
}

export interface ItemDepletedMessage extends BaseMessage {
  type: typeof MessageType.ITEM_DEPLETED;
  payload: ItemDepletedPayload;
}

export interface ResourceMinReachedMessage extends BaseMessage {
  type: typeof MessageType.RESOURCE_MIN_REACHED;
  payload: ResourceMinReachedPayload;
}

export interface JournalResponseMessage extends BaseMessage {
  type: typeof MessageType.JOURNAL_RESPONSE;
  payload: JournalResponsePayload;
}

export interface DiceRequestMessage extends BaseMessage {
  type: typeof MessageType.DICE_REQUEST;
  payload: DiceRequestPayload;
}

export interface DiceThrowMessage extends BaseMessage {
  type: typeof MessageType.DICE_THROW;
  payload: DiceThrowPayload;
}

export interface DiceResultMessage extends BaseMessage {
  type: typeof MessageType.DICE_RESULT;
  payload: DiceResultPayload;
}

/** Client → server: a player's proactive Fate roll (ADR-148 / Story 126-7). */
export interface FateThrowMessage extends BaseMessage {
  type: typeof MessageType.FATE_THROW;
  payload: FateThrowPayload;
}

/** Server → client: the DEFEND barrier (ADR-148/149 / Story 126-8/126-17). */
export interface FateDefendRequestMessage extends BaseMessage {
  type: typeof MessageType.FATE_DEFEND_REQUEST;
  payload: FateDefendRequestPayload;
}

export interface FateRollMessage extends BaseMessage {
  type: typeof MessageType.FATE_ROLL;
  payload: FateRollPayload;
}

export interface ScrapbookEntryMessage extends BaseMessage {
  type: typeof MessageType.SCRAPBOOK_ENTRY;
  payload: ScrapbookEntryPayload;
}

export interface RelationshipsMessage extends BaseMessage {
  type: typeof MessageType.RELATIONSHIPS;
  payload: RelationshipsPayload;
}

export interface CharacterIncapacitatedMessage extends BaseMessage {
  type: typeof MessageType.CHARACTER_INCAPACITATED;
  payload: CharacterIncapacitatedPayload;
}

export interface FateStateMessage extends BaseMessage {
  type: typeof MessageType.FATE_STATE;
  payload: FateStatePayload;
}

export type TypedGameMessage =
  | ThinkingMessage
  | NarrationMessage
  | NarrationEndMessage
  | SessionEventMessage
  | CharacterCreationMessage
  | TurnStatusMessage
  | PartyStatusMessage
  | PlayerActionMessage
  | MapUpdateMessage
  | ConfrontationMessage
  | ErrorMessage
  | ImageMessage
  | AudioCueMessage
  | RenderQueuedMessage
  | ChapterMarkerMessage
  | ActionRevealMessage
  | ItemDepletedMessage
  | ResourceMinReachedMessage
  | JournalResponseMessage
  | DiceRequestMessage
  | DiceThrowMessage
  | DiceResultMessage
  | FateRollMessage
  | ScrapbookEntryMessage
  | RelationshipsMessage
  | CharacterIncapacitatedMessage
  | FateStateMessage
  | FateDefendRequestMessage;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isNarration(msg: TypedGameMessage): msg is NarrationMessage {
  return msg.type === MessageType.NARRATION;
}

export function isNarrationEnd(msg: TypedGameMessage): msg is NarrationEndMessage {
  return msg.type === MessageType.NARRATION_END;
}

export function isSessionEvent(msg: TypedGameMessage): msg is SessionEventMessage {
  return msg.type === MessageType.SESSION_EVENT;
}

export function isCharacterCreation(msg: TypedGameMessage): msg is CharacterCreationMessage {
  return msg.type === MessageType.CHARACTER_CREATION;
}

export function isTurnStatus(msg: TypedGameMessage): msg is TurnStatusMessage {
  return msg.type === MessageType.TURN_STATUS;
}

export function isPartyStatus(msg: TypedGameMessage): msg is PartyStatusMessage {
  return msg.type === MessageType.PARTY_STATUS;
}

export function isPlayerAction(msg: TypedGameMessage): msg is PlayerActionMessage {
  return msg.type === MessageType.PLAYER_ACTION;
}

export function isMapUpdate(msg: TypedGameMessage): msg is MapUpdateMessage {
  return msg.type === MessageType.MAP_UPDATE;
}

export function isConfrontation(msg: TypedGameMessage): msg is ConfrontationMessage {
  return msg.type === MessageType.CONFRONTATION;
}

export function isError(msg: TypedGameMessage): msg is ErrorMessage {
  return msg.type === MessageType.ERROR;
}

export function isImage(msg: TypedGameMessage): msg is ImageMessage {
  return msg.type === MessageType.IMAGE;
}

export function isAudioCue(msg: TypedGameMessage): msg is AudioCueMessage {
  return msg.type === MessageType.AUDIO_CUE;
}

export function isChapterMarker(msg: TypedGameMessage): msg is ChapterMarkerMessage {
  return msg.type === MessageType.CHAPTER_MARKER;
}

export function isActionReveal(msg: TypedGameMessage): msg is ActionRevealMessage {
  return msg.type === MessageType.ACTION_REVEAL;
}

export function isItemDepleted(msg: TypedGameMessage): msg is ItemDepletedMessage {
  return msg.type === MessageType.ITEM_DEPLETED;
}

export function isResourceMinReached(msg: TypedGameMessage): msg is ResourceMinReachedMessage {
  return msg.type === MessageType.RESOURCE_MIN_REACHED;
}

export function isJournalResponse(msg: TypedGameMessage): msg is JournalResponseMessage {
  return msg.type === MessageType.JOURNAL_RESPONSE;
}

export function isDiceRequest(msg: TypedGameMessage): msg is DiceRequestMessage {
  return msg.type === MessageType.DICE_REQUEST;
}

export function isDiceThrow(msg: TypedGameMessage): msg is DiceThrowMessage {
  return msg.type === MessageType.DICE_THROW;
}

export function isDiceResult(msg: TypedGameMessage): msg is DiceResultMessage {
  return msg.type === MessageType.DICE_RESULT;
}

export function isFateRoll(msg: TypedGameMessage): msg is FateRollMessage {
  return msg.type === MessageType.FATE_ROLL;
}

export function isScrapbookEntry(msg: TypedGameMessage): msg is ScrapbookEntryMessage {
  return msg.type === MessageType.SCRAPBOOK_ENTRY;
}

// ---------------------------------------------------------------------------
// Encounter event types (GM panel — Task 22)
// REST source: GET /api/sessions/{slug}/encounter_events
// ---------------------------------------------------------------------------

export type EncounterEventKind =
  | "ENCOUNTER_STARTED"
  | "ENCOUNTER_BEAT_APPLIED"
  | "ENCOUNTER_METRIC_ADVANCE"
  | "ENCOUNTER_BEAT_SKIPPED"
  | "ENCOUNTER_TAG_CREATED"
  | "ENCOUNTER_STATUS_ADDED"
  | "ENCOUNTER_YIELD"
  | "ENCOUNTER_RESOLVED"
  | "ENCOUNTER_RESOLUTION_SIGNAL";

export interface EncounterEvent {
  seq: number;
  kind: EncounterEventKind;
  payload: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Validation helpers (moved from useStateMirror)
// ---------------------------------------------------------------------------

export type FactCategory = "Lore" | "Place" | "Person" | "Quest" | "Ability" | "Event";
export type FactSource = "narrator" | "game_event" | "player";
export type Confidence = "certain" | "inferred" | "rumor";

const VALID_CATEGORIES: FactCategory[] = ["Lore", "Place", "Person", "Quest", "Ability", "Event"];
const VALID_SOURCES: FactSource[] = ["narrator", "game_event", "player"];
const VALID_CONFIDENCES: Confidence[] = ["certain", "inferred", "rumor"];

export function validateCategory(raw: string | undefined): FactCategory {
  if (raw && VALID_CATEGORIES.includes(raw as FactCategory)) return raw as FactCategory;
  if (raw) console.warn(`Unknown FactCategory: "${raw}", falling back to "Lore"`);
  return "Lore";
}

export function validateSource(raw: string | undefined): FactSource {
  if (raw && VALID_SOURCES.includes(raw as FactSource)) return raw as FactSource;
  if (raw) console.warn(`Unknown FactSource: "${raw}", falling back to "narrator"`);
  return "narrator";
}

export function validateConfidence(raw: string | undefined): Confidence {
  if (raw && VALID_CONFIDENCES.includes(raw as Confidence)) return raw as Confidence;
  if (raw) console.warn(`Unknown Confidence: "${raw}", falling back to "certain"`);
  return "certain";
}

// ---------------------------------------------------------------------------
// Story 54-2 / ADR-109: persistent location description + manifest.
// The Location tab consumer lands in Story 54-9. These types mirror the
// pydantic shape on the wire (sidequest/protocol/models.py).
// ---------------------------------------------------------------------------

export type LocationEntityTier = "real_object" | "yes_and" | "flavor_only";

export type LocationEntityBindingKind =
  | "location_feature"
  | "npc"
  | "item"
  | "clue"
  | "scenario_clue";

export type LocationEntityProvenance =
  | "authored"
  | "cookbook"
  | "yes_and_promoted"
  | "yes_and_minted";

export interface LocationEntityBinding {
  kind: LocationEntityBindingKind;
  ref: string;
}

export interface LocationEntity {
  id: string;
  label: string;
  tier: LocationEntityTier;
  binding: LocationEntityBinding | null;
  affordances: string[];
  provenance: LocationEntityProvenance;
  promoted_at_turn: number | null;
  promoted_canon: string | null;
  /** URL to the reference page anchor; null when no anchor exists. */
  reference_url?: string | null;
}

export interface LocationDescriptionOverlaySummary {
  encounter_id: string;
  prose_suffix: string;
  entity_delta_count: number;
}

export interface LocationDescriptionPayload {
  region_id: string;
  /** Authored human-readable region/room name for the header (e.g. "The
   * Munchkin Country"). null/absent on old snapshots or sources with no
   * authored name — the panel then falls back to rendering region_id.
   * region_id stays the snake_case key used for the lore deep-link. */
  region_name?: string | null;
  prose: string;
  terrain: string | null;
  entities: LocationEntity[];
  overlays: LocationDescriptionOverlaySummary[];
  /** Story 63-6: deep-link from the region header into the /reference/lore
   * wiki; null/absent when the region has no lore-page anchor. */
  reference_url?: string | null;
  /** POI landscape image URL for the region (built server-side from region_id
   * verbatim). The panel renders it above the prose and hides it on a load
   * error, so a region with no rendered landscape degrades to text-only. */
  poi_image_url?: string | null;
}

// ADR-136: NPC relationship roster snapshot. Field names mirror the server
// pydantic models (DispositionBeatPayload / RelationshipClaimPayload /
// RelationshipEntry / RelationshipsPayload) on the snake_case wire.
export interface DispositionBeatPayload {
  turn: number;
  delta: number;
  reason: string;
  location: string | null;
}

export interface RelationshipClaimPayload {
  text: string;
  credibility_hint: string;
}

export interface RelationshipEntryPayload {
  name: string;
  portrait_url: string | null;
  band: string;
  disposition: number;
  trend: string;
  last_seen_turn: number;
  last_seen_location: string | null;
  beats: DispositionBeatPayload[];
  personality_read: string | null;
  ocean: Record<string, number> | null;
  claims: RelationshipClaimPayload[];
}

export interface RelationshipsPayload {
  entries: RelationshipEntryPayload[];
}

// sq-playtest 2026-06-07 (barsoom-3, blocking): a PC the genre lethality policy
// ruled dead kept full agency with no death surface. Field names mirror the
// server pydantic model (CharacterIncapacitatedPayload in
// sidequest-server/sidequest/protocol/messages.py) on the snake_case wire.
export interface CharacterIncapacitatedPayload {
  character_name: string;
  verdict: string;
  status_text: string;
  headline: string;
  can_reroll: boolean;
}

// Story 77-5 / ADR-137: player-facing quest spine snapshot. Field names mirror
// the server pydantic models (QuestLogEntry / QuestAnchorEntry / QuestsPayload
// in sidequest-server/sidequest/protocol/models.py) on the snake_case wire.
// The rich shape (log + anchors + stakes) is the source of truth — distinct
// from the legacy StateDelta.quests Record<string,string>, which is never read.
// Story 117-7: one discovered lore fragment cohered under its quest. Mirrors
// the server pydantic model QuestLoreEntry (sidequest-server/sidequest/protocol/
// models.py, `extra: forbid`): `fact_id` is the dedup key against the broader
// KnownFacts surface; `content` is the player-facing readable fragment.
export interface QuestLoreEntry {
  fact_id: string;
  content: string;
}

export interface QuestLogEntry {
  quest_id: string;
  title: string;
  objective: string;
  status: string;
  anchor_id: string | null;
  // Story 117-5/117-7: the "what I've learned about this job" projection —
  // ScenarioClue facts the party has learned about this quest's anchor. Always
  // present on the wire (server `Field(default_factory=list)`, never None);
  // empty when nothing is learned.
  related_lore: QuestLoreEntry[];
}

export interface QuestAnchorEntry {
  anchor_id: string;
  quest_id: string | null;
  resolution: string | null;
}

export interface QuestsPayload {
  quest_log: QuestLogEntry[];
  quest_anchors: QuestAnchorEntry[];
  active_stakes: string;
}

// Story 54-7 / ADR-109: delta-channel payload for encounter location
// overlay state changes. The overlays array carries the FULL
// post-transition overlay set — UI replaces its overlay slice rather
// than reconciling enter/leave events. UI consumer ships in 54-9.
export interface LocationOverlayChangedPayload {
  region_id: string;
  overlays: LocationDescriptionOverlaySummary[];
}

// ---------------------------------------------------------------------------
// Story 118-1/118-2 / ADR-144 F3: player-facing Fate spine snapshot. Field
// names mirror the server pydantic models (sidequest-server/sidequest/protocol/
// models.py, all `extra: forbid`) on the snake_case wire, built by
// game/ruleset/fate_projection.py:build_fate_state_payload. The rich nested
// shape is the source of truth — the FateCharacterSheet renders every mechanical
// number (the Sebastien/Jade legibility mandate), so the client must not thin it.
// ---------------------------------------------------------------------------

/** One skill on the Fate ladder. `rating` is the signed value (Terrible -2 ..
 *  Legendary +8); `ladder` is its adjective (server `fate_resolution.ladder_name`)
 *  so the panel shows BOTH the math and the name. */
export interface FateSkillEntry {
  name: string;
  rating: number;
  ladder: string;
}

/** One Fate aspect. `kind` is the snake_case taxonomy (high_concept / trouble /
 *  character / situation / boost / consequence); `free_invokes` is the count of
 *  unused free invocations rendered as pips. */
export interface FateAspectEntry {
  text: string;
  kind: string;
  free_invokes: number;
}

/** One checkable stress box of a fixed `value`. */
export interface FateStressBox {
  value: number;
  checked: boolean;
}

/** One consequence slot. `filled` is true when taken (it then carries `text` as
 *  an invokable aspect); an open slot is `filled:false` with empty `text`.
 *  `value` is the SRD absorption value (mild 2 / moderate 4 / severe 6 / extreme 8). */
export interface FateConsequenceEntry {
  level: string;
  value: number;
  filled: boolean;
  text: string;
}

/** One Fate stunt: a named special rule the PC picked at chargen. Under Fate the
 *  player's special abilities ARE their stunts, so the Character/Fate panel renders
 *  these in place of the native class-move surface (playtest 150-2). `source_gear`
 *  is the GearDef id it was compiled from (null/absent for a hand-picked stunt). */
export interface FateStuntEntry {
  name: string;
  description: string;
  source_gear?: string | null;
}

/** One PC's full Fate sheet. `aspects` is named character aspects only; a filled
 *  consequence surfaces in `consequences`, not duplicated here. `stress` maps each
 *  track name (physical / mental) to its ordered boxes. `stunts` are the PC's chosen
 *  stunts (their special abilities under Fate). */
export interface FateCharacterEntry {
  name: string;
  fate_points: number;
  refresh: number;
  skills: FateSkillEntry[];
  aspects: FateAspectEntry[];
  stress: Record<string, FateStressBox[]>;
  consequences: FateConsequenceEntry[];
  // Additive (playtest 150-2): optional so pre-existing payloads/fixtures stay valid;
  // the server always populates it (default empty). The surface reads it as `?? []`.
  stunts?: FateStuntEntry[];
}

/** One participant in an active Fate conflict. `side` is the encounter actor's
 *  side (player / opponent / neutral). */
export interface FateConflictParticipant {
  name: string;
  side: string;
  // Story 126-29: True when this actor has sealed a proactive action this exchange
  // (server-authoritative, resume-safe). Optional/back-compat like `stunts?` — the
  // server always sends it (default false). The surface reads it as `?? false` to
  // gate the proactive tiles so a resumed conflict never re-offers a rejected action.
  committed?: boolean;
  // Story 126-31: an OPPONENT-side participant's projected mechanical track, so the
  // surface can draw the opponent stress track + the taken-out win-meter. Per ADR-143
  // the win signal is the opponent's stress+consequence fill toward taken-out, NOT the
  // vestigial native tension dial. Server-projected from the NPC `core.fate_sheet`
  // (fate_projection._project_conflict_participant); reuses the PC-sheet wire shapes.
  // A player-side participant leaves both ABSENT — its full sheet already rides in
  // FateStatePayload.characters, never duplicated here. Optional/back-compat like
  // `committed?`; the surface reads them as `?? {}` / `?? []`.
  stress?: Record<string, FateStressBox[]>;
  consequences?: FateConsequenceEntry[];
}

/** A narrator-offered compel awaiting the player's accept/refuse (ADR-144 F3e).
 *  `aspect` is the compelled aspect, `target` the compelled PC, `reason` the
 *  proposed complication the player reads before deciding. `offered_delta` is the
 *  SRD accept reward (+1) the server sends so the Accept control renders a real
 *  delta, not a hardcoded literal. The refuse cost (−1) is the separate SRD-fixed
 *  constant the client renders directly (it has no field — the cost is never
 *  variable). */
export interface FatePendingCompel {
  aspect: string;
  target: string;
  reason: string;
  offered_delta: number;
}

/** The active Fate conflict's participants by side, in seating order.
 *  `pending_compels` (ADR-144 F3e) are the narrator's offered compels awaiting
 *  accept/refuse — the player surface gates its control on this list. */
export interface FateConflictEntry {
  active: boolean;
  participants: FateConflictParticipant[];
  // Additive (ADR-144 F3e): optional so pre-F3e payloads/fixtures stay valid; the
  // server always populates it (default empty). The surface reads it as `?? []`.
  pending_compels?: FatePendingCompel[];
  // True when this is a Fate Contest (no stress/consequences) rather than a
  // Conflict (spec 2026-06-17 §2). Optional so pre-existing payloads/fixtures stay
  // valid (treated as a Conflict when absent). The surface gates its action rack on
  // it: a Contest exposes Overcome + Create Advantage (+ Concede), never Attack —
  // the server rejects an attack in a Contest loudly (fate_dispatch_error).
  is_contest?: boolean;
}

/** Full Fate-spine snapshot: per-PC sheets + scene situation aspects (incl.
 *  boosts) + the active conflict. An unpopulated payload is a clean
 *  empty-but-valid snapshot — never None. `conflict` is null when none is active. */
export interface FateStatePayload {
  characters: FateCharacterEntry[];
  scene_aspects: FateAspectEntry[];
  conflict: FateConflictEntry | null;
}
