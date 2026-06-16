import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { MagicState } from '@/types/magic';
import type {
  FateRollPayload,
  FateStatePayload,
  LocationDescriptionPayload,
  QuestsPayload,
  RelationshipEntryPayload,
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
  /** URL to the reference page anchor; null when no anchor exists. */
  reference_url?: string | null;
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
  /** ADR-136: player-facing NPC relationship roster (full replace per message). */
  relationships?: RelationshipEntryPayload[] | null;
  /**
   * Story 77-5 / ADR-137: player-facing quest spine (quest_log + quest_anchors
   * + active_stakes), mirrored from the QUESTS snapshot (full replace per
   * message). Null until the first projection arrives. A SEPARATE field from
   * the legacy `quests` Record above (never read) — the rich payload is the
   * source of truth.
   */
  questsData?: QuestsPayload | null;
  /**
   * Story 118-2 / ADR-144 F3b: player-facing Fate spine (per-PC sheets + scene
   * aspects + active conflict), mirrored from the FATE_STATE snapshot (full
   * replace per message). Null until the first projection arrives — and it
   * NEVER arrives on a non-fate pack (server emits only on ruleset=='fate'),
   * which is what keeps the Fate tab off WN/native packs.
   */
  fateState?: FateStatePayload | null;
  /**
   * Story 118-7 / ADR-144 F3g: the latest resolved 4dF roll, mirrored from the
   * FATE_ROLL EVENT (the most recent roll wins — unlike the FATE_STATE snapshot
   * above). Null until the first roll arrives. Drives the FateDiceTray mount in
   * the Fate panel; like fateState it only ever arrives on a ruleset=='fate'
   * pack (server gate).
   */
  latestFateRoll?: FateRollPayload | null;
}

export interface GameStateContextValue {
  state: ClientGameState;
  setState: (state: ClientGameState) => void;
  localPlayerId: string;
  setLocalPlayerId: (id: string) => void;
}

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
  relationships: null,
  questsData: null,
  fateState: null,
  latestFateRoll: null,
};

const GameStateContext = createContext<GameStateContextValue>({
  state: EMPTY_GAME_STATE,
  setState: () => {},
  localPlayerId: '',
  setLocalPlayerId: () => {},
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
