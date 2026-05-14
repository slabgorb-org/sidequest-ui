/**
 * Confidence-propagation contract (ADR-100 Seam C):
 * footnote-derived entries default to 'Suspected'; a subsequent
 * JOURNAL_RESPONSE for the same fact_id overwrites with the server's
 * canonical confidence regardless of arrival order.
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
      text: 'A faint scratch on the parlour floor catches your eye.',
      footnotes,
    },
    player_id: playerId,
  };
}

function playerAction(playerId = 'p1'): GameMessage {
  return {
    type: MessageType.PLAYER_ACTION,
    payload: { text: 'I examine the parlour floor.' },
    player_id: playerId,
  };
}

function journalResponse(
  entries: Array<{
    fact_id: string;
    content: string;
    category: string;
    source: string;
    confidence: string;
    learned_turn: number;
  }>,
): GameMessage {
  return {
    type: MessageType.JOURNAL_RESPONSE,
    payload: { entries },
    player_id: 'server',
  };
}

// ---------------------------------------------------------------------------
// AC2 — Default behavior: footnote-derived entries default to 'Suspected'
// ---------------------------------------------------------------------------

describe('AC2: ephemeral default is Suspected', () => {
  it("a footnote with no follow-up JOURNAL_RESPONSE shows confidence='Suspected'", () => {
    const narration = narrationWithFootnotes([
      {
        marker: 1,
        fact_id: 'fact-scratch-floor',
        summary: 'A scratch in the parlour floorboards.',
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
    expect(entries[0].fact_id).toBe('fact-scratch-floor');
    expect(entries[0].confidence).toBe('Suspected');
  });
});

// ---------------------------------------------------------------------------
// AC3 — Canonical preserved: JOURNAL_RESPONSE confidence wins (no footnote)
// ---------------------------------------------------------------------------

describe('AC3: canonical confidence propagates', () => {
  it("JOURNAL_RESPONSE with confidence='Certain' yields a 'Certain' KnowledgeEntry", () => {
    const messages: GameMessage[] = [
      journalResponse([
        {
          fact_id: 'fact-tower-center',
          content: 'The Dark Tower stands at the center of the wasteland.',
          category: 'Lore',
          source: 'Discovery',
          confidence: 'Certain',
          learned_turn: 3,
        },
      ]),
    ];

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror(messages);
        return state;
      },
      { wrapper },
    );

    const entry = result.current.state.knowledge.find(
      (k) => k.fact_id === 'fact-tower-center',
    );
    expect(entry).toMatchObject({ confidence: 'Certain' });
  });

  it("JOURNAL_RESPONSE with confidence='Rumored' yields a 'Rumored' KnowledgeEntry", () => {
    const messages: GameMessage[] = [
      journalResponse([
        {
          fact_id: 'fact-rumor-treasure',
          content: 'A merchant claims treasure lies beneath the chapel.',
          category: 'Lore',
          source: 'Dialogue',
          confidence: 'Rumored',
          learned_turn: 2,
        },
      ]),
    ];

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror(messages);
        return state;
      },
      { wrapper },
    );

    const entry = result.current.state.knowledge.find(
      (k) => k.fact_id === 'fact-rumor-treasure',
    );
    expect(entry).toMatchObject({ confidence: 'Rumored' });
  });
});

// ---------------------------------------------------------------------------
// AC4 — Duality: footnote first, then canonical JOURNAL_RESPONSE
// ---------------------------------------------------------------------------

describe('AC4: confidence duality (canonical wins)', () => {
  it('NARRATION footnote then JOURNAL_RESPONSE for same fact_id upgrades confidence to canonical', () => {
    // Step 1: ephemeral footnote arrives mid-turn with no wire confidence.
    // Step 2: server JOURNAL_RESPONSE arrives later with canonical 'Certain'.
    // Expected: final state shows canonical 'Certain', not ephemeral default.
    const messages: GameMessage[] = [
      playerAction(),
      narrationWithFootnotes([
        {
          marker: 1,
          fact_id: 'fact-clue-shared-id',
          summary: 'A pawn-shop ticket dated last Tuesday.',
          category: 'Lore',
          is_new: true,
        },
      ]),
      journalResponse([
        {
          fact_id: 'fact-clue-shared-id',
          content: 'A pawn-shop ticket dated last Tuesday.',
          category: 'Lore',
          source: 'Discovery',
          confidence: 'Certain',
          learned_turn: 1,
        },
      ]),
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
      (k) => k.fact_id === 'fact-clue-shared-id',
    );
    // Exactly one entry per fact_id — no duplication, no fan-out.
    expect(entries).toHaveLength(1);
    // Canonical confidence overrides the ephemeral default.
    expect(entries[0].confidence).toBe('Certain');
  });

  it('canonical entry overrides ephemeral footnote source too (not just confidence)', () => {
    // The canonical JOURNAL_RESPONSE row IS authoritative — its fields
    // should win across the board, not just confidence. Source on a
    // footnote-derived entry defaults to 'Observation'; canonical
    // source is 'Discovery'. This catches partial-merge implementations
    // that only override confidence but leave stale source/category.
    const messages: GameMessage[] = [
      playerAction(),
      narrationWithFootnotes([
        {
          marker: 1,
          fact_id: 'fact-canonical-overrides-fields',
          summary: 'The chapel bell rings out of time with the tower clock.',
          category: 'Place',
          is_new: true,
        },
      ]),
      journalResponse([
        {
          fact_id: 'fact-canonical-overrides-fields',
          content: 'The chapel bell rings out of time with the tower clock.',
          category: 'Place',
          source: 'Discovery',
          confidence: 'Certain',
          learned_turn: 1,
        },
      ]),
    ];

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror(messages);
        return state;
      },
      { wrapper },
    );

    const entry = result.current.state.knowledge.find(
      (k) => k.fact_id === 'fact-canonical-overrides-fields',
    );
    expect(entry).toMatchObject({
      confidence: 'Certain',
      source: 'Discovery',
    });
  });

  it('canonical wins when JOURNAL_RESPONSE arrives BEFORE the matching footnote (reverse order)', () => {
    // Out-of-order replay safety: a JOURNAL_RESPONSE that lands
    // before the NARRATION that introduces its fact_id must not be
    // downgraded by the later footnote. Canonical confidence
    // 'Rumored' is chosen deliberately so a regression where the
    // footnote overwrites the canonical fails with a real
    // 'Rumored' vs 'Suspected' mismatch (not a same-value match
    // that survives on the seen-set path alone). Source and
    // content assertions guard against partial-merge regressions
    // where only confidence survives.
    const messages: GameMessage[] = [
      journalResponse([
        {
          fact_id: 'fact-out-of-order',
          content: 'A signet ring engraved with two crossed keys (server canonical).',
          category: 'Lore',
          source: 'Discovery',
          confidence: 'Rumored',
          learned_turn: 1,
        },
      ]),
      playerAction(),
      narrationWithFootnotes([
        {
          marker: 1,
          fact_id: 'fact-out-of-order',
          summary: 'A signet ring engraved with two crossed keys (narrator footnote).',
          category: 'Lore',
          is_new: true,
        },
      ]),
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
      (k) => k.fact_id === 'fact-out-of-order',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      confidence: 'Rumored',
      source: 'Discovery',
      content: 'A signet ring engraved with two crossed keys (server canonical).',
    });
  });
});

// ---------------------------------------------------------------------------
// no-regression — literal hardcode is gone from useStateMirror.ts
// ---------------------------------------------------------------------------

describe('no-regression: literal cast removed', () => {
  it("the literal `'Suspected' as Confidence` cast is gone from useStateMirror.ts", () => {
    // The default 'Suspected' confidence is sourced from one place
    // only — `validateConfidence(undefined)`. A literal cast bypasses
    // that contract and re-introduces a magic-string default; this
    // grep guards the single-source-of-truth invariant at the file
    // level so a careless re-introduction is a test failure, not a
    // silent playtest finding.
    const sourcePath = resolve(__dirname, '../useStateMirror.ts');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toMatch(/'Suspected'\s+as\s+Confidence/);
  });
});

// ---------------------------------------------------------------------------
// AC5 — Wiring: useStateMirror is imported by App AND canonical confidence
// round-trips into state.knowledge[].
// ---------------------------------------------------------------------------

describe('AC5: end-to-end wiring of canonical confidence', () => {
  it('App.tsx imports useStateMirror (the hook reaches production)', () => {
    // Without this import, useStateMirror is dead code and no
    // confidence propagation matters in production. Keeps the
    // wiring honest per CLAUDE.md: "Every test suite needs a
    // wiring test."
    const appPath = resolve(__dirname, '../../App.tsx');
    const appSource = readFileSync(appPath, 'utf8');
    expect(appSource).toMatch(/from\s+['"]@\/hooks\/useStateMirror['"]/);
    expect(appSource).toMatch(/useStateMirror\(/);
  });

  it('end-to-end: scenario clue mid-turn → confidence upgrades to canonical', () => {
    // Simulates the production flow described in the story:
    //  1. Player acts (PLAYER_ACTION)
    //  2. Narrator emits NARRATION with a footnote that introduces a
    //     scenario clue's fact_id — confidence defaults to Suspected.
    //  3. Server's scenario engine matches the clue and replies with
    //     JOURNAL_RESPONSE carrying KnownFact.confidence='Certain'.
    //  4. UI knowledge[] for that fact_id reflects the canonical
    //     confidence — the lie detector wins.
    const factId = 'scenario-clue-victoria-letter';
    const messages: GameMessage[] = [
      playerAction(),
      narrationWithFootnotes([
        {
          marker: 1,
          fact_id: factId,
          summary: 'A folded letter addressed to Victoria, half-burned.',
          category: 'Lore',
          is_new: true,
        },
      ]),
      journalResponse([
        {
          fact_id: factId,
          content: 'A folded letter addressed to Victoria, half-burned.',
          category: 'Lore',
          source: 'Discovery',
          confidence: 'Certain',
          learned_turn: 1,
        },
      ]),
    ];

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror(messages);
        return state;
      },
      { wrapper },
    );

    const clue = result.current.state.knowledge.find(
      (k) => k.fact_id === factId,
    );
    expect(clue).toMatchObject({ confidence: 'Certain' });
  });

  it("JOURNAL_RESPONSE with an unrecognized confidence falls back to 'Suspected'", () => {
    // The validator is the single source of truth for the default.
    // If a future regression bypassed validateConfidence on the
    // JOURNAL_RESPONSE path, a malformed server payload like
    // 'GARBAGE' would silently propagate to KnowledgeEntry as an
    // invalid Confidence — the TS type system cannot catch this at
    // runtime. This test exercises the validator safety net.
    const messages: GameMessage[] = [
      journalResponse([
        {
          fact_id: 'fact-bad-confidence',
          content: 'A note in an unfamiliar hand.',
          category: 'Lore',
          source: 'Discovery',
          confidence: 'GARBAGE',
          learned_turn: 1,
        },
      ]),
    ];

    const { result } = renderHook(
      () => {
        const state = useGameState();
        useStateMirror(messages);
        return state;
      },
      { wrapper },
    );

    const entry = result.current.state.knowledge.find(
      (k) => k.fact_id === 'fact-bad-confidence',
    );
    expect(entry).toMatchObject({ confidence: 'Suspected' });
  });
});
