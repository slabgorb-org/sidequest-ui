import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NarrationScroll } from '../NarrationScroll';
import { MessageType, type GameMessage } from '@/types/protocol';

function narration(text: string): GameMessage {
  return { type: MessageType.NARRATION, payload: { text }, player_id: 'p1' };
}

// ═══════════════════════════════════════════════════════════
// Story 162-11 — real-UI ARIA fidelity for understudy perception (shipped).
//
// The understudy detectors read the narration a player perceives as `log:`
// lines in the aria snapshot (perception/snapshot.py; two_names_one_enemy pulls
// the narrated foe name out of the log). Before this story, the live
// NarrationScroll surface was a plain scrollable div — no ARIA log role, no
// live region — so Playwright's aria_snapshot never emitted `log:` and the
// narrated name was invisible to the detector on real sessions. These tests pin
// the shape that closed that gap.
//
// CONTRACT PINNED HERE (production DOM):
//   * The narration stream is an ARIA `log` role, so aria_snapshot presents it
//     as `log:` (the token every narration-reading detector greps for).
//   * It is a POLITE live region (aria-live="polite"), so newly appended beats
//     are announced without stealing focus — the naive player "hears" the story
//     the way a screen-reader user would.
//   * The role sits on the narration stream surface itself (the scroll
//     container that accumulates every beat), not a transient child.
//
// The NarrationScroll container is a polite log live-region, and narrated text
// is a DESCENDANT of that log node (not a sibling) so aria_snapshot nests the
// prose under `log:`. (Rework round-trip 1 added the populated-content case
// after review found all tests rendered empty messages.)
// ═══════════════════════════════════════════════════════════

describe('[162-11] NarrationScroll narration surface is an ARIA log live-region', () => {
  it('exposes role="log" so aria_snapshot presents the narration as a log', () => {
    render(<NarrationScroll messages={[]} />);
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  it('is a polite live region so appended narration is announced', () => {
    render(<NarrationScroll messages={[]} />);
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
  });

  it('places the log role on the narration stream surface', () => {
    render(<NarrationScroll messages={[]} />);
    expect(screen.getByRole('log')).toHaveAttribute('data-testid', 'narration-scroll');
  });

  // Rework: prove narrated text is a DOM DESCENDANT of the log node — the whole
  // point of the fix is that aria_snapshot nests the prose under `log:`. A
  // refactor that moved segments to a SIBLING of the role="log" div would pass
  // the empty-message tests above but fail this one.
  it('renders narrated text inside the log region', () => {
    render(<NarrationScroll messages={[narration('Molgrath the Eyeless lunges at you from the dark.')]} />);
    const log = screen.getByRole('log');
    expect(within(log).getByText(/Molgrath the Eyeless lunges at you from the dark\./i)).toBeInTheDocument();
  });
});
