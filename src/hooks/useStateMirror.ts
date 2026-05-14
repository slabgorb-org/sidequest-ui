import { useEffect, useRef } from 'react';
import { MessageType, type GameMessage } from '../types/protocol';
import { useGameState, EMPTY_GAME_STATE, type ClientGameState, type CharacterState, type JournalEntry, type KnowledgeEntry, type FactCategory, type FactSource, type Confidence, type ItemDepletion, type ResourceAlert } from '../providers/GameStateProvider';
import { isNarrationDelta } from '../types/payloads';
import type { FootnoteData, NarrationMessage } from '../types/payloads';
import { reduceStreamingNarration, initialStreamingState } from '../providers/streamingNarration';
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
 * `Footnote.fact_id` (ADR-100 Seam C, story 50-15). Footnotes that arrive
 * without a fact_id are skipped with a `console.warn` rather than
 * fabricating a synthetic id — callers must ensure the server narrator
 * pipeline emits fact_id on every footnote per ADR-039.
 */
export function useStateMirror(messages: GameMessage[]): void {
  const { setState, setLocalPlayerId, setStreamingNarration } = useGameState();
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (messages.length === 0) {
      if (prevLengthRef.current > 0) {
        prevLengthRef.current = 0;
        setState({ ...EMPTY_GAME_STATE });
        setStreamingNarration(initialStreamingState);
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
    // Streaming narration: rebuilt from scratch on every replay (same idempotency
    // contract as `current` above — full replace, no incremental accumulation).
    let streamingState = initialStreamingState;

    for (const msg of messages) {
      // narration.delta arrives with `kind` (not `type`) and is NOT a GameMessage
      // variant — it falls through handleMessage's guards and lands in the messages
      // array unmodified. isNarrationDelta checks for the `kind` field explicitly.
      if (isNarrationDelta(msg)) {
        if (!msg.payload.turn_id) {
          console.error(
            '[useStateMirror] narration.delta arrived without turn_id — cannot route',
            msg,
          );
          continue;
        }
        streamingState = reduceStreamingNarration(streamingState, msg);
        continue;
      }
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
      // ADR-100 Seam C UI part 2 (story 50-16): the canonical row IS the
      // authoritative record. If an ephemeral footnote-derived entry was
      // already laid down for this fact_id (defaulted to 'Suspected'),
      // overwrite it in place rather than dropping the canonical on the
      // seen-set — otherwise the server's KnownFact.confidence is silently
      // lost behind the ephemeral default.
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

      if (msg.type !== MessageType.NARRATION && msg.type !== MessageType.TURN_STATUS) {
        continue;
      }

      // Accumulate footnotes into knowledge entries from NARRATION messages
      if (msg.type === MessageType.NARRATION) {
        const footnotes = (msg.payload.footnotes as FootnoteData[] | undefined) ?? [];
        for (const fn of footnotes) {
          if (!fn.summary) continue;
          // ADR-100 Seam C UI part 1 (story 50-15): fact identity is
          // narrator-supplied. If a footnote arrives without fact_id the
          // server narrator pipeline has emitted incomplete structured
          // output — drop the entry loudly rather than fabricating a
          // synthetic id that breaks per-fact dedupe with JOURNAL_RESPONSE.
          if (!fn.fact_id) {
            console.warn(
              '[useStateMirror] footnote missing fact_id; skipping',
              fn,
            );
            continue;
          }
          if (seenFactIds.has(fn.fact_id)) continue;
          seenFactIds.add(fn.fact_id);
          // ADR-100 Seam C UI part 2 (story 50-16): footnotes do not
          // carry confidence on the wire. Default ephemeral entries to
          // 'Suspected' via the central validator (matches Klinger's
          // call), and rely on the JOURNAL_RESPONSE override above to
          // promote to the canonical KnownFact.confidence when the
          // server replies. No literal 'Suspected' cast — the
          // canonical truth is sourced from one place only.
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

        // Route canonical NARRATION through the streaming reducer so the
        // active streaming turn gets its canonical text (closes the turn).
        // Only route when there is an active streaming turn — a NARRATION
        // that arrives with no prior delta is a non-streaming narration and
        // does not need to touch the streaming slice.
        if (streamingState.activeTurnId !== null) {
          streamingState = reduceStreamingNarration(
            streamingState,
            msg as unknown as NarrationMessage,
          );
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

    if (messages.length !== prevLengthRef.current) {
      prevLengthRef.current = messages.length;
      setState(current);
      setStreamingNarration(streamingState);
    }
  }, [messages, setState, setLocalPlayerId, setStreamingNarration]);
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
