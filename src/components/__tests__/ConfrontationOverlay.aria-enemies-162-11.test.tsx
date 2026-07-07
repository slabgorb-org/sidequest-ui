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
// RED today: ConfrontationOverlay renders the roster as portrait chips with no
// region, no listitem roles, and no visible opponent name. GREEN = the opponent
// surface exposes the region + named listitems.
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
});
