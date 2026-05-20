import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { MagicState } from '@/types/magic';
import {
  reduceStreamingNarration,
  displayTextForTurn,
  initialStreamingState,
  type StreamingNarrationState,
} from './streamingNarration';
import type {
  LocationDescriptionPayload,
  NarrationDelta,
  NarrationMessage,
} from '@/types/payloads';

export interface CharacterState {
  name: string;
  hp: number;
  max_hp: number;
  level?: number;
  class?: string;
  statuses: string[];
  inventory: string[];
}

export interface JournalEntry {
  type: 'handout';
  url: string;
  description: string;
  timestamp: number;
  render_id: string;
}

export type FactCategory = 'Lore' | 'Place' | 'Person' | 'Quest' | 'Ability';

export type FactSource = 'Observation' | 'Dialogue' | 'Discovery' | 'Backstory';
export type Confidence = 'Certain' | 'Suspected' | 'Rumored';

export interface KnowledgeEntry {
  fact_id: string;
  content: string;
  category: FactCategory;
  is_new: boolean;
  learned_turn: number;
  source: FactSource;
  confidence: Confidence;
}

export interface ItemDepletion {
  item_name: string;
  remaining_before: number;
}

export interface ResourceAlert {
  resource_name: string;
  min_value: number;
}

export interface ClientGameState {
  characters: CharacterState[];
  location: string;
  quests: Record<string, string>;
  journal?: JournalEntry[];
  knowledge: KnowledgeEntry[];
  depletions?: ItemDepletion[];
  resourceAlerts?: ResourceAlert[];
  /** Magic ledger state (Coyote Star Phase 4). Mirrored from server's
   *  GameSnapshot.magic_state via state_delta on NARRATION_END. Null
   *  when the active world has no magic configured. */
  magicState?: MagicState | null;
  /**
   * Story 54-9 / ADR-109: persistent location description for the
   * currently rendered region/room. Mirrored from the server's
   * LOCATION_DESCRIPTION (snapshot) and LOCATION_OVERLAY_CHANGED (delta).
   * Null when no manifest has been delivered yet — legacy saves and
   * pre-54 worlds remain valid in this shape.
   */
  currentLocation?: LocationDescriptionPayload | null;
}

export interface GameStateContextValue {
  state: ClientGameState;
  setState: (state: ClientGameState) => void;
  localPlayerId: string;
  setLocalPlayerId: (id: string) => void;
  streamingNarration: StreamingNarrationState;
  dispatchStreamingAction: (action: NarrationDelta | NarrationMessage) => void;
  /** Replace the entire streaming narration state — used by useStateMirror for
   *  idempotent full-replay (mirrors how setState replaces the whole game state). */
  setStreamingNarration: (state: StreamingNarrationState) => void;
  displayTextForTurn: (turn_id: string) => string | null;
}

// Re-export so consumers can import from the provider module
export type { StreamingNarrationState };

// react-refresh would prefer this constant lived in a non-component file, but
// 11 importers across the codebase reach for it from this module. The rule's
// concern (HMR state loss when this file changes) is moot in practice — the
// provider is touched maybe twice a year. Suppress and stay co-located.
// eslint-disable-next-line react-refresh/only-export-components
export const EMPTY_GAME_STATE: ClientGameState = {
  characters: [],
  location: '',
  quests: {},
  knowledge: [],
  currentLocation: null,
};

const GameStateContext = createContext<GameStateContextValue>({
  state: EMPTY_GAME_STATE,
  setState: () => {},
  localPlayerId: '',
  setLocalPlayerId: () => {},
  streamingNarration: initialStreamingState,
  dispatchStreamingAction: () => {},
  setStreamingNarration: () => {},
  displayTextForTurn: () => null,
});

export interface GameStateProviderProps {
  children: ReactNode;
}

const JOURNAL_STORAGE_KEY = 'sq_journal';
const GAME_STATE_STORAGE_KEY = 'sq_game_state';

function loadJournalFromStorage(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore corrupt localStorage
  }
  return [];
}

function saveJournalToStorage(journal: JournalEntry[]): void {
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journal));
  } catch {
    // ignore quota errors
  }
}

function loadGameStateFromStorage(): ClientGameState | null {
  try {
    const raw = sessionStorage.getItem(GAME_STATE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ClientGameState;
      if (parsed && typeof parsed.location === 'string') return parsed;
    }
  } catch {
    // ignore corrupt sessionStorage
  }
  return null;
}

function saveGameStateToStorage(state: ClientGameState): void {
  try {
    sessionStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function GameStateProvider({ children }: GameStateProviderProps) {
  const [state, setStateRaw] = useState<ClientGameState>(() => {
    // Hydrate from sessionStorage first (HMR survival), then fall back to journal
    const saved = loadGameStateFromStorage();
    if (saved) return saved;
    const journal = loadJournalFromStorage();
    return journal.length > 0
      ? { ...EMPTY_GAME_STATE, journal }
      : EMPTY_GAME_STATE;
  });
  const setState = useCallback((s: ClientGameState) => setStateRaw(s), []);
  const [localPlayerId, setLocalPlayerId] = useState('');

  // Streaming narration accumulator slice (Task 16).
  // Tracks per-turn delta chunks and canonical text so Task 17 can render
  // streaming prose before the canonical NarrationMessage arrives.
  const [streamingNarrationState, setStreamingNarrationState] =
    useState<StreamingNarrationState>(initialStreamingState);

  const dispatchStreamingAction = useCallback(
    (action: NarrationDelta | NarrationMessage) => {
      setStreamingNarrationState((prev) => reduceStreamingNarration(prev, action));
    },
    [],
  );

  const setStreamingNarration = useCallback(
    (s: StreamingNarrationState) => setStreamingNarrationState(s),
    [],
  );

  const displayTextForTurnBound = useCallback(
    (turn_id: string) => displayTextForTurn(streamingNarrationState, turn_id),
    [streamingNarrationState],
  );

  // Persist full game state to sessionStorage for HMR survival
  useEffect(() => {
    saveGameStateToStorage(state);
  }, [state]);

  // Persist journal to localStorage (survives full page reload)
  useEffect(() => {
    if (state.journal && state.journal.length > 0) {
      saveJournalToStorage(state.journal);
    }
  }, [state.journal]);

  return (
    <GameStateContext.Provider
      value={{
        state,
        setState,
        localPlayerId,
        setLocalPlayerId,
        streamingNarration: streamingNarrationState,
        dispatchStreamingAction,
        setStreamingNarration,
        displayTextForTurn: displayTextForTurnBound,
      }}
    >
      {children}
    </GameStateContext.Provider>
  );
}

// Co-located hook — see comment on EMPTY_GAME_STATE for the rationale.
// eslint-disable-next-line react-refresh/only-export-components
export function useGameState(): GameStateContextValue {
  return useContext(GameStateContext);
}
