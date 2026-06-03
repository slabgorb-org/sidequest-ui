import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { ConfrontationData } from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// Story 73-4 — beat-kind impact legibility (player UI).
//
// The engine is correct: a `push` CritSuccess intentionally moves no dial
// (Clean Exit — resolves the confrontation). But the only mechanical readouts
// are the two dial bars + the dice tray, so a mechanics-first player (Sebastien
// / Jade) reads "best roll → dial +0" as broken. The server now ships a
// `last_beat_impact` descriptor on the CONFRONTATION payload (mirroring the
// existing `win_condition` / `player_hp` legibility additions); this overlay
// renders it so the no-dial-move crit reads as INTENDED.
//
// Field is additive — absent on legacy payloads, where the overlay behaves
// exactly as before.
// ═══════════════════════════════════════════════════════════

const BASE: ConfrontationData = {
  type: 'social_duel',
  label: 'Duel of Wits',
  category: 'social',
  actors: [
    { name: 'Inspector Pryce', role: 'duelist' },
    { name: 'Hamish', role: 'duelist' },
  ],
  // The exact repro: player dial frozen at 4/7 after a CritSuccess.
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

const RESOLUTION_IMPACT = {
  effect: 'resolution',
  dial_moved: false,
  resolution: true,
  tag: 'Clean Exit',
  own: 0,
  opponent: 0,
  summary: 'Clean Exit — resolves the confrontation (no dial change by design)',
};

describe('Story 73-4: beat-kind impact legibility', () => {
  it('renders an impact panel for a no-dial-move CritSuccess (push resolution)', () => {
    const data: ConfrontationData = { ...BASE, last_beat_impact: RESOLUTION_IMPACT };
    render(<ConfrontationOverlay data={data} />);
    const panel = screen.getByTestId('beat-impact');
    expect(panel).toBeInTheDocument();
    // The explanation is shown — not a bare 0 that reads as a broken roll.
    expect(panel).toHaveTextContent(/resolves the confrontation/i);
    expect(panel).toHaveTextContent(/no dial change by design/i);
  });

  it('tags the impact panel with the effect category so a crit reads as intended', () => {
    const data: ConfrontationData = { ...BASE, last_beat_impact: RESOLUTION_IMPACT };
    render(<ConfrontationOverlay data={data} />);
    // data-effect lets genre CSS render "resolution" as a GOOD outcome, distinct
    // from an inert Fail. The panel must NOT read as a failure.
    expect(screen.getByTestId('beat-impact')).toHaveAttribute('data-effect', 'resolution');
    expect(screen.getByTestId('beat-impact')).not.toHaveTextContent(/broken|failed/i);
  });

  it('does not render an impact panel when last_beat_impact is absent (legacy payload)', () => {
    render(<ConfrontationOverlay data={BASE} />);
    expect(screen.queryByTestId('beat-impact')).not.toBeInTheDocument();
  });

  it('still renders the dual dial bars alongside a dial-moving impact (AC4 no regression)', () => {
    const advance = {
      effect: 'advance',
      dial_moved: true,
      resolution: false,
      tag: 'Opening',
      own: 2,
      opponent: 0,
      summary: 'Sharp Barb lands — +2 to your edge (Opening)',
    };
    const data: ConfrontationData = { ...BASE, last_beat_impact: advance };
    render(<ConfrontationOverlay data={data} />);
    // The dials are NOT replaced by the impact panel — both render.
    expect(screen.getAllByTestId('metric-bar')).toHaveLength(2);
    const panel = screen.getByTestId('beat-impact');
    expect(panel).toHaveAttribute('data-effect', 'advance');
    expect(panel).toHaveTextContent(/Opening/);
  });

  it('renders resolution and inert zero-moves distinctly (not the same readout)', () => {
    const inert = {
      effect: 'inert',
      dial_moved: false,
      resolution: false,
      tag: null,
      own: 0,
      opponent: 0,
      summary: 'The barb misses — nothing lands.',
    };
    const { rerender } = render(
      <ConfrontationOverlay data={{ ...BASE, last_beat_impact: RESOLUTION_IMPACT }} />,
    );
    expect(screen.getByTestId('beat-impact')).toHaveAttribute('data-effect', 'resolution');

    rerender(<ConfrontationOverlay data={{ ...BASE, last_beat_impact: inert }} />);
    expect(screen.getByTestId('beat-impact')).toHaveAttribute('data-effect', 'inert');
  });
});
