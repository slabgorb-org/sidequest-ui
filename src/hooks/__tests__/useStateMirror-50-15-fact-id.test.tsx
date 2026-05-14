/**
 * Story 50-15: Journal UI fact_id respect — drop synthetic id,
 * consume narrator-supplied Footnote.fact_id (Seam C UI part 1 per ADR-100).
 *
 * Today (RED state):
 *   useStateMirror.ts:186 manufactures `${turnCounter}-${marker ?? index}`
 *   and ignores `Footnote.fact_id` even when the narrator supplied it.
 *   Result: per-turn dedupe instead of per-fact dedupe, and the
 *   server-canonical fact identity never reaches the UI knowledge[] array.
 *
 * ACs (all must fail until 50-15 lands):
 *   AC1 — drop synthetic id; knowledge entries carry narrator fact_id verbatim
 *   AC2 — Footnote.fact_id consumed by the NARRATION path
 *   AC3 — type alignment: FootnoteData.fact_id is `string` without coercion
 *   AC4 — integration: NARRATION+JOURNAL_RESPONSE share fact_id, no transform
 *   AC5 — wiring: useStateMirror is imported by App and round-trips to knowledge[]
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GameStateProvider,
  useGameState,
} from '../../providers/GameStateProvider';
import { useStateMirror } from '../../hooks/useStateMirror';
import { MessageType, type GameMessage } from '../../types/protocol';
import type { FootnoteData } from '../../types/payloads';
import type { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return <GameStateProvider>{children}</GameStateProvider>;
}

function narrationWithFootnotes(
  footnotes: FootnoteData[],
  playerId = 'p1',
): GameMessage {
  return {
    type: MessageType.NARRATION,
    payload: {
      text: 'You step into the lantern-lit parlour. The grandfather clock has stopped.',
      footnotes,
    },
    player_id: playerId,
  };
}

function playerAction(playerId = 'p1'): GameMessage {
  return {
    type: MessageType.PLAYER_ACTION,
    payload: { text: 'I look at the clock.' },
    player_id: playerId,
  };
}

// ---------------------------------------------------------------------------
// AC1 — Drop synthetic id manufacture
// ---------------------------------------------------------------------------

describe('useStateMirror 50-15 — AC1: drop synthetic id', () => {
  it('uses narrator-supplied fact_id verbatim, not `${turn}-${marker}`', () => {
    const narration = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: 'fact-clock-stopped-2026-05-14',
        summary: 'The grandfather clock stopped at 11:47.',
        category: 'Place',
        is_new: true,
      },
    ]);

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror([playerAction(), narration]);
        return state;
      },
      { wrapper },
    );

    const entries = result.current.state.knowledge;
    expect(entries.length).toBe(1);
    expect(entries[0].fact_id).toBe('fact-clock-stopped-2026-05-14');
  });

  it('does NOT produce a `${turnCounter}-${marker}` synthetic id when fact_id is present', () => {
    const narration = narrationWithFootnotes([
      {
        marker: 7,
        fact_id: 'fact-real-id-xyz',
        summary: 'A letter half-burned in the grate.',
        category: 'Lore',
        is_new: true,
      },
    ]);

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror([playerAction(), narration]);
        return state;
      },
      { wrapper },
    );

    const entries = result.current.state.knowledge;
    expect(entries.length).toBeGreaterThan(0);
    // The synthetic pattern is `<digits>-<digits>`; the canonical id is not.
    const SYNTHETIC = /^\d+-\d+$/;
    for (const entry of entries) {
      expect(entry.fact_id).not.toMatch(SYNTHETIC);
    }
  });
});

// ---------------------------------------------------------------------------
// AC2 — Consume Footnote.fact_id (per-fact dedupe, not per-turn)
// ---------------------------------------------------------------------------

describe('useStateMirror 50-15 — AC2: per-fact dedupe via fact_id', () => {
  it('does not duplicate a fact when the same fact_id appears across two turns', () => {
    const factId = 'fact-letter-on-desk';
    const turn1 = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: factId,
        summary: 'A half-burned letter sits on the desk.',
        category: 'Lore',
        is_new: true,
      },
    ]);
    const turn2 = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: factId,
        summary: 'The half-burned letter is still on the desk.',
        category: 'Lore',
        is_new: false,
      },
    ]);

    const messages = [
      playerAction(),
      turn1,
      playerAction(),
      turn2,
    ];

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror(messages);
        return state;
      },
      { wrapper },
    );

    const entries = result.current.state.knowledge.filter(
      (e) => e.fact_id === factId,
    );
    expect(entries.length).toBe(1);
  });

  it('keeps distinct fact_ids as distinct entries (no false-positive merge)', () => {
    const narration = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: 'fact-a',
        summary: 'Fact A',
        category: 'Lore',
        is_new: true,
      },
      {
        marker: 2,
        fact_id: 'fact-b',
        summary: 'Fact B',
        category: 'Person',
        is_new: true,
      },
    ]);

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror([playerAction(), narration]);
        return state;
      },
      { wrapper },
    );

    const ids = result.current.state.knowledge.map((e) => e.fact_id);
    expect(ids).toContain('fact-a');
    expect(ids).toContain('fact-b');
  });
});

// ---------------------------------------------------------------------------
// AC3 — Type alignment: FootnoteData.fact_id is `string` and consumed as-is
// ---------------------------------------------------------------------------

describe('useStateMirror 50-15 — AC3: type alignment', () => {
  it('FootnoteData.fact_id is typed as string (compile-time + runtime check)', () => {
    // This test is mostly a compile-time guarantee: the assignment below would
    // fail strict TS if FootnoteData.fact_id were declared as anything other
    // than `string | undefined`. The runtime assertion locks the contract
    // that the value is forwarded unmodified.
    const footnote: FootnoteData = {
      marker: 4,
      fact_id: 'string-literal-fact-id',
      summary: 'A typed footnote.',
      category: 'Lore',
      is_new: true,
    };
    expect(typeof footnote.fact_id).toBe('string');

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror([playerAction(), narrationWithFootnotes([footnote])]);
        return state;
      },
      { wrapper },
    );

    const entry = result.current.state.knowledge.find(
      (e) => e.fact_id === 'string-literal-fact-id',
    );
    expect(entry).toBeDefined();
    // No coercion — the value is the same string we put in.
    expect(entry!.fact_id).toBe(footnote.fact_id);
  });

  it('useStateMirror does not own a local FootnoteData interface that shadows the canonical one', () => {
    // The canonical FootnoteData lives in src/types/payloads.ts and already
    // has `fact_id?: string`. The hook used to declare its own local
    // FootnoteData interface (line 31-36 of useStateMirror.ts) that omitted
    // fact_id — that shadow is the source of the synthetic-id bug. This
    // test reads the source and fails if the local shadow is still present.
    const src = readFileSync(
      resolve(__dirname, '../useStateMirror.ts'),
      'utf-8',
    );
    // The hook should import FootnoteData rather than redeclaring it.
    expect(src).toMatch(/import[^;]*FootnoteData[^;]*from\s+['"](?:\.\.\/|@\/)types\/payloads['"]/);
    // And no local `interface FootnoteData` block must remain in the hook.
    expect(src).not.toMatch(/^interface\s+FootnoteData\b/m);
  });
});

// ---------------------------------------------------------------------------
// AC4 — Integration: NARRATION fact_id and JOURNAL_RESPONSE fact_id collide
// ---------------------------------------------------------------------------

describe('useStateMirror 50-15 — AC4: NARRATION/JOURNAL_RESPONSE fact_id alignment', () => {
  it('NARRATION footnote and JOURNAL_RESPONSE entry sharing a fact_id collapse to one entry', () => {
    // The whole point of fact_id respect: the same fact arriving via the
    // per-turn ephemeral channel (NARRATION.footnotes) and via the canonical
    // request channel (JOURNAL_RESPONSE.entries) must dedupe at the UI layer.
    const factId = 'fact-shared-id-001';

    const narration = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: factId,
        summary: 'Stopped clock — discovered during scene.',
        category: 'Place',
        is_new: true,
      },
    ]);

    const journalResponse: GameMessage = {
      type: MessageType.JOURNAL_RESPONSE,
      payload: {
        entries: [
          {
            fact_id: factId,
            content: 'The grandfather clock stopped at 11:47.',
            category: 'Place',
            source: 'Observation',
            confidence: 'Suspected',
            learned_turn: 1,
          },
        ],
      },
      player_id: 'server',
    };

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror([playerAction(), narration, journalResponse]);
        return state;
      },
      { wrapper },
    );

    // Today: NARRATION produces synthetic `${turn}-${marker}`, JOURNAL_RESPONSE
    // produces real factId — knowledge[] has TWO entries (the bug). After the
    // fix: both paths produce one entry keyed on factId.
    expect(result.current.state.knowledge.length).toBe(1);
    expect(result.current.state.knowledge[0].fact_id).toBe(factId);
  });

  it('preserves fact_id exactly as supplied through the full state-mirror update', () => {
    // Sanity: no fact_id transformation, hashing, prefixing, or namespacing.
    const exotic = 'clue::weapon-1A-fingerprints/blood';
    const narration = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: exotic,
        summary: 'Blood on the candlestick.',
        category: 'Lore',
        is_new: true,
      },
    ]);

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror([playerAction(), narration]);
        return state;
      },
      { wrapper },
    );

    const ids = result.current.state.knowledge.map((e) => e.fact_id);
    expect(ids).toContain(exotic);
  });
});

// ---------------------------------------------------------------------------
// AC5 — Wiring: useWebSocket → state-mirror → Journal-bound state
// ---------------------------------------------------------------------------

describe('useStateMirror 50-15 — AC5: wiring test', () => {
  it('useStateMirror is imported by a non-test production code path', () => {
    // Per CLAUDE.md "Verify Wiring, Not Just Existence" — a unit-tested hook
    // means nothing if no production code calls it. App.tsx is the wiring
    // anchor (line ~485).
    const appSrc = readFileSync(
      resolve(__dirname, '../../App.tsx'),
      'utf-8',
    );
    expect(appSrc).toMatch(/import\s*\{\s*useStateMirror\s*\}/);
    expect(appSrc).toMatch(/useStateMirror\s*\(/);
  });

  it('end-to-end: a NARRATION fact_id reaches knowledge[] under the keyed shape KnowledgeJournal uses', () => {
    // KnowledgeJournal renders entries with `key={entry.fact_id}` (see
    // src/components/KnowledgeJournal.tsx:313). React keys must be the
    // narrator-supplied identity so re-renders match across turns. If the
    // synthetic id is still produced, the key flips every turn and the
    // component re-mounts; that is the visible symptom of the bug.
    const factId = 'fact-journal-key-stability';
    const turn1 = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: factId,
        summary: 'A note pinned to the door.',
        category: 'Lore',
        is_new: true,
      },
    ]);
    const turn2 = narrationWithFootnotes([
      {
        marker: 2,
        fact_id: factId,
        summary: 'The note still hangs on the door.',
        category: 'Lore',
        is_new: false,
      },
    ]);

    const { result, rerender } = renderHook(
      ({ msgs }: { msgs: GameMessage[] }) => {
        const state = useGameState();
        useStateMirror(msgs);
        return state;
      },
      {
        wrapper,
        initialProps: { msgs: [playerAction(), turn1] as GameMessage[] },
      },
    );

    const afterTurn1 = result.current.state.knowledge.find(
      (e) => e.fact_id === factId,
    );
    expect(afterTurn1).toBeDefined();
    expect(afterTurn1!.fact_id).toBe(factId);

    rerender({ msgs: [playerAction(), turn1, playerAction(), turn2] });

    const afterTurn2 = result.current.state.knowledge.filter(
      (e) => e.fact_id === factId,
    );
    expect(afterTurn2.length).toBe(1);
    // The id is still the narrator-supplied one, not a fresh synthetic.
    expect(afterTurn2[0].fact_id).toBe(factId);
  });
});
