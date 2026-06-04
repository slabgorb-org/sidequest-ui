// ═══════════════════════════════════════════════════════════════════════════
// Story 85-1 — Confrontation panel legibility & layout pass (RED).
//
// These tests express the SIX acceptance criteria from
// docs/design/confrontation-space-usage.md Tier A (A1–A5 + Accessibility),
// folded into sprint/context/context-story-85-1.md. They are written to FAIL
// against the current ConfrontationOverlay (the cramped bottom-strip layout)
// and pass once the same-strip space pass lands. Pure UI — no protocol change.
//
// Test strategy note (see context-story-85-1.md "Assumptions"): the visual ACs
// are CSS/layout driven and jsdom does not lay out or compute contrast. Per the
// story context, structural assertions (data-testid contracts, Tailwind utility
// classes, DOM containment, accessible attributes) are the agreed proxy for the
// visual outcomes. Each test ties its assertion back to the AC it enforces.
// ═══════════════════════════════════════════════════════════════════════════

import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type {
  ConfrontationData,
  EncounterActor,
  EncounterMetric,
  BeatOption,
  BeatImpactView,
} from '../ConfrontationOverlay';

// ───────────────────────────────────────────────────────────
// Fixtures — a wonderland Audience/Trial confrontation (the L162 scene),
// with THEM at 0/10 (the dark-on-dark defect), a long-labelled beat (the
// caption-overflow defect), and a resolution/finisher beat.
// ───────────────────────────────────────────────────────────

const ACTORS: EncounterActor[] = [
  { name: 'Alice', role: 'defendant' },
  { name: "The Queen of Hearts", role: 'judge', portrait_url: '/portraits/queen.png' },
];

const PLAYER_METRIC: EncounterMetric = {
  name: 'standing',
  current: 4, // YOU 4/10
  starting: 0,
  threshold: 10,
};

const OPPONENT_METRIC: EncounterMetric = {
  name: 'standing',
  current: 0, // THEM 0/10 — must NOT be dark-on-dark / invisible (A1)
  starting: 0,
  threshold: 10,
};

// One beat with a deliberately long label + long risk caption — the text that
// overflowed its card in the playtest screenshot (A4).
const LONG_LABEL = 'Appeal to the Court’s Own Fairness Doctrine';
const LONG_RISK = 'The Queen may take it as insolence and call for your head';

const BEATS: BeatOption[] = [
  { id: 'spot', label: 'Spot the Contradiction', kind: 'press', base: 2, stat_check: 'WIT' },
  { id: 'state', label: 'State the Case', kind: 'press', base: 1, stat_check: 'PRESENCE' },
  { id: 'hold', label: 'Hold Your Nerve', kind: 'soak', base: 1, stat_check: 'NERVE' },
  { id: 'appeal', label: LONG_LABEL, kind: 'press', base: 2, stat_check: 'CHARM', risk: LONG_RISK },
  { id: 'refuse', label: 'Refuse the Premise', kind: 'finisher', base: 3, stat_check: 'WILL', resolution: true },
];

function makeData(overrides: Partial<ConfrontationData> = {}): ConfrontationData {
  return {
    type: 'trial',
    label: 'Audience / Trial',
    category: 'social',
    actors: ACTORS,
    player_metric: PLAYER_METRIC,
    opponent_metric: OPPONENT_METRIC,
    beats: BEATS,
    secondary_stats: null,
    genre_slug: 'wry_whimsy',
    mood: 'tension',
    ...overrides,
  };
}

const LAST_IMPACT: BeatImpactView = {
  effect: 'success',
  dial_moved: true,
  summary: 'Spot the Contradiction lands',
  own: 2, // dial Δ +2 for YOU
  opponent: 0,
  resolution: false,
  tag: null,
};

// ═══════════════════════════════════════════════════════════
// A1 — Dial as headline, not a hairline (closes L162 defect 1)
// ═══════════════════════════════════════════════════════════

describe('A1 — dial promoted to a tug-of-war scoreboard', () => {
  it('renders a dedicated bidirectional dial-scoreboard surface', () => {
    render(<ConfrontationOverlay data={makeData()} />);
    // Contract: the two dials become ONE bidirectional scoreboard headline
    // (YOU fills from the left, THEM from the right toward a center line),
    // not two independent hairline EdgeBars. This testid is the seam Dev adds.
    expect(screen.getByTestId('dial-scoreboard')).toBeInTheDocument();
  });

  it('shows THEM 0/10 as a legible, present numeral (not invisible)', () => {
    render(<ConfrontationOverlay data={makeData()} />);
    const board = screen.getByTestId('dial-scoreboard');
    // Both readouts must be present and readable. THEM=0 is the dark-on-dark
    // defect — assert the "0 / 10" numeral actually renders inside the board.
    expect(within(board).getByText(/0\s*\/\s*10/)).toBeInTheDocument();
    expect(within(board).getByText(/4\s*\/\s*10/)).toBeInTheDocument();
  });

  it('promotes the dial numerals out of the 9–10px micro size', () => {
    render(<ConfrontationOverlay data={makeData()} />);
    const board = screen.getByTestId('dial-scoreboard');
    const youNumeral = within(board).getByText(/4\s*\/\s*10/);
    // The single most important mechanical state must not be the smallest text
    // in the panel. Reject the current micro sizes used by EdgeBar.
    expect(youNumeral.className).not.toMatch(/text-\[(9|10)px\]/);
  });
});

// ═══════════════════════════════════════════════════════════
// A2 — BeatGrid auto-fill → auto-fit
// ═══════════════════════════════════════════════════════════

describe('A2 — beat grid stretches with auto-fit', () => {
  it('uses auto-fit (not auto-fill) so tiles fill the row', () => {
    render(<ConfrontationOverlay data={makeData()} />);
    const grid = screen.getByTestId('beat-grid');
    expect(grid.style.gridTemplateColumns).toContain('auto-fit');
    expect(grid.style.gridTemplateColumns).not.toContain('auto-fill');
    // Keep graceful wrapping.
    expect(grid.style.gridTemplateColumns).toContain('minmax(150px, 1fr)');
  });
});

// ═══════════════════════════════════════════════════════════
// A3 — Anchor the die to the committed beat (closes L162 defect 3)
// ═══════════════════════════════════════════════════════════

describe('A3 — die anchored to the beat that threw it', () => {
  const diceProps = {
    playerId: 'p1',
    onDiceThrow: vi.fn(),
    diceRequest: null,
    diceResult: null,
  };

  it('retires the disconnected fixed 200px die lane', () => {
    const { container } = render(
      <ConfrontationOverlay data={makeData()} {...diceProps} />,
    );
    // The lonely die void is a flex-shrink-0 column hard-set to width:200px,
    // sibling to the beats. The die must live with the beat instead.
    expect(container.querySelector('[style*="width: 200px"]')).toBeNull();
  });

  it('anchors the roll under the committed beat tile', () => {
    render(<ConfrontationOverlay data={makeData()} {...diceProps} />);
    const tile = screen.getByRole('button', { name: /Spot the Contradiction/ });
    fireEvent.click(tile);
    // beat → roll → result is one spatial unit: the roll anchor renders within
    // the committed tile's own row, not in a detached lane.
    const anchor = screen.getByTestId('beat-roll-anchor');
    expect(anchor).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// A4 — Caption wraps inside its card, never overflows (closes L162 defect 2)
// ═══════════════════════════════════════════════════════════

describe('A4 — beat caption wraps inside the tile', () => {
  it('does not clip the beat label with truncate (it must wrap/expand)', () => {
    render(<ConfrontationOverlay data={makeData()} />);
    const tile = screen.getByRole('button', { name: new RegExp(LONG_LABEL.slice(0, 12)) });
    const label = within(tile).getByText(LONG_LABEL);
    // `truncate` = overflow-hidden + ellipsis + nowrap: it HIDES the text rather
    // than letting it wrap. AC4 requires the full caption be readable in-tile.
    expect(label.className).not.toMatch(/\btruncate\b/);
    expect(label.className).not.toMatch(/whitespace-nowrap/);
  });
});

// ═══════════════════════════════════════════════════════════
// A5 — Reclaim the right void as a beat-history ledger
// ═══════════════════════════════════════════════════════════

describe('A5 — beat-history ledger gives the dial visible provenance', () => {
  it('renders a beat-history ledger region once a beat has resolved', () => {
    render(
      <ConfrontationOverlay
        data={makeData({ last_beat_impact: LAST_IMPACT })}
      />,
    );
    // Sebastien/Jade want to SEE the engine moved the dial, not trust the prose.
    const ledger = screen.getByTestId('beat-history-ledger');
    expect(ledger).toBeInTheDocument();
  });

  it('shows the dial delta for the resolved beat', () => {
    render(
      <ConfrontationOverlay
        data={makeData({ last_beat_impact: LAST_IMPACT })}
      />,
    );
    const ledger = screen.getByTestId('beat-history-ledger');
    // The most recent row must expose the dial movement (+2 here) so the
    // scoreboard change has a legible cause.
    expect(within(ledger).getByText(/\+?2/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// Accessibility (applies across the pass)
// ═══════════════════════════════════════════════════════════

describe('Accessibility — beats are a reachable, announced commit path', () => {
  it('gives each beat tile a visible focus ring', () => {
    render(<ConfrontationOverlay data={makeData()} />);
    const tile = screen.getByRole('button', { name: /State the Case/ });
    // Beat tiles are the ONLY commit path (plain Enter is locked) — keyboard
    // users must see where focus is.
    expect(tile.className).toMatch(/focus(-visible)?:/);
  });

  it('announces the locked-commit state via an aria-live hint', () => {
    const { container } = render(<ConfrontationOverlay data={makeData()} />);
    // A screen-reader user pressing Enter hits a silent dead-end today. There
    // must be a polite live region telling them to pick a beat.
    const live = container.querySelector('[aria-live]');
    expect(live).not.toBeNull();
    expect(live?.textContent ?? '').toMatch(/pick a beat/i);
  });

  it('labels the resolution beat distinctly, not by colour alone', () => {
    render(<ConfrontationOverlay data={makeData()} />);
    const finisher = screen.getByRole('button', { name: /Refuse the Premise/ });
    // The amber border is not enough — the win move needs an accessible name
    // that identifies it as a resolution/finisher beat.
    expect(finisher.getAttribute('aria-label') ?? '').toMatch(/resolution|finisher/i);
  });

  it('guards the dial animation behind prefers-reduced-motion', () => {
    render(<ConfrontationOverlay data={makeData()} />);
    // The dial pulse / die roll must respect prefers-reduced-motion. Today the
    // animated nodes (animate-pulse / transition-all) have no motion-reduce guard.
    const board = screen.getByTestId('dial-scoreboard');
    const animated = board.querySelector('[class*="animate-"], [class*="transition-"]');
    // If something animates in the scoreboard, it must carry a motion-reduce guard.
    if (animated) {
      expect(animated.className).toMatch(/motion-reduce:/);
    } else {
      // No animation in the scoreboard at all is also acceptable (nothing to guard).
      expect(animated).toBeNull();
    }
  });
});
