/**
 * Story 50-15: Journal UI fact_id respect — drop synthetic id,
 * consume narrator-supplied Footnote.fact_id (Seam C UI part 1 per ADR-100).
 *
 * Before 50-15:
 *   useStateMirror manufactured `${turnCounter}-${marker ?? index}` for
 *   the per-turn footnote path and ignored `Footnote.fact_id` even when
 *   the narrator supplied it. Result: per-turn dedupe instead of per-fact
 *   dedupe, and the server-canonical fact identity never reached the UI
 *   knowledge[] array.
 *
 * After 50-15 (the contract these tests pin down):
 *   AC1 — knowledge entries carry the narrator's fact_id verbatim
 *   AC2 — Footnote.fact_id is consumed by the NARRATION path (per-fact dedupe)
 *   AC3 — type alignment: FootnoteData is the canonical type from payloads.ts
 *   AC4 — NARRATION + JOURNAL_RESPONSE collapse on shared fact_id
 *   AC5 — wiring: useStateMirror is imported by App and round-trips to knowledge[]
 *   Drop path — footnotes without fact_id are skipped with console.warn
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  it('a typed FootnoteData.fact_id flows through to knowledge[] unchanged (no coercion)', () => {
    // Strict TS would reject the literal below if FootnoteData.fact_id were
    // declared as anything other than `string | undefined`; the runtime
    // assertion locks the contract that the value is forwarded unmodified.
    const footnote: FootnoteData = {
      marker: 4,
      fact_id: 'string-literal-fact-id',
      summary: 'A typed footnote.',
      category: 'Lore',
      is_new: true,
    };

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
    // Null-safe single assertion: failure path is "no matching entry."
    expect(entry?.fact_id).toBe(footnote.fact_id);
  });

  it('useStateMirror does not own a local FootnoteData interface that shadows the canonical one', () => {
    // The canonical FootnoteData lives in src/types/payloads.ts and already
    // has `fact_id?: string`. The hook used to declare its own local
    // FootnoteData interface that omitted fact_id — that shadow was the
    // source of the synthetic-id bug. This test reads the source and fails
    // if the local shadow returns.
    const src = readFileSync(
      resolve(__dirname, '../useStateMirror.ts'),
      'utf-8',
    );
    // Hard rule: no local interface FootnoteData block in the hook.
    expect(src).not.toMatch(/^interface\s+FootnoteData\b/m);
    // Soft rule: the canonical type name should appear in the imports.
    // (Looser than a full path regex so reformat/alias swaps don't break.)
    expect(src).toMatch(/import[^;]*\bFootnoteData\b/);
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
  it('useStateMirror is imported AND called (not commented out) in App.tsx', () => {
    // Per CLAUDE.md "Verify Wiring, Not Just Existence" — a unit-tested hook
    // means nothing if no production code calls it. App.tsx is the wiring
    // anchor. Source-text checks are a weak form of wiring assertion
    // (a full App render would be stronger), so we layer multiple regexes
    // and an anti-pattern guard against commented-out calls.
    const appSrc = readFileSync(
      resolve(__dirname, '../../App.tsx'),
      'utf-8',
    );
    expect(appSrc).toMatch(/\buseStateMirror\b/);
    expect(appSrc).toMatch(/useStateMirror\s*\(/);
    // Negative guard: a commented-out call site would otherwise pass the
    // call regex above.
    expect(appSrc).not.toMatch(/\/\/[^\n]*\buseStateMirror\s*\(/);
  });

  it('end-to-end: a NARRATION fact_id reaches knowledge[] under the keyed shape KnowledgeJournal uses', () => {
    // KnowledgeJournal renders entries with `key={entry.fact_id}` (see
    // src/components/KnowledgeJournal.tsx). React keys must be the
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
        initialProps: { msgs: [playerAction(), turn1] },
      },
    );

    const afterTurn1 = result.current.state.knowledge.find(
      (e) => e.fact_id === factId,
    );
    expect(afterTurn1?.fact_id).toBe(factId);

    rerender({ msgs: [playerAction(), turn1, playerAction(), turn2] });

    const afterTurn2 = result.current.state.knowledge.filter(
      (e) => e.fact_id === factId,
    );
    // Per-fact dedupe holds across turns: one entry, narrator id, stable key.
    expect(afterTurn2).toHaveLength(1);
    expect(afterTurn2[0].fact_id).toBe(factId);
  });
});

// ---------------------------------------------------------------------------
// Drop path — footnotes without fact_id are skipped with console.warn
// ---------------------------------------------------------------------------

describe('useStateMirror 50-15 — drop path for missing fact_id', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('skips a footnote whose fact_id is missing and logs a warning', () => {
    const narration = narrationWithFootnotes([
      {
        marker: 1,
        // fact_id intentionally omitted — simulates partial narrator output.
        summary: 'An entry the server forgot to id.',
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

    expect(result.current.state.knowledge).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls[0]?.[0];
    expect(String(warnArgs)).toMatch(/fact_id/);
  });

  it('treats an empty-string fact_id as missing (skip + warn)', () => {
    const narration = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: '',
        summary: 'An entry with empty fact_id.',
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

    expect(result.current.state.knowledge).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('mixed batch: keeps footnotes with fact_id, drops those without', () => {
    const narration = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: 'fact-keeper',
        summary: 'Valid entry.',
        category: 'Lore',
        is_new: true,
      },
      {
        marker: 2,
        // missing fact_id — must be dropped, must not poison seenFactIds
        summary: 'Dropped entry.',
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

    expect(result.current.state.knowledge).toHaveLength(1);
    expect(result.current.state.knowledge[0].fact_id).toBe('fact-keeper');
    // useEffect replays the message list on each render (React's normal
    // dev-mode double-invoke), so the warn count may be a multiple of the
    // number of bad footnotes. Assert that it fired, not how many times.
    expect(warnSpy).toHaveBeenCalled();
  });
});
