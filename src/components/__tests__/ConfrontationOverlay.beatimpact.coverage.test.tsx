import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { BeatImpactView, ConfrontationData } from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// Story 73-9 — beat-impact descriptor test-coverage hardening (UI).
//
// CHARACTERIZATION ONLY — no production change. These pin the CURRENT render
// behavior of the 73-4/73-7 BeatImpactPanel so a future refactor can't silently
// regress it. Two gaps the existing suites left open:
//   (AC5) the explicit-null player-impact path — what happens when the player
//         readout is null but an opponent readout exists.
//   (AC6) the inert-summary TEXT actually renders legibly (not [object Object],
//         not empty) — existing tests only assert the data-effect attribute.
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

const INERT_IMPACT: BeatImpactView = {
  effect: 'inert',
  dial_moved: false,
  resolution: false,
  tag: null,
  own: 0,
  opponent: 0,
  summary: 'No change — the beat landed but moved nothing',
};

const OPPONENT_IMPACT: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  resolution: false,
  tag: null,
  own: 2,
  opponent: 0,
  summary: 'Hamish presses the advantage',
};

describe('Story 73-9: beat-impact coverage hardening (UI characterization)', () => {
  // ── AC5: explicit-null player impact ──────────────────────────────────────
  it('does not crash when player impact is null even with a valid opponent impact', () => {
    // CURRENT behavior: the panel is gated on `data.last_beat_impact` (the player
    // readout). With it null, the whole panel is omitted — no crash, but the
    // opponent readout is NOT surfaced. Showing the opponent half when the player
    // half is absent is tracked separately as the 73-13 bug (a production change,
    // out of scope for this test-only story). This pins what ships TODAY.
    expect(() =>
      render(
        <ConfrontationOverlay
          data={{ ...BASE, last_beat_impact: null, opponent_last_beat_impact: OPPONENT_IMPACT }}
        />,
      ),
    ).not.toThrow();

    // Panel gated off → no player section, no opponent section, no malformed shell.
    expect(screen.queryByTestId('beat-impact')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beat-impact-own')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beat-impact-opponent')).not.toBeInTheDocument();
  });

  // ── AC6: inert-summary text renders legibly ───────────────────────────────
  it('renders the inert summary as legible text (not [object Object], not empty)', () => {
    render(<ConfrontationOverlay data={{ ...BASE, last_beat_impact: INERT_IMPACT }} />);

    const panel = screen.getByTestId('beat-impact');
    expect(panel).toHaveAttribute('data-effect', 'inert');
    // The actual summary STRING renders — not a stringified object, not empty.
    expect(panel).toHaveTextContent('No change — the beat landed but moved nothing');
    expect(panel).not.toHaveTextContent('[object Object]');
    expect(panel.textContent?.trim()).not.toBe('');
  });

  it('renders the inert own delta (0) without crashing on a zero-effect impact', () => {
    // The numeric readout path (73-7) must handle a zero own delta legibly.
    render(<ConfrontationOverlay data={{ ...BASE, last_beat_impact: INERT_IMPACT }} />);
    expect(screen.getByTestId('beat-impact-own')).toHaveTextContent('0');
  });
});
