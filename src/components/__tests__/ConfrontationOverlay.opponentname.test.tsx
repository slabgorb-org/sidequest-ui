import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { ConfrontationData } from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// sq-playtest 2026-06-10 [UX] — raw snake_case opponent id leaks to the player.
//
// A runtime-seated opponent with no known name carries a slug as its
// `actor.name` (e.g. "unknown_dark_contact"). `actor.name` is the canonical
// entity id (tag targets / last_beat_impacts keys reference it), so it must NOT
// be rewritten — but the "Them" card rendered it verbatim, showing
// "unknown_dark_contact" to the player for the whole fight. The presentation
// layer must humanize slug-like names (de-underscore + title-case) at display,
// exactly as the spell-id picker already does client-side.
//
// CONTRACT PINNED HERE (DOM):
//   * The Them panel shows the humanized label "Unknown Dark Contact".
//   * The raw slug "unknown_dark_contact" never appears as visible text.
//   * An already-humanized real name passes through UNCHANGED — the transform
//     only capitalizes the first letter of each segment, never lowercases the
//     rest, so "Kanga Moana-Teru" is not mangled.
// ═══════════════════════════════════════════════════════════

const BASE: ConfrontationData = {
  type: 'dogfight',
  label: 'Fighter Duel',
  category: 'vehicle',
  actors: [
    { name: 'Groucho', role: 'pilot', side: 'player' },
    { name: 'unknown_dark_contact', role: 'pilot', side: 'opponent' },
  ],
  player_metric: { name: 'energy', current: 7, starting: 0, threshold: 30 },
  opponent_metric: { name: 'energy', current: 25, starting: 0, threshold: 30 },
  beats: [],
  secondary_stats: null,
  genre_slug: 'space_opera',
  mood: 'tension',
};

describe('[UX] opponent name humanization in the Them panel', () => {
  it('renders the humanized label, not the raw snake_case id', () => {
    render(<ConfrontationOverlay data={BASE} />);

    const panel = screen.getByTestId('confrontation-them-panel');
    expect(panel).toHaveTextContent('Unknown Dark Contact');
    expect(panel).not.toHaveTextContent('unknown_dark_contact');
  });

  it('leaves an already-humanized real name unchanged (no mangling)', () => {
    const data: ConfrontationData = {
      ...BASE,
      actors: [
        { name: 'Groucho', role: 'pilot', side: 'player' },
        { name: 'Kanga Moana-Teru', role: 'pilot', side: 'opponent' },
      ],
    };
    render(<ConfrontationOverlay data={data} />);

    const panel = screen.getByTestId('confrontation-them-panel');
    expect(panel).toHaveTextContent('Kanga Moana-Teru');
  });
});
