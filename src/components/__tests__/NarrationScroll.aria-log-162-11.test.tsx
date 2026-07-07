import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NarrationScroll } from '../NarrationScroll';

// ═══════════════════════════════════════════════════════════
// Story 162-11 (RED) — real-UI ARIA fidelity for understudy perception.
//
// The understudy detectors read the narration a player perceives as `log:`
// lines in the aria snapshot (perception/snapshot.py; two_names_one_enemy pulls
// the narrated foe name out of the log). The live NarrationScroll surface is a
// plain scrollable div — no ARIA log role, no live region — so Playwright's
// aria_snapshot never emits `log:` and the narrated name is invisible to the
// detector on real sessions.
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
// RED today: NarrationScroll's container has neither role="log" nor aria-live.
// GREEN = the narration stream is a polite log live-region.
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
});
