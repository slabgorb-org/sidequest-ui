import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { BeatImpactView, ConfrontationData } from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// Story 73-14 — BeatImpactPanel you/them labels + signed numeric deltas.
//
// 73-7 made BeatImpactPanel render the raw `own` deltas for BOTH sides as bare
// integers in `beat-impact-own` / `beat-impact-opponent`. The only thing that
// tells a human which bare integer is whose is the DOM testid — invisible to a
// player. For mechanics-first players (Sebastien / Jade) two adjacent bare
// numbers ("3" "2") are ambiguous. This story disambiguates them, in the
// rendered text, two ways:
//   (AC1) a "you" text label travels with the own delta,
//   (AC2) a "them" text label travels with the opponent delta,
//   (AC3) each numeric delta carries an explicit sign: positives gain a leading
//         "+", negatives keep their natural ASCII "-".
//
// CONTRACT PINNED HERE (DOM):
//   * The label travels INSIDE the existing readout span — `beat-impact-own`
//     contains a /you/i label, `beat-impact-opponent` contains a /them/i label.
//     (Dev should reuse the file's existing SIDE_LABEL = {player:"You",
//     opponent:"Them"} — the assertions are case-insensitive so "You"/"Them"
//     satisfies them.)
//   * Labels are side-correct: the own readout never carries the THEM label and
//     vice-versa (guards a swapped-label regression).
//   * Sign is ASCII "+"/"-" (matches the existing LedgerRow precedent in the
//     same file: `delta > 0 ? ` + `${delta}` : `${delta}``), NOT a Unicode minus.
//   * The 73-7 numeric contract is preserved: the actual delta digit still
//     renders in each readout span (now alongside the label + sign).
//
// Regression budget: 73-4/73-7/73-9 assert delta digits via SUBSTRING
// toHaveTextContent('3' | '2' | '0') and 73-10 asserts only CSS/attributes — the
// label words carry no digits, so none of those four suites break.
// ═══════════════════════════════════════════════════════════

const BASE: ConfrontationData = {
  type: 'social_duel',
  label: 'Duel of Wits',
  category: 'social',
  actors: [
    { name: 'Inspector Pryce', role: 'duelist' },
    { name: 'Hamish', role: 'duelist' },
  ],
  player_metric: { name: 'barbs', current: 4, starting: 0, threshold: 7 },
  opponent_metric: { name: 'barbs', current: 3, starting: 0, threshold: 7 },
  beats: [
    { id: 'concede', label: 'Concede Gracefully', kind: 'push', base: 1, stat_check: 'Humour', resolution: true },
    { id: 'barb', label: 'Sharp Barb', kind: 'strike', base: 2, stat_check: 'Wit' },
  ],
  secondary_stats: null,
  genre_slug: 'tea_and_murder',
  mood: 'tension',
};

// Summaries carry NO digit and NO "you"/"them" word, so a passing label/number
// assertion proves the readout span itself rendered them — not echoed prose.
const PLAYER_ADVANCE: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  resolution: false,
  tag: 'Opening',
  own: 3,
  opponent: 0,
  summary: 'Sharp Barb lands cleanly (Opening)',
};

const OPPONENT_PRESS: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  resolution: false,
  tag: null,
  own: 2,
  opponent: 0,
  summary: 'Hamish presses the advantage',
};

const PLAYER_SETBACK: BeatImpactView = {
  effect: 'setback',
  dial_moved: true,
  resolution: false,
  tag: null,
  own: -2,
  opponent: 0,
  summary: 'The riposte stings — ground lost',
};

const INERT_ZERO: BeatImpactView = {
  effect: 'inert',
  dial_moved: false,
  resolution: false,
  tag: null,
  own: 0,
  opponent: 0,
  summary: 'No change — the beat landed but moved nothing',
};

function renderBothSides() {
  render(
    <ConfrontationOverlay
      data={{ ...BASE, last_beat_impact: PLAYER_ADVANCE, opponent_last_beat_impact: OPPONENT_PRESS }}
    />,
  );
}

describe('Story 73-14: you/them labels on the beat-impact readouts', () => {
  // ── AC1 / AC2: labels travel with the right side ──────────────────────────
  it('labels the own delta readout with a "you" label', () => {
    renderBothSides();
    expect(screen.getByTestId('beat-impact-own')).toHaveTextContent(/you/i);
  });

  it('labels the opponent delta readout with a "them" label', () => {
    renderBothSides();
    expect(screen.getByTestId('beat-impact-opponent')).toHaveTextContent(/them/i);
  });

  it('keeps the labels side-correct (own is not labelled THEM, opponent not labelled YOU)', () => {
    renderBothSides();
    // A swapped-label regression would put "them" on the own readout, etc.
    expect(screen.getByTestId('beat-impact-own')).not.toHaveTextContent(/them/i);
    expect(screen.getByTestId('beat-impact-opponent')).not.toHaveTextContent(/you/i);
  });
});

describe('Story 73-14: signed numeric deltas', () => {
  // ── AC3: explicit sign on each delta ──────────────────────────────────────
  it('renders a positive own delta with a leading "+" sign (+3, not bare 3)', () => {
    renderBothSides();
    expect(screen.getByTestId('beat-impact-own')).toHaveTextContent('+3');
  });

  it('renders a positive opponent delta with a leading "+" sign (+2, not bare 2)', () => {
    renderBothSides();
    expect(screen.getByTestId('beat-impact-opponent')).toHaveTextContent('+2');
  });

  it('renders a negative own delta with an ASCII "-" sign and no spurious "+"', () => {
    render(<ConfrontationOverlay data={{ ...BASE, last_beat_impact: PLAYER_SETBACK }} />);
    const own = screen.getByTestId('beat-impact-own');
    expect(own).toHaveTextContent('-2'); // ASCII hyphen-minus, not U+2212
    expect(own).not.toHaveTextContent('+'); // a setback must not read as a gain
  });

  // ── Rule #4 (lang-review null/undefined): own can be 0 — a valid value, not a
  // fallback. The sign guard must be `delta > 0` (no "+0"), and 0 must NOT be
  // coalesced away by a `||`-style bug — the digit still renders.
  it('renders a zero own delta as the digit 0 (valid value, not dropped)', () => {
    render(<ConfrontationOverlay data={{ ...BASE, last_beat_impact: INERT_ZERO }} />);
    expect(screen.getByTestId('beat-impact-own')).toHaveTextContent('0');
  });
});

describe('Story 73-14: 73-7 numeric contract preserved alongside labels/signs', () => {
  it('still renders the raw delta digits in each readout (no cross-contamination)', () => {
    renderBothSides();
    // 73-7 contract: own shows its own number (3), opponent shows its (2), and
    // the two never bleed into each other — now coexisting with labels + signs.
    const own = screen.getByTestId('beat-impact-own');
    const them = screen.getByTestId('beat-impact-opponent');
    expect(own).toHaveTextContent('3');
    expect(own).not.toHaveTextContent('2');
    expect(them).toHaveTextContent('2');
    expect(them).not.toHaveTextContent('3');
  });
});
