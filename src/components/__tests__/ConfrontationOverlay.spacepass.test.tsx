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
import type { DiceThrowParams } from '@/types/payloads';

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
  effect: 'advance', // valid BeatEffect member (Review: 'success' is not in the union)
  dial_moved: true,
  summary: 'Spot the Contradiction lands',
  own: 2, // dial Δ +2 for YOU
  opponent: 0,
  resolution: false,
  tag: null,
};

// For the opponent-row ledger test: the player advanced their OWN dial +3, and
// the opponent (a separate BeatImpactView) advanced THEIR OWN dial +2. In a
// BeatImpactView, `own` is the acting entity's own dial delta and `opponent` is
// the cross-effect inflicted on the OTHER side — semantics pinned by Story 73-7
// (opponentbeatimpact.test.tsx: beat-impact-opponent reads opponent.own). The
// ledger's "Them" row must therefore show the opponent's `own` (+2), NOT the
// cross-effect field (0).
const PLAYER_IMPACT: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  summary: 'Spot the Contradiction lands',
  own: 3, // YOU moved your own dial +3
  opponent: 0,
  resolution: false,
  tag: null,
};
const OPPONENT_IMPACT: BeatImpactView = {
  effect: 'advance',
  dial_moved: true,
  summary: 'The Queen presses her advantage',
  own: 2, // THEM moved their own dial +2 — this is what the Them row must show
  opponent: 0, // cross-effect on the player's dial (the WRONG field to display for Them)
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
    // in the panel. Reject any sub-headline micro size (≤ text-xs / 12px), AND
    // require a positively adequate size token (Review: negative-only let a
    // text-[11px]/text-xs refactor pass while still violating AC1).
    expect(youNumeral.className).not.toMatch(/text-\[(?:[0-9]|1[0-2])px\]/);
    expect(youNumeral.className).not.toMatch(/\btext-xs\b/);
    expect(youNumeral.className).toMatch(/\btext-(sm|base|lg|xl)\b/);
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
  // Typed mock (Review: bare vi.fn() lets DiceThrowParams drift silently).
  const onDiceThrow: (params: DiceThrowParams, face: number[]) => void = vi.fn();
  const diceProps = {
    playerId: 'p1',
    onDiceThrow,
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

  it('anchors the roll to the COMMITTED beat (the click must matter)', () => {
    render(<ConfrontationOverlay data={makeData()} {...diceProps} />);
    const anchor = screen.getByTestId('beat-roll-anchor');

    // Before any commit, the anchor must not yet claim a beat (Review: the old
    // test asserted only presence, which renders unconditionally — the click
    // was inert and the spatial coupling went unverified).
    expect(within(anchor).queryByText(/Spot the Contradiction/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Spot the Contradiction/ }));

    // After committing, the anchor identifies the beat it belongs to — beat →
    // roll → result is one spatial unit, not a detached lane.
    expect(within(anchor).getByText(/Spot the Contradiction/)).toBeInTheDocument();
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

  it('does NOT render the ledger before any beat has resolved', () => {
    // Negative case (Review): no last_beat_impact → no provenance to show, so the
    // ledger must be absent, not an empty shell.
    render(<ConfrontationOverlay data={makeData()} />);
    expect(screen.queryByTestId('beat-history-ledger')).toBeNull();
  });

  it('shows the resolved beat dial delta as a signed Δ', () => {
    render(
      <ConfrontationOverlay
        data={makeData({ last_beat_impact: LAST_IMPACT })}
      />,
    );
    const ledger = screen.getByTestId('beat-history-ledger');
    // Tightened (Review: /\+?2/ matched any stray "2"). The row must render the
    // dial movement as a signed delta "Δ+2" so the scoreboard change has a cause.
    expect(within(ledger).getByText(/Δ\+2/)).toBeInTheDocument();
  });

  it("shows the OPPONENT's own dial delta in the Them row, not their cross-effect", () => {
    // REGRESSION PIN (Review HIGH): the Them row must read the opponent impact's
    // `own` (their dial progress, +2), NOT `opponent` (cross-effect on the
    // player, 0). Mirrors BeatImpactPanel + the Story 73-7 contract.
    render(
      <ConfrontationOverlay
        data={makeData({
          last_beat_impact: PLAYER_IMPACT,
          opponent_last_beat_impact: OPPONENT_IMPACT,
        })}
      />,
    );
    const ledger = screen.getByTestId('beat-history-ledger');

    // The opponent pressed +2 on THEIR dial → the Them row shows Δ+2, never Δ+0.
    const themRow = within(ledger).getByText('Them').parentElement as HTMLElement;
    expect(themRow).toHaveTextContent(/Δ\+2/);
    expect(themRow).not.toHaveTextContent(/Δ\+0/);

    // Sanity: the You row shows the player's own +3 — the two sides don't cross.
    const youRow = within(ledger).getByText('You').parentElement as HTMLElement;
    expect(youRow).toHaveTextContent(/Δ\+3/);
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
    // The dial fill is THE animated dial element (transition-all). It must carry
    // a motion-reduce guard. (Review: the old if/else self-disarmed when no
    // animated node was found — this asserts the guard directly on known nodes,
    // so a future refactor that drops the guard fails loudly.)
    const fills = screen.getAllByTestId('metric-bar-fill');
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      expect(fill.className).toMatch(/motion-reduce:/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wiring — the new seams are reachable on the production render path.
//
// ConfrontationOverlay is consumed by the production GameBoard at
// GameBoard.tsx:543. GameBoard itself is not mounted here (its dockview +
// provider + hook weight is exercised by no unit test in the repo, and a full
// mount would be disproportionate for this cosmetic story). Per the project's
// established wiring idiom (src/__tests__/confrontation-wiring.test.tsx), we
// render the REAL component through GameBoard's exact prop surface and assert
// every new 85-1 seam co-renders on that live path.
// ═══════════════════════════════════════════════════════════════════════════

describe('Wiring — the space-pass seams render from the production component', () => {
  it('renders all 85-1 seams together via GameBoard’s prop surface', () => {
    const onBeatSelect = vi.fn();
    const onDiceThrow: (params: DiceThrowParams, face: number[]) => void = vi.fn();
    render(
      <ConfrontationOverlay
        data={makeData({ last_beat_impact: LAST_IMPACT })}
        onBeatSelect={onBeatSelect}
        playerId="p1"
        onDiceThrow={onDiceThrow}
        diceRequest={null}
        diceResult={null}
      />,
    );
    expect(screen.getByTestId('confrontation-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('dial-scoreboard')).toBeInTheDocument(); // A1
    expect(screen.getByTestId('beat-grid')).toBeInTheDocument(); // A2
    expect(screen.getByTestId('beat-roll-anchor')).toBeInTheDocument(); // A3
    expect(screen.getByTestId('beat-history-ledger')).toBeInTheDocument(); // A5
  });
});
