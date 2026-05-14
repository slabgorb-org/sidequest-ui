/**
 * Story 50-16: Journal UI confidence propagation — drop hardcoded
 * 'Suspected' in useStateMirror, source from JOURNAL_RESPONSE
 * (ADR-100 Seam C UI part 2).
 *
 * Today (RED state):
 *   useStateMirror.ts:~194 casts a literal `'Suspected' as Confidence`
 *   on every footnote-derived KnowledgeEntry. The downstream
 *   JOURNAL_RESPONSE handler skips already-seen fact_ids
 *   (`if (seenFactIds.has(entry.fact_id)) continue;`), so a footnote
 *   that lands first locks the confidence at `'Suspected'` forever —
 *   the canonical server confidence is silently dropped. Per ADR-100
 *   Seam C UI part 2, the canonical journal must win.
 *
 * Klinger's call (recorded in the session): ephemeral footnotes still
 * default to `'Suspected'` while awaiting canonical refresh; the
 * JOURNAL_RESPONSE handler is what overrides with truth.
 *
 * ACs (failing tests must drive implementation):
 *   AC2 — default: footnote-derived entries with no canonical follow-up
 *         still show `'Suspected'` (regression guard for the default).
 *   AC3 — canonical preserved: JOURNAL_RESPONSE confidence propagates
 *         to the KnowledgeEntry verbatim.
 *   AC4 — duality (the key test): NARRATION footnote first, then
 *         JOURNAL_RESPONSE for the same fact_id, canonical wins.
 *   AC4 — reverse order: JOURNAL_RESPONSE first, then NARRATION
 *         footnote, canonical wins regardless of arrival order.
 *   AC5 — wiring: useStateMirror is imported by App; canonical
 *         confidence round-trips into knowledge[].
 *   no-regression — literal `'Suspected' as Confidence` cast is gone
 *         from useStateMirror.ts (file-level grep).
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

describe('useStateMirror 50-16 — AC2: ephemeral default is Suspected', () => {
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

describe('useStateMirror 50-16 — AC3: canonical confidence propagates', () => {
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
    expect(entry).toBeDefined();
    expect(entry!.confidence).toBe('Certain');
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
    expect(entry).toBeDefined();
    expect(entry!.confidence).toBe('Rumored');
  });
});

// ---------------------------------------------------------------------------
// AC4 — Duality: footnote first, then canonical JOURNAL_RESPONSE
// ---------------------------------------------------------------------------

describe('useStateMirror 50-16 — AC4: confidence duality (canonical wins)', () => {
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
    expect(entry).toBeDefined();
    expect(entry!.confidence).toBe('Certain');
    expect(entry!.source).toBe('Discovery');
  });

  it('canonical wins when JOURNAL_RESPONSE arrives BEFORE the matching footnote (reverse order)', () => {
    // Out-of-order replay safety: a JOURNAL_RESPONSE that lands
    // before the NARRATION that introduces its fact_id should NOT
    // be downgraded back to 'Suspected' when the footnote later
    // arrives. Canonical wins regardless of arrival order.
    const messages: GameMessage[] = [
      journalResponse([
        {
          fact_id: 'fact-out-of-order',
          content: 'A signet ring engraved with two crossed keys.',
          category: 'Lore',
          source: 'Discovery',
          confidence: 'Certain',
          learned_turn: 1,
        },
      ]),
      playerAction(),
      narrationWithFootnotes([
        {
          marker: 1,
          fact_id: 'fact-out-of-order',
          summary: 'A signet ring engraved with two crossed keys.',
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
    expect(entries[0].confidence).toBe('Certain');
  });
});

// ---------------------------------------------------------------------------
// no-regression — literal hardcode is gone from useStateMirror.ts
// ---------------------------------------------------------------------------

describe('useStateMirror 50-16 — no-regression: literal cast removed', () => {
  it("the literal `'Suspected' as Confidence` cast is gone from useStateMirror.ts", () => {
    // Story 50-16 explicitly drops the hardcoded cast at line ~194.
    // A future regression that reintroduces the literal would silently
    // break the canonical-wins behavior. This file-level guard makes
    // such a regression a test failure rather than a playtest finding.
    const sourcePath = resolve(__dirname, '../useStateMirror.ts');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toMatch(/'Suspected'\s+as\s+Confidence/);
  });
});

// ---------------------------------------------------------------------------
// AC5 — Wiring: useStateMirror is imported by App AND canonical confidence
// round-trips into state.knowledge[].
// ---------------------------------------------------------------------------

describe('useStateMirror 50-16 — AC5: end-to-end wiring of canonical confidence', () => {
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
    expect(clue).toBeDefined();
    expect(clue!.confidence).toBe('Certain');
  });
});
