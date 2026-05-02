/**
 * Task 17 wiring test — verifies that useStateMirror routes narration.delta
 * and canonical NARRATION messages from the messages array into the
 * streamingNarration slice of GameStateProvider.
 *
 * This is the "every test suite needs a wiring test" required by the project
 * rules. The test checks the full path:
 *   messages array → useStateMirror → dispatchStreamingAction → streamingNarration.turns
 *
 * Option A was chosen (extend useStateMirror) because:
 *   1. useStateMirror already calls useGameState() to obtain setState/setLocalPlayerId
 *   2. It already owns the idempotency pattern (replay on messages.length change)
 *   3. narration.delta messages fall through handleMessage's guards and land
 *      in the messages array (same as all unrecognised-type messages)
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GameStateProvider, useGameState } from '../../providers/GameStateProvider';
import { useStateMirror } from '../useStateMirror';
import { MessageType, type GameMessage } from '../../types/protocol';
import type { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return <GameStateProvider>{children}</GameStateProvider>;
}

/**
 * NarrationDelta arrives on the WebSocket as raw JSON with `kind` (not `type`).
 * handleMessage in App.tsx has no matching guard, so it falls through to
 * setMessages — meaning the messages array can contain NarrationDelta objects
 * typed as GameMessage. Cast is intentional: this is exactly what happens
 * in production.
 */
function makeDelta(turn_id: string, chunk: string, seq: number): GameMessage {
  return { kind: 'narration.delta', payload: { turn_id, chunk, seq } } as unknown as GameMessage;
}

function makeNarration(text: string, player_id = 'p1'): GameMessage {
  return {
    type: MessageType.NARRATION,
    payload: { text, state_delta: {} },
    player_id,
  };
}

// ---------------------------------------------------------------------------
// Test 1: narration.delta → streamingNarration.turns
// ---------------------------------------------------------------------------

describe('useStateMirror — streaming narration wiring', () => {
  it('routes a narration.delta message into streamingNarration.turns', () => {
    const messages: GameMessage[] = [
      makeDelta('wt-1', 'Hello ', 0),
      makeDelta('wt-1', 'world.', 1),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    const turn = result.current.streamingNarration.turns.get('wt-1');
    expect(turn).toBeDefined();
    expect(turn!.chunks).toEqual(['Hello ', 'world.']);
    expect(turn!.canonical).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Test 2: canonical NARRATION → streamingNarration.turns
  // ---------------------------------------------------------------------------

  it('routes a canonical NARRATION message into streamingNarration after a delta', () => {
    // Must have at least one delta first so activeTurnId is set
    const messages: GameMessage[] = [
      makeDelta('wt-2', 'Partial prose ', 0),
      makeNarration('CANONICAL FINAL TEXT'),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    const turn = result.current.streamingNarration.turns.get('wt-2');
    expect(turn).toBeDefined();
    expect(turn!.canonical).toBe('CANONICAL FINAL TEXT');
  });

  // ---------------------------------------------------------------------------
  // Test 3: displayTextForTurn returns streamed text before canonical
  // ---------------------------------------------------------------------------

  it('displayTextForTurn returns accumulated chunks when no canonical', () => {
    const messages: GameMessage[] = [
      makeDelta('wt-3', 'Alpha ', 0),
      makeDelta('wt-3', 'Beta.', 1),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.displayTextForTurn('wt-3')).toBe('Alpha Beta.');
  });

  // ---------------------------------------------------------------------------
  // Test 4: displayTextForTurn returns canonical over chunks
  // ---------------------------------------------------------------------------

  it('displayTextForTurn returns canonical text when canonical is set', () => {
    const messages: GameMessage[] = [
      makeDelta('wt-4', 'Partial ', 0),
      makeNarration('FINAL CANONICAL'),
    ];

    const { result } = renderHook(
      () => {
        useStateMirror(messages);
        return useGameState();
      },
      { wrapper },
    );

    expect(result.current.displayTextForTurn('wt-4')).toBe('FINAL CANONICAL');
  });

  // ---------------------------------------------------------------------------
  // Test 5: idempotency — re-renders with the SAME messages array don't
  // re-dispatch (prevLengthRef guards this in useStateMirror)
  // ---------------------------------------------------------------------------

  it('does not re-dispatch when messages array reference changes but length is the same', () => {
    const messages: GameMessage[] = [makeDelta('wt-5', 'Stable chunk', 0)];

    const { result, rerender } = renderHook(
      ({ msgs }: { msgs: GameMessage[] }) => {
        useStateMirror(msgs);
        return useGameState();
      },
      { wrapper, initialProps: { msgs: messages } },
    );

    const turnAfterFirst = result.current.streamingNarration.turns.get('wt-5');
    expect(turnAfterFirst!.chunks).toEqual(['Stable chunk']);

    // Rerender with a new array reference but the SAME length — should not
    // trigger re-dispatch (prevLengthRef short-circuits the effect).
    act(() => {
      rerender({ msgs: [...messages] });
    });

    const turnAfterRerender = result.current.streamingNarration.turns.get('wt-5');
    expect(turnAfterRerender!.chunks).toEqual(['Stable chunk']);
  });

  // ---------------------------------------------------------------------------
  // Test 6: new delta appended to messages triggers update
  // ---------------------------------------------------------------------------

  it('updates streamingNarration when a new delta is appended to the messages array', () => {
    const initial: GameMessage[] = [makeDelta('wt-6', 'First chunk ', 0)];
    const extended: GameMessage[] = [...initial, makeDelta('wt-6', 'second chunk.', 1)];

    const { result, rerender } = renderHook(
      ({ msgs }: { msgs: GameMessage[] }) => {
        useStateMirror(msgs);
        return useGameState();
      },
      { wrapper, initialProps: { msgs: initial } },
    );

    expect(result.current.streamingNarration.turns.get('wt-6')!.chunks).toEqual(['First chunk ']);

    act(() => {
      rerender({ msgs: extended });
    });

    expect(result.current.streamingNarration.turns.get('wt-6')!.chunks).toEqual([
      'First chunk ',
      'second chunk.',
    ]);
  });
});
