import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { BeatImpactView, ConfrontationData } from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// Story 73-13 FOLLOW-UPS (Reviewer findings, 2026-06-04 — non-blocking at the
// time, now closed):
//
//   (1) BeatHistoryLedger's opponent-acts-first behavior was UNASSERTED. The
//       73-13 fix relaxed the ledger gate and made the "You" row conditional, but
//       no test pinned `beat-history-ledger` in the opponent-only window. Pinned
//       here.
//
//   (2) VALENCE MISLABEL. In the opponent-only window the panel container drove
//       `data-effect` from the OPPONENT's BeatImpactView. The effect taxonomy
//       (advance/setback/backfire…) is PLAYER-relative, and `beat-impact-advance`
//       maps to `--encounter-player` (index.css), so an opponent 'advance' (they
//       pressed) rendered the panel in the PLAYER's win-green — reading as "you
//       advanced". The panel now emits `data-actor`, and CSS re-keys the
//       opponent-only state to `--encounter-opponent`, so it reads as "the enemy
//       acted on you" regardless of the opponent's player-relative effect.
//
// CONTRACT PINNED HERE (DOM):
//   * Ledger renders in the opponent-only window with ONLY the "Them" row.
//   * Ledger is suppressed when neither side has an impact (null/null AND
//     undefined/undefined).
//   * Ledger renders BOTH rows when both sides acted.
//   * The impact panel carries `data-actor="opponent"` iff the opponent acted and
//     the player did not; otherwise `data-actor="player"`.
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

const PLAYER_ADVANCE: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  resolution: false,
  tag: 'Opening',
  own: 3,
  opponent: 0,
  summary: 'Sharp Barb lands cleanly (Opening)',
};

// Opponent presses: their OWN effect is 'advance' (player-relative taxonomy), the
// exact value that used to borrow the player's win-green in the opponent-only
// window.
const OPPONENT_PRESS: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  resolution: false,
  tag: null,
  own: 2,
  opponent: 0,
  summary: 'Hamish presses the advantage',
};

describe('Story 73-13 follow-up: BeatHistoryLedger opponent-acts-first coverage', () => {
  it('renders the ledger with only the Them row when player impact is undefined', () => {
    render(<ConfrontationOverlay data={{ ...BASE, opponent_last_beat_impact: OPPONENT_PRESS }} />);

    const ledger = screen.getByTestId('beat-history-ledger');
    expect(ledger).toBeInTheDocument();
    expect(within(ledger).getByText('Them')).toBeInTheDocument();
    expect(within(ledger).queryByText('You')).not.toBeInTheDocument();
  });

  it('renders the ledger with only the Them row when player impact is explicit null', () => {
    render(
      <ConfrontationOverlay
        data={{ ...BASE, last_beat_impact: null, opponent_last_beat_impact: OPPONENT_PRESS }}
      />,
    );

    const ledger = screen.getByTestId('beat-history-ledger');
    expect(ledger).toBeInTheDocument();
    expect(within(ledger).getByText('Them')).toBeInTheDocument();
    expect(within(ledger).queryByText('You')).not.toBeInTheDocument();
  });

  it('suppresses the ledger when neither side has an impact (null/null and undefined/undefined)', () => {
    const { rerender } = render(
      <ConfrontationOverlay data={{ ...BASE, last_beat_impact: null, opponent_last_beat_impact: null }} />,
    );
    expect(screen.queryByTestId('beat-history-ledger')).not.toBeInTheDocument();

    rerender(<ConfrontationOverlay data={{ ...BASE }} />);
    expect(screen.queryByTestId('beat-history-ledger')).not.toBeInTheDocument();
  });

  it('renders both ledger rows when both sides have an impact', () => {
    render(
      <ConfrontationOverlay
        data={{ ...BASE, last_beat_impact: PLAYER_ADVANCE, opponent_last_beat_impact: OPPONENT_PRESS }}
      />,
    );

    const ledger = screen.getByTestId('beat-history-ledger');
    expect(within(ledger).getByText('You')).toBeInTheDocument();
    expect(within(ledger).getByText('Them')).toBeInTheDocument();
  });
});

describe('Story 73-13 follow-up: opponent-only panel valence (data-actor)', () => {
  it('marks the panel data-actor="opponent" when only the opponent has acted (undefined player)', () => {
    render(<ConfrontationOverlay data={{ ...BASE, opponent_last_beat_impact: OPPONENT_PRESS }} />);

    const panel = screen.getByTestId('beat-impact');
    expect(panel).toHaveAttribute('data-actor', 'opponent');
    // The opponent's own 'advance' effect must NOT silently borrow the player frame:
    // data-actor is the hook the CSS uses to re-key the color to --encounter-opponent.
    expect(panel).toHaveAttribute('data-effect', 'advance');
  });

  it('marks the panel data-actor="opponent" when only the opponent has acted (explicit null player)', () => {
    render(
      <ConfrontationOverlay
        data={{ ...BASE, last_beat_impact: null, opponent_last_beat_impact: OPPONENT_PRESS }}
      />,
    );

    expect(screen.getByTestId('beat-impact')).toHaveAttribute('data-actor', 'opponent');
  });

  it('marks the panel data-actor="player" when the player has acted (both sides present)', () => {
    render(
      <ConfrontationOverlay
        data={{ ...BASE, last_beat_impact: PLAYER_ADVANCE, opponent_last_beat_impact: OPPONENT_PRESS }}
      />,
    );

    expect(screen.getByTestId('beat-impact')).toHaveAttribute('data-actor', 'player');
  });

  it('marks the panel data-actor="player" when only the player has acted', () => {
    render(<ConfrontationOverlay data={{ ...BASE, last_beat_impact: PLAYER_ADVANCE }} />);

    expect(screen.getByTestId('beat-impact')).toHaveAttribute('data-actor', 'player');
  });
});
