import { useEffect, useRef } from 'react';
import { MessageType, type GameMessage } from '../types/protocol';
import { useGameState, EMPTY_GAME_STATE, type ClientGameState, type CharacterState, type JournalEntry, type KnowledgeEntry, type FactCategory, type FactSource, type Confidence, type ItemDepletion, type ResourceAlert } from '../providers/GameStateProvider';
import type {
  FateRollPayload,
  FateStatePayload,
  FootnoteData,
  LocationDescriptionPayload,
  LocationOverlayChangedPayload,
  QuestsPayload,
  RelationshipsPayload,
} from '../types/payloads';
import type { MagicState } from '../types/magic';

const VALID_CATEGORIES: string[] = ['Lore', 'Place', 'Person', 'Quest', 'Ability'];
const VALID_SOURCES: string[] = ['Observation', 'Dialogue', 'Discovery', 'Backstory'];
const VALID_CONFIDENCES: string[] = ['Certain', 'Suspected', 'Rumored'];

function validateCategory(raw: string | undefined): FactCategory {
  if (raw && VALID_CATEGORIES.includes(raw)) return raw as FactCategory;
  if (raw) console.warn(`[useStateMirror] Unknown category "${raw}", falling back to "Lore"`);
  return 'Lore';
}

function validateSource(raw: string | undefined): FactSource {
  if (raw && VALID_SOURCES.includes(raw)) return raw as FactSource;
  if (raw) console.warn(`[useStateMirror] Unknown source "${raw}", falling back to "Observation"`);
  return 'Observation';
}

function validateConfidence(raw: string | undefined): Confidence {
  if (raw && VALID_CONFIDENCES.includes(raw)) return raw as Confidence;
  if (raw) console.warn(`[useStateMirror] Unknown confidence "${raw}", falling back to "Suspected"`);
  return 'Suspected';
}

/**
 * Applies state deltas from game messages to the GameState context.
 * Extracts state_delta from NARRATION/TURN_STATUS payloads and
 * initial_state from SESSION_EVENT join messages.
 *
 * Accumulates footnotes into knowledge entries keyed by the narrator's
 * `Footnote.fact_id` (ADR-100 Seam C). Footnotes that arrive without a
 * fact_id are skipped with a `console.warn` rather than fabricating a
 * synthetic id — callers must ensure the server narrator pipeline emits
 * fact_id on every footnote per ADR-039.
 */
export function useStateMirror(messages: GameMessage[]): void {
  const { setState, setLocalPlayerId } = useGameState();
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (messages.length === 0) {
      if (prevLengthRef.current > 0) {
        prevLengthRef.current = 0;
        setState({ ...EMPTY_GAME_STATE });
      }
      return;
    }

    // Replay all messages to compute current state (idempotent)
    let current: ClientGameState = { ...EMPTY_GAME_STATE, characters: [], quests: {}, knowledge: [] };
    const journal: JournalEntry[] = [];
    const knowledge: KnowledgeEntry[] = [];
    const seenRenderIds = new Set<string>();
    const seenFactIds = new Set<string>();
    const depletions: ItemDepletion[] = [];
    const resourceAlerts: ResourceAlert[] = [];
    let myPlayerId = '';
    let turnCounter = 0;
    // Story 54-9 / ADR-109: persistent-location snapshot + buffered delta.
    // LOCATION_DESCRIPTION is a full replace; LOCATION_OVERLAY_CHANGED is an
    // overlays-only delta. A delta arriving before a matching baseline is
    // buffered and merged into the next matching LOCATION_DESCRIPTION
    // (spec §6.3 delta-before-baseline). A delta whose region differs from
    // the current baseline is dropped (room change is the truth source).
    let currentLocation: LocationDescriptionPayload | null = null;
    let pendingOverlays: LocationOverlayChangedPayload | null = null;
    // ADR-136: player-facing NPC relationship roster. RELATIONSHIPS is a
    // snapshot — every message is a full replace (same idempotent-replay
    // contract as currentLocation). Null until the first roster arrives.
    let relationships: RelationshipsPayload['entries'] | null = null;
    // Story 77-5 / ADR-137: player-facing quest spine. QUESTS is a snapshot —
    // every message is a full replace (same idempotent-replay contract as
    // relationships). Null until the first projection arrives.
    let questsData: QuestsPayload | null = null;
    // Story 118-2 / ADR-144 F3b: player-facing Fate spine. FATE_STATE is a
    // snapshot — every message is a full replace (same idempotent-replay
    // contract as quests). Null until the first projection arrives, and it only
    // ever arrives on a ruleset=='fate' pack (server gate).
    let fateState: FateStatePayload | null = null;
    // Story 118-7 / ADR-144 F3g: the latest 4dF roll. UNLIKE fateState (a
    // snapshot), FATE_ROLL is an EVENT — the most recent roll wins. Null until
    // the first roll arrives (only ever on a ruleset=='fate' pack).
    let latestFateRoll: FateRollPayload | null = null;

    for (const msg of messages) {
      // Detect handout IMAGE messages
      if (msg.type === MessageType.IMAGE && msg.payload.handout === true) {
        const renderId = msg.payload.render_id as string;
        if (renderId && !seenRenderIds.has(renderId)) {
          seenRenderIds.add(renderId);
          journal.push({
            type: 'handout',
            url: msg.payload.url as string,
            description: msg.payload.description as string,
            timestamp: Date.now(),
            render_id: renderId,
          });
        }
        continue;
      }

      if (msg.type === MessageType.SESSION_EVENT) {
        // Capture local player_id from the connected event
        const event = msg.payload.event as string | undefined;
        if ((event === 'connected' || event === 'ready') && msg.player_id) {
          myPlayerId = msg.player_id;
        }
        const initialState = msg.payload.initial_state as ClientGameState | undefined;
        if (initialState) {
          depletions.length = 0;
          resourceAlerts.length = 0;
          current = {
            characters: (initialState.characters ?? []).map(normalizeCharacter),
            location: initialState.location ?? '',
            quests: { ...initialState.quests },
            knowledge: [],
          };
        }
        continue;
      }

      // Track turns for knowledge entry timestamps
      if (msg.type === MessageType.PLAYER_ACTION) {
        turnCounter++;
        continue;
      }

      // JOURNAL_RESPONSE: server returns accumulated journal/knowledge entries.
      // The canonical row IS the authoritative record (ADR-100 Seam C). If an
      // ephemeral footnote-derived entry was already laid down for this
      // fact_id (defaulted to 'Suspected'), overwrite it in place rather than
      // dropping the canonical on the seen-set — otherwise the server's
      // KnownFact.confidence is silently lost behind the ephemeral default.
      if (msg.type === MessageType.JOURNAL_RESPONSE) {
        const entries = msg.payload.entries as Array<{
          fact_id: string;
          content: string;
          category: string;
          source: string;
          confidence: string;
          learned_turn: number;
        }> | undefined;
        if (entries) {
          for (const entry of entries) {
            const canonical: KnowledgeEntry = {
              fact_id: entry.fact_id,
              content: entry.content,
              category: validateCategory(entry.category),
              source: validateSource(entry.source),
              confidence: validateConfidence(entry.confidence),
              is_new: false,
              learned_turn: entry.learned_turn,
            };
            if (seenFactIds.has(entry.fact_id)) {
              const idx = knowledge.findIndex(k => k.fact_id === entry.fact_id);
              if (idx >= 0) knowledge[idx] = canonical;
            } else {
              seenFactIds.add(entry.fact_id);
              knowledge.push(canonical);
            }
          }
        }
        continue;
      }

      // ITEM_DEPLETED: a consumable item was fully exhausted
      if (msg.type === MessageType.ITEM_DEPLETED) {
        const itemName = msg.payload.item_name as string;
        const remainingBefore = msg.payload.remaining_before as number;
        if (itemName) {
          depletions.push({ item_name: itemName, remaining_before: remainingBefore ?? 0 });
        }
        continue;
      }

      // RESOURCE_MIN_REACHED: a resource decayed to its minimum
      if (msg.type === MessageType.RESOURCE_MIN_REACHED) {
        const resourceName = msg.payload.resource_name as string;
        const minValue = msg.payload.min_value as number;
        if (resourceName) {
          resourceAlerts.push({ resource_name: resourceName, min_value: minValue ?? 0 });
        }
        continue;
      }

      // Story 54-9 / ADR-109: persistent location description snapshot.
      // Full replace of currentLocation. If a delta was buffered (delta-
      // before-baseline per spec §6.3) and its region_id matches this
      // baseline, merge it in by replacing the baseline's overlays slice.
      // A buffered delta whose region_id no longer matches is dropped —
      // it belonged to a room we never received a baseline for.
      if (msg.type === MessageType.LOCATION_DESCRIPTION) {
        const payload = msg.payload as unknown as LocationDescriptionPayload;
        if (
          pendingOverlays !== null &&
          pendingOverlays.region_id === payload.region_id
        ) {
          currentLocation = {
            ...payload,
            overlays: [...pendingOverlays.overlays],
          };
        } else {
          currentLocation = payload;
        }
        pendingOverlays = null;
        continue;
      }

      // ADR-136: full replace of the relationship roster. RELATIONSHIPS is a
      // snapshot — the latest message wins, mirroring LOCATION_DESCRIPTION.
      if (msg.type === MessageType.RELATIONSHIPS) {
        const payload = msg.payload as unknown as RelationshipsPayload;
        relationships = payload.entries;
        continue;
      }

      // Story 77-5 / ADR-137: full replace of the quest spine. QUESTS is a
      // snapshot — the latest message wins, mirroring RELATIONSHIPS. The rich
      // payload threads onto questsData; the legacy quests Record is untouched.
      // No Silent Fallbacks: validate the shape at the boundary so a malformed
      // wire payload (version skew, serialization bug) fails loud and leaves
      // questsData unchanged rather than propagating garbage that crashes the
      // panel (AC2). Mirrors the fact_id boundary guard elsewhere in this file.
      if (msg.type === MessageType.QUESTS) {
        const p = msg.payload as unknown as QuestsPayload;
        if (
          !Array.isArray(p.quest_log) ||
          !Array.isArray(p.quest_anchors) ||
          typeof p.active_stakes !== 'string'
        ) {
          console.error('[useStateMirror] malformed QUESTS payload — ignoring', p);
          continue;
        }
        questsData = p;
        continue;
      }

      // Story 118-2 / ADR-144 F3b: full replace of the Fate spine. FATE_STATE is
      // a snapshot — the latest message wins, mirroring QUESTS. No Silent
      // Fallbacks: validate the shape at the boundary so a malformed wire
      // payload (version skew, serialization bug) fails loud and leaves
      // fateState unchanged rather than propagating garbage that crashes the
      // panel. Mirrors the QUESTS boundary guard above.
      if (msg.type === MessageType.FATE_STATE) {
        const p = msg.payload as unknown as FateStatePayload;
        if (!Array.isArray(p.characters) || !Array.isArray(p.scene_aspects)) {
          console.error('[useStateMirror] malformed FATE_STATE payload — ignoring', p);
          continue;
        }
        fateState = p;
        continue;
      }

      // Story 118-7 / ADR-144 F3g: the 4dF roll EVENT. The latest roll wins
      // (not accumulated). No-Silent-Fallbacks: validate the dice tuple at the
      // boundary so a malformed wire payload doesn't reach FateDiceTray's
      // `roll.dice.map(...)` and white-screen the panel — drop it and keep the
      // last valid roll. Mirrors the FATE_STATE boundary guard above.
      if (msg.type === MessageType.FATE_ROLL) {
        const p = msg.payload as unknown as FateRollPayload;
        if (!Array.isArray(p.dice) || p.dice.length !== 4) {
          console.error('[useStateMirror] malformed FATE_ROLL payload — ignoring', p);
          continue;
        }
        latestFateRoll = p;
        continue;
      }

      // Story 54-9: per-encounter overlay delta. When a baseline exists
      // for the same region_id, replace its overlays slice. When the
      // baseline is for a DIFFERENT region the delta is stale (room change
      // happened mid-stream) — drop silently. When no baseline exists yet,
      // buffer the delta until the next matching LOCATION_DESCRIPTION.
      if (msg.type === MessageType.LOCATION_OVERLAY_CHANGED) {
        const payload =
          msg.payload as unknown as LocationOverlayChangedPayload;
        if (
          currentLocation !== null &&
          currentLocation.region_id === payload.region_id
        ) {
          currentLocation = {
            ...currentLocation,
            overlays: [...payload.overlays],
          };
        } else if (currentLocation === null) {
          pendingOverlays = payload;
        }
        // else: baseline exists for a different region — drop silently.
        continue;
      }

      if (msg.type !== MessageType.NARRATION && msg.type !== MessageType.TURN_STATUS) {
        continue;
      }

      // Accumulate footnotes into knowledge entries from NARRATION messages
      if (msg.type === MessageType.NARRATION) {
        const footnotes = (msg.payload.footnotes as FootnoteData[] | undefined) ?? [];
        for (const fn of footnotes) {
          if (!fn.summary) continue;
          // Fact identity is narrator-supplied (ADR-100 Seam C). If a
          // footnote arrives without fact_id the server narrator pipeline
          // has emitted incomplete structured output — drop the entry
          // loudly rather than fabricating a synthetic id that breaks
          // per-fact dedupe with JOURNAL_RESPONSE.
          if (!fn.fact_id) {
            console.warn(
              '[useStateMirror] footnote missing fact_id; skipping',
              fn,
            );
            continue;
          }
          if (seenFactIds.has(fn.fact_id)) continue;
          seenFactIds.add(fn.fact_id);
          // Footnotes do not carry confidence on the wire. Ephemeral
          // entries default to 'Suspected' so the journal is populated
          // immediately; the JOURNAL_RESPONSE handler overwrites with
          // the server's authoritative KnownFact.confidence once it
          // arrives. Routing through validateConfidence(undefined) keeps
          // the default in one place — a literal cast would bypass the
          // single-source-of-truth contract.
          knowledge.push({
            fact_id: fn.fact_id,
            content: fn.summary,
            category: validateCategory(fn.category),
            source: validateSource('Observation'),
            confidence: validateConfidence(undefined),
            is_new: fn.is_new ?? true,
            learned_turn: turnCounter,
          });
        }
      }

      // In multiplayer, only apply state_delta from our own narrations
      // (other players' character state comes via PARTY_STATUS, not state_delta)
      if (myPlayerId && msg.player_id && msg.player_id !== myPlayerId) {
        continue;
      }

      const delta = msg.payload.state_delta as Record<string, unknown> | undefined;
      if (!delta || Object.keys(delta).length === 0) continue;

      current = applyDelta(current, delta);
    }

    // Store local player ID in context for other hooks
    if (myPlayerId) {
      setLocalPlayerId(myPlayerId);
    }

    // Merge journal entries (preserve existing from localStorage, add new)
    if (journal.length > 0) {
      const existingJournal = current.journal ?? [];
      const existingIds = new Set(existingJournal.map(e => e.render_id));
      const newEntries = journal.filter(e => !existingIds.has(e.render_id));
      current = { ...current, journal: [...existingJournal, ...newEntries] };
    }

    // Merge accumulated knowledge
    if (knowledge.length > 0) {
      current = { ...current, knowledge };
    }

    // Merge accumulated depletions and resource alerts
    if (depletions.length > 0) {
      current = { ...current, depletions };
    }
    if (resourceAlerts.length > 0) {
      current = { ...current, resourceAlerts };
    }

    // Story 54-9 / ADR-109: persistent location description slice. Always
    // mirrored — null when no LOCATION_DESCRIPTION has been received, the
    // composed payload (baseline ± overlay delta) otherwise. The empty
    // default in EMPTY_GAME_STATE is null so the panel's dataGated tab
    // stays hidden during chargen and on pre-54 worlds.
    current = { ...current, currentLocation };

    // ADR-136: relationship roster slice. Always mirrored — null when no
    // RELATIONSHIPS message has arrived, the latest snapshot's entries
    // otherwise. Same always-replace shape as currentLocation above so the
    // panel's data-gated surface stays hidden until the server sends a roster.
    current = { ...current, relationships };

    // Story 77-5 / ADR-137: quest-spine slice. Always mirrored — null when no
    // QUESTS message has arrived, the latest snapshot otherwise. Same
    // always-replace shape as relationships above.
    current = { ...current, questsData };

    // Story 118-2 / ADR-144 F3b: Fate-spine slice. Always mirrored — null when
    // no FATE_STATE message has arrived (the non-fate-pack reality), the latest
    // snapshot otherwise. Same always-replace shape as questsData above.
    current = { ...current, fateState };

    // Story 118-7 / ADR-144 F3g: latest-roll slice. Always mirrored — null until
    // the first FATE_ROLL arrives, the most recent roll otherwise (event, not
    // snapshot). Drives the FateDiceTray mount.
    current = { ...current, latestFateRoll };

    if (messages.length !== prevLengthRef.current) {
      prevLengthRef.current = messages.length;
      setState(current);
    }
  }, [messages, setState, setLocalPlayerId]);
}

function normalizeCharacter(c: CharacterState): CharacterState {
  return {
    name: c.name,
    hp: c.hp,
    max_hp: c.max_hp,
    level: c.level,
    class: c.class,
    statuses: [...(c.statuses ?? [])],
    inventory: [...(c.inventory ?? [])],
  };
}

function applyDelta(state: ClientGameState, delta: Record<string, unknown>): ClientGameState {
  const next = { ...state };

  if ('location' in delta && typeof delta.location === 'string') {
    next.location = delta.location;
  }

  if ('quests' in delta && delta.quests && typeof delta.quests === 'object') {
    next.quests = { ...next.quests, ...(delta.quests as Record<string, string>) };
  }

  if ('characters' in delta && Array.isArray(delta.characters)) {
    const charMap = new Map(next.characters.map(c => [c.name, c]));
    for (const cd of delta.characters as CharacterState[]) {
      charMap.set(cd.name, normalizeCharacter(cd));
    }
    next.characters = Array.from(charMap.values());
  }

  // Magic Phase 4: server rides the full MagicState dict on every
  // NARRATION_END (see sidequest/server/session_handler.py — the wire
  // payload is unconditional, not gated on the magic-changed flag).
  // We mirror by replacement, not merge: the server registry is
  // authoritative and the dict is small. Null indicates the world
  // has no magic configured — clear any stale prior value.
  if ('magic_state' in delta) {
    next.magicState = (delta.magic_state as MagicState | null) ?? null;
  }

  return next;
}
