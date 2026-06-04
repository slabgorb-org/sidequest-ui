import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { BeatImpactView, ConfrontationData } from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// Story 73-7 — opponent-side beat-impact legibility + numeric delta readout.
//
// 73-4 rendered only the PLAYER's beat impact (summary text, no number). A
// mechanics-first player (Sebastien / Jade) then watches their own crit move 0
// dials while the OPPONENT's damage visibly moves the dials — reading as unfair.
// The engine already records both sides; the server now also ships
// `opponent_last_beat_impact` on the CONFRONTATION payload (see
// test_opponent_beat_impact_payload.py). This overlay must render BOTH sides AND
// the raw numeric deltas, e.g. "you: <clean exit> · them: +2 pressure".
//
// CONTRACT PINNED HERE (DOM):
//   * The impact panel keeps its `data-testid="beat-impact"` container.
//   * A player-side numeric readout `data-testid="beat-impact-own"` renders the
//     own dial delta as a NUMBER (not just summary prose).
//   * An opponent-side readout `data-testid="beat-impact-opponent"` renders the
//     opponent's dial delta as a NUMBER — present only when the server sent one.
//   * Absent / null `opponent_last_beat_impact` → no opponent readout, no crash,
//     player side still renders (additive, legacy-safe).
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

// Summaries deliberately carry NO digit, so a passing numeric assertion proves the
// panel renders the actual `own` number — not just echoes the summary prose.
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

describe('Story 73-7: opponent-side beat-impact + numeric delta readout', () => {
  it('renders BOTH the own and opponent numeric deltas (you: … · them: +2)', () => {
    const data: ConfrontationData = {
      ...BASE,
      last_beat_impact: PLAYER_ADVANCE,
      opponent_last_beat_impact: OPPONENT_PRESS,
    };
    render(<ConfrontationOverlay data={data} />);

    // Container still present (73-4 regression).
    expect(screen.getByTestId('beat-impact')).toBeInTheDocument();

    // Player's own dial delta rendered as a NUMBER (summary has no digit).
    const own = screen.getByTestId('beat-impact-own');
    expect(own).toBeInTheDocument();
    expect(own).toHaveTextContent('3');

    // Opponent's dial delta rendered as a NUMBER — the "them: +2 pressure" half.
    const them = screen.getByTestId('beat-impact-opponent');
    expect(them).toBeInTheDocument();
    expect(them).toHaveTextContent('2');
  });

  it('keeps the two side readouts distinct (own number is not the opponent number)', () => {
    const data: ConfrontationData = {
      ...BASE,
      last_beat_impact: PLAYER_ADVANCE,
      opponent_last_beat_impact: OPPONENT_PRESS,
    };
    render(<ConfrontationOverlay data={data} />);

    // The player readout shows 3, NOT the opponent's 2 — no cross-contamination.
    expect(screen.getByTestId('beat-impact-own')).not.toHaveTextContent('2');
    // The opponent readout shows 2, NOT the player's 3.
    expect(screen.getByTestId('beat-impact-opponent')).not.toHaveTextContent('3');
  });

  it('renders no opponent readout when opponent_last_beat_impact is absent (undefined)', () => {
    const data: ConfrontationData = { ...BASE, last_beat_impact: PLAYER_ADVANCE };
    render(<ConfrontationOverlay data={data} />);

    // Player side still renders; opponent half simply omitted (legacy-safe).
    expect(screen.getByTestId('beat-impact')).toBeInTheDocument();
    expect(screen.getByTestId('beat-impact-own')).toHaveTextContent('3');
    expect(screen.queryByTestId('beat-impact-opponent')).not.toBeInTheDocument();
  });

  it('guards the null opponent path — explicit null renders no opponent readout and does not crash', () => {
    const data: ConfrontationData = {
      ...BASE,
      last_beat_impact: PLAYER_ADVANCE,
      opponent_last_beat_impact: null,
    };
    render(<ConfrontationOverlay data={data} />);

    expect(screen.getByTestId('beat-impact')).toBeInTheDocument();
    expect(screen.getByTestId('beat-impact-own')).toHaveTextContent('3');
    expect(screen.queryByTestId('beat-impact-opponent')).not.toBeInTheDocument();
  });
});
