import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { BeatImpactView, ConfrontationData } from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// Story 73-13 — BeatImpactPanel render-gate drops the opponent readout in the
// opponent-acts-first window.
//
// 73-7 added an opponent-side numeric readout (`beat-impact-opponent`) so a
// mechanics-first player (Sebastien / Jade) can SEE "the enemy hit you". But
// `ConfrontationOverlay` gates the WHOLE panel on the PLAYER's impact:
//
//     {data.last_beat_impact && (<BeatImpactPanel impact={data.last_beat_impact} ... />)}
//
// In the opponent-acts-first window — the legacy beat_selection path, a surprise
// round, or the player taking a non-combat action — `last_beat_impact` (player)
// is absent while `opponent_last_beat_impact` is present. The gate is then false
// and the panel (with its opponent readout) is suppressed entirely. The "enemy
// hit you" number 73-7 promised never renders.
//
// The reviewer corrected the earlier "unreachable" claim: narration_apply.py
// 4031-4055 preserves opponent-side selections and last_beat_impacts accumulates
// and never clears, so opponent-present / player-absent is genuinely reachable.
//
// CONTRACT PINNED HERE (DOM) — the gate must fire on (player || opponent):
//   * AC1 — panel container `data-testid="beat-impact"` renders when the OPPONENT
//           has an impact even if the player impact is absent (undefined OR null).
//   * AC2 — the opponent readout `data-testid="beat-impact-opponent"` renders the
//           opponent's dial delta as a NUMBER in that window ("the enemy hit you").
//   * AC3 — no regression: when NEITHER side has an impact, the panel stays
//           suppressed (no empty container).
//   * AC4 — when BOTH sides have an impact, both readouts render independently.
//
// 73-7's own "opponent absent" tests cover the INVERSE (player present / opponent
// absent). This file pins the missing direction.
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

// Summaries deliberately carry NO digit, so a passing numeric assertion proves
// the panel renders the actual `own` number — not just echoes summary prose.
const PLAYER_ADVANCE: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  resolution: false,
  tag: 'Opening',
  own: 3,
  opponent: 0,
  summary: 'Sharp Barb lands cleanly (Opening)',
};

// The opponent acts; the player has NOT acted yet. `own` is the opponent's own
// dial delta — the number that should surface as "the enemy hit you".
const OPPONENT_PRESS: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  resolution: false,
  tag: null,
  own: 2,
  opponent: 0,
  summary: 'Hamish presses the advantage',
};

describe('Story 73-13: opponent-acts-first render gate', () => {
  it('AC1+AC2: renders the panel + opponent readout when player impact is ABSENT (undefined)', () => {
    // Opponent-acts-first window: no player impact yet, opponent impact present.
    const data: ConfrontationData = {
      ...BASE,
      // last_beat_impact intentionally omitted (undefined).
      opponent_last_beat_impact: OPPONENT_PRESS,
    };
    render(<ConfrontationOverlay data={data} />);

    // AC1 — the panel must NOT be suppressed just because the player half is absent.
    expect(screen.getByTestId('beat-impact')).toBeInTheDocument();

    // AC2 — "the enemy hit you" readout is visible, rendering the opponent NUMBER.
    const them = screen.getByTestId('beat-impact-opponent');
    expect(them).toBeInTheDocument();
    expect(them).toHaveTextContent('2');
  });

  it('AC1+AC2: renders the panel + opponent readout when player impact is explicit NULL (legacy beat_selection path)', () => {
    const data: ConfrontationData = {
      ...BASE,
      last_beat_impact: null,
      opponent_last_beat_impact: OPPONENT_PRESS,
    };
    render(<ConfrontationOverlay data={data} />);

    expect(screen.getByTestId('beat-impact')).toBeInTheDocument();
    const them = screen.getByTestId('beat-impact-opponent');
    expect(them).toBeInTheDocument();
    expect(them).toHaveTextContent('2');
  });

  it('AC3: stays suppressed when NEITHER side has an impact (no empty panel)', () => {
    const data: ConfrontationData = {
      ...BASE,
      last_beat_impact: null,
      opponent_last_beat_impact: null,
    };
    render(<ConfrontationOverlay data={data} />);

    // Both impacts absent → the whole panel is correctly omitted, not an empty shell.
    expect(screen.queryByTestId('beat-impact')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beat-impact-opponent')).not.toBeInTheDocument();
  });

  it('AC3: stays suppressed when BOTH sides are undefined (legacy payload, before any beat)', () => {
    const data: ConfrontationData = { ...BASE };
    render(<ConfrontationOverlay data={data} />);

    expect(screen.queryByTestId('beat-impact')).not.toBeInTheDocument();
  });

  it('AC4: renders both readouts independently when BOTH sides have an impact', () => {
    const data: ConfrontationData = {
      ...BASE,
      last_beat_impact: PLAYER_ADVANCE,
      opponent_last_beat_impact: OPPONENT_PRESS,
    };
    render(<ConfrontationOverlay data={data} />);

    expect(screen.getByTestId('beat-impact')).toBeInTheDocument();
    // Player own delta shows 3, opponent shows 2 — no cross-contamination.
    expect(screen.getByTestId('beat-impact-own')).toHaveTextContent('3');
    expect(screen.getByTestId('beat-impact-opponent')).toHaveTextContent('2');
  });
});
