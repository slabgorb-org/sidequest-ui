import { render, screen, renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  GameStateProvider,
  useGameState,
  EMPTY_GAME_STATE,
  type ClientGameState,
} from '../GameStateProvider';
import { useStateMirror } from '../../hooks/useStateMirror';
import { MessageType, type GameMessage } from '../../types/protocol';
import type { ReactNode } from 'react';

/** Wrapper for renderHook that provides GameStateProvider context. */
function wrapper({ children }: { children: ReactNode }) {
  return <GameStateProvider>{children}</GameStateProvider>;
}

/** Helper: build a GameMessage with a state_delta payload. */
function narrationWithDelta(delta: Record<string, unknown>): GameMessage {
  return {
    type: MessageType.NARRATION,
    payload: { text: 'The wind howls.', state_delta: delta },
    player_id: 'p1',
  };
}

function sessionJoinWithState(initialState: ClientGameState): GameMessage {
  return {
    type: MessageType.SESSION_EVENT,
    payload: { event: 'join', initial_state: initialState },
    player_id: 'server',
  };
}

// ---------------------------------------------------------------------------
// GameStateProvider — basic rendering
// ---------------------------------------------------------------------------

describe('GameStateProvider', () => {
  it('renders children without crashing', () => {
    render(
      <GameStateProvider>
        <span data-testid="child">hello</span>
      </GameStateProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('useGameState returns default empty state when no messages received', () => {
    const { result } = renderHook(() => useGameState(), { wrapper });

    expect(result.current.state).toEqual(EMPTY_GAME_STATE);
    expect(result.current.state.characters).toEqual([]);
    expect(result.current.state.location).toBe('');
    expect(result.current.state.quests).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// useStateMirror — delta application
// ---------------------------------------------------------------------------

describe('useStateMirror — delta application', () => {
  it('applies character HP change from NARRATION state_delta', () => {
    const messages = [
      narrationWithDelta({
        characters: [{ name: 'Aberu', hp: 8, max_hp: 10, statuses: [], inventory: [] }],
      }),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.state.characters).toHaveLength(1);
    expect(result.current.state.characters[0].name).toBe('Aberu');
    expect(result.current.state.characters[0].hp).toBe(8);
    expect(result.current.state.characters[0].max_hp).toBe(10);
  });

  it('applies location change from state_delta', () => {
    const messages = [
      narrationWithDelta({ location: 'Darkwood Forest' }),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.state.location).toBe('Darkwood Forest');
  });

  it('applies quest log change from state_delta', () => {
    const messages = [
      narrationWithDelta({
        quests: { 'Find the Amulet': 'in_progress' },
      }),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.state.quests).toEqual({ 'Find the Amulet': 'in_progress' });
  });

  it('applies inventory add from state_delta', () => {
    const messages = [
      narrationWithDelta({
        characters: [
          { name: 'Aberu', hp: 10, max_hp: 10, statuses: [], inventory: ['Iron Sword'] },
        ],
      }),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.state.characters[0].inventory).toContain('Iron Sword');
  });

  it('applies inventory remove from state_delta', () => {
    const initialMessages = [
      narrationWithDelta({
        characters: [
          { name: 'Aberu', hp: 10, max_hp: 10, statuses: [], inventory: ['Iron Sword', 'Potion'] },
        ],
      }),
    ];

    const updatedMessages = [
      ...initialMessages,
      narrationWithDelta({
        characters: [
          { name: 'Aberu', hp: 10, max_hp: 10, statuses: [], inventory: ['Iron Sword'] },
        ],
      }),
    ];

    const { result, rerender } = renderHook(
      ({ msgs }: { msgs: GameMessage[] }) => {
        useStateMirror(msgs);
        return useGameState();
      },
      { wrapper, initialProps: { msgs: initialMessages } },
    );

    rerender({ msgs: updatedMessages });

    expect(result.current.state.characters[0].inventory).toEqual(['Iron Sword']);
    expect(result.current.state.characters[0].inventory).not.toContain('Potion');
  });

  it('multiple deltas accumulate (HP change then location change)', () => {
    const messages = [
      narrationWithDelta({
        characters: [{ name: 'Aberu', hp: 7, max_hp: 10, statuses: ['poisoned'], inventory: [] }],
      }),
      narrationWithDelta({
        location: 'Village Square',
      }),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.state.characters[0].hp).toBe(7);
    expect(result.current.state.location).toBe('Village Square');
  });

  it('missing/empty state_delta in payload is ignored (no crash)', () => {
    const messages: GameMessage[] = [
      {
        type: MessageType.NARRATION,
        payload: { text: 'Nothing happens.' },
        player_id: 'p1',
      },
      {
        type: MessageType.NARRATION,
        payload: { text: 'Still nothing.', state_delta: {} },
        player_id: 'p1',
      },
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    // Should still be empty state, no crash
    expect(result.current.state).toEqual(EMPTY_GAME_STATE);
  });
});

// ---------------------------------------------------------------------------
// Initial state from SESSION_EVENT
// ---------------------------------------------------------------------------

describe('useStateMirror — SESSION_EVENT initial state', () => {
  const fullState: ClientGameState = {
    characters: [
      { name: 'Aberu', hp: 10, max_hp: 10, statuses: [], inventory: ['Staff'] },
      { name: 'Lyra', hp: 8, max_hp: 8, statuses: [], inventory: ['Bow'] },
    ],
    location: 'Temple of Dawn',
    quests: { 'Defend the Temple': 'active' },
    knowledge: [],
  };

  it('SESSION_EVENT join with initial_state populates full state', () => {
    const messages = [sessionJoinWithState(fullState)];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.state.characters).toHaveLength(2);
    expect(result.current.state.characters[0].name).toBe('Aberu');
    expect(result.current.state.characters[1].name).toBe('Lyra');
    expect(result.current.state.location).toBe('Temple of Dawn');
    expect(result.current.state.quests).toEqual({ 'Defend the Temple': 'active' });
  });

  it('subsequent deltas build on initial state', () => {
    const messages = [
      sessionJoinWithState(fullState),
      narrationWithDelta({
        characters: [
          { name: 'Aberu', hp: 6, max_hp: 10, statuses: ['wounded'], inventory: ['Staff'] },
          { name: 'Lyra', hp: 8, max_hp: 8, statuses: [], inventory: ['Bow'] },
        ],
        location: 'Temple Courtyard',
      }),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.state.characters[0].hp).toBe(6);
    expect(result.current.state.characters[0].statuses).toContain('wounded');
    expect(result.current.state.location).toBe('Temple Courtyard');
    // Quest from initial state should still be present
    expect(result.current.state.quests).toEqual({ 'Defend the Temple': 'active' });
  });
});
