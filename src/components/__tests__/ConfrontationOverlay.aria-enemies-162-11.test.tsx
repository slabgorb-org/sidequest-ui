import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { ConfrontationData } from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// Story 162-11 (RED) — real-UI ARIA fidelity for understudy perception.
//
// The understudy `two_names_one_enemy` detector (162-7) reads the aria snapshot
// a player perceives and looks for a `region "Enemies"` whose foes are
// `listitem`s. sidequest-understudy's fixture stubs those tokens, so the
// detector passes in the fixture but returns None on every REAL session — the
// live ConfrontationOverlay exposes no such region and the opponent's name is
// carried only in a portrait `title`, never as perceivable listitem text.
//
// CONTRACT PINNED HERE (production DOM — what Playwright aria_snapshot sees):
//   * The foes are wrapped in an ARIA region whose accessible name is "Enemies".
//   * Each opponent is a `listitem` whose text carries the opponent's name, so a
//     screen reader / outsider tool can read the foe by name.
//   * The region is scoped to FOES ONLY — a player actor is never inside it
//     (a region labelled "Enemies" containing the player would be a lie AND
//     would break the detector's "exactly one foe" inference).
//
// The opponent surface exposes the region + named listitems; the decorative
// portrait chip is aria-hidden so its initial glyph never contaminates the
// perceived foe name; and the foe listitems live inside a `role="list"`
// (aria-required-parent). (Rework round-trip 1 added the aria-hidden guard, the
// list-parent, and the multi-foe case after review found the clean-name
// property untested.)
// ═══════════════════════════════════════════════════════════

const DATA: ConfrontationData = {
  type: 'combat',
  label: 'Ambush in the Dark',
  category: 'combat',
  actors: [
    { name: 'Rux', role: 'fighter', side: 'player' },
    { name: 'Thief', role: 'thug', side: 'opponent' },
  ],
  player_metric: { name: 'resolve', current: 0, starting: 0, threshold: 30 },
  opponent_metric: { name: 'menace', current: 0, starting: 0, threshold: 30 },
  beats: [],
  secondary_stats: null,
  genre_slug: 'caverns_and_claudes',
  mood: 'tension',
};

describe('[162-11] ConfrontationOverlay exposes an "Enemies" ARIA region with named listitem foes', () => {
  it('renders an accessible region named "Enemies"', () => {
    render(<ConfrontationOverlay data={DATA} />);
    expect(screen.getByRole('region', { name: /enemies/i })).toBeInTheDocument();
  });

  it('lists each opponent as a perceivable listitem carrying its name', () => {
    render(<ConfrontationOverlay data={DATA} />);
    const enemies = screen.getByRole('region', { name: /enemies/i });
    const items = within(enemies).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((li) => /thief/i.test(li.textContent ?? ''))).toBe(true);
  });

  it('scopes the Enemies region to foes — the player is not inside it', () => {
    render(<ConfrontationOverlay data={DATA} />);
    const enemies = screen.getByRole('region', { name: /enemies/i });
    expect(within(enemies).queryByText(/rux/i)).toBeNull();
  });

  // Rework: the story's central property — a CLEAN perceived foe name. The
  // portrait chip renders the foe's initial ("T") as a visual fallback; it must
  // be aria-hidden so Playwright's aria_snapshot reads `listitem: Thief`, not
  // `listitem: T Thief` (which would false-fork the detector on consistent
  // naming). Review found NO test guarded this: asserting textContent alone
  // stays green when aria-hidden is removed. This test fails on that regression.
  it('hides the decorative portrait so the initial glyph never contaminates the foe name', () => {
    render(<ConfrontationOverlay data={DATA} />);
    const enemies = screen.getByRole('region', { name: /enemies/i });
    const item = within(enemies)
      .getAllByRole('listitem')
      .find((li) => /thief/i.test(li.textContent ?? ''))!;
    expect(within(item).getByTestId('actor-portrait')).toHaveAttribute('aria-hidden', 'true');
    // the clean foe name is the listitem's perceivable text (the sr-only span)
    expect(within(item).getByText('Thief')).toBeInTheDocument();
  });

  // Rework: `role="listitem"` requires a `list`/`group` ancestor (WCAG 1.3.1
  // aria-required-parent). RED until the foe listitems are wrapped in a
  // `role="list"` inside the Enemies region.
  it('wraps the foe listitems in a list (aria-required-parent)', () => {
    render(<ConfrontationOverlay data={DATA} />);
    const enemies = screen.getByRole('region', { name: /enemies/i });
    const list = within(enemies).getByRole('list');
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  // Rework: each foe in a multi-opponent confrontation gets its own listitem —
  // the detector counts listitems to infer "exactly one foe", so per-foe
  // granularity is load-bearing.
  it('gives each foe its own listitem in a multi-opponent confrontation', () => {
    const data: ConfrontationData = {
      ...DATA,
      actors: [
        { name: 'Rux', role: 'fighter', side: 'player' },
        { name: 'Thief', role: 'thug', side: 'opponent' },
        { name: 'Cutpurse', role: 'thug', side: 'opponent' },
      ],
    };
    render(<ConfrontationOverlay data={data} />);
    const enemies = screen.getByRole('region', { name: /enemies/i });
    const items = within(enemies).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items.some((li) => /thief/i.test(li.textContent ?? ''))).toBe(true);
    expect(items.some((li) => /cutpurse/i.test(li.textContent ?? ''))).toBe(true);
  });
});
