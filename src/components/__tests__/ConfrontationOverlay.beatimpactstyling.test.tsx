import { render } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type { BeatImpactView, ConfrontationData } from '../ConfrontationOverlay';
// Vite ?raw import — the ACTUAL shipped stylesheet, so deleting/flattening a rule
// makes this test fail (an unstyled regression is CAUGHT, not silently passed).
import beatImpactCss from '../../styles/beat-impact.css?raw';

// ═══════════════════════════════════════════════════════════
// Story 73-10 — distinct beat-impact effect styling.
//
// BeatImpactPanel emits `data-effect` with six values, but unstyled they render
// alike — defeating the legibility goal for mechanics-first players. This pins:
//   (AC1) a rule exists for all six data-effect values,
//   (AC2) the three "zero-ish" cases (resolution/inert/setback) are visually
//         DISTINCT from each other — distinct colored border AND distinct glyph,
//   (AC4) the styling actually targets the attributes the component emits, so an
//         unstyled regression fails the test.
// We read the DECLARED styling from the CSSOM (not getComputedStyle: jsdom does
// not resolve var() in computed values, and these colors are theme tokens).
// ═══════════════════════════════════════════════════════════

const EFFECTS = ['resolution', 'inert', 'setback', 'advance', 'tag', 'backfire'] as const;
const ZERO_ISH = ['resolution', 'inert', 'setback'] as const;

const norm = (sel: string) => sel.replace(/["'\s]/g, '');

interface EffectStyle {
  borderLeftColor: string;
  glyph: string;
}

let styleEl: HTMLStyleElement;
const byEffect: Record<string, EffectStyle> = {};

beforeAll(() => {
  styleEl = document.createElement('style');
  styleEl.textContent = beatImpactCss;
  document.head.appendChild(styleEl);

  const sheet = styleEl.sheet;
  if (!sheet) throw new Error('beat-impact.css did not parse into a stylesheet');

  for (const rule of Array.from(sheet.cssRules)) {
    if (!(rule instanceof CSSStyleRule)) continue;
    const sel = norm(rule.selectorText);
    for (const effect of EFFECTS) {
      const base = `.beat-impact[data-effect=${effect}]`;
      if (sel === base) {
        (byEffect[effect] ??= { borderLeftColor: '', glyph: '' }).borderLeftColor =
          rule.style.getPropertyValue('border-left-color').trim();
      } else if (sel === `${base}::before`) {
        (byEffect[effect] ??= { borderLeftColor: '', glyph: '' }).glyph = rule.style
          .getPropertyValue('content')
          .trim();
      }
    }
  }
});

afterAll(() => {
  styleEl.remove();
});

describe('Story 73-10: distinct beat-impact effect styling', () => {
  it('ships a styled rule (colored border + glyph) for all six data-effect values', () => {
    for (const effect of EFFECTS) {
      expect(byEffect[effect], `no rule for data-effect="${effect}"`).toBeDefined();
      expect(byEffect[effect].borderLeftColor, `${effect} has no border-left-color`).not.toBe('');
      expect(byEffect[effect].glyph, `${effect} has no leading glyph`).not.toBe('');
    }
  });

  it('makes the three zero-ish cases (resolution/inert/setback) distinct in COLOR', () => {
    const colors = ZERO_ISH.map((e) => byEffect[e].borderLeftColor);
    expect(new Set(colors).size, `resolution/inert/setback share a border color: ${colors.join(' | ')}`).toBe(3);
  });

  it('makes the three zero-ish cases distinct in GLYPH (colorblind-safe channel)', () => {
    const glyphs = ZERO_ISH.map((e) => byEffect[e].glyph);
    expect(new Set(glyphs).size, `resolution/inert/setback share a glyph: ${glyphs.join(' | ')}`).toBe(3);
  });

  it('derives colors from theme tokens (ADR-079) rather than hardcoding hex', () => {
    // Each zero-ish border color references a --beat-impact-* token, so a genre
    // palette override recolors the panel instead of clashing.
    for (const effect of ZERO_ISH) {
      expect(byEffect[effect].borderLeftColor).toContain('var(--beat-impact-');
    }
  });

  it('targets the attributes the component actually emits (CSS↔render wiring)', () => {
    const base: ConfrontationData = {
      type: 'social_duel',
      label: 'Duel of Wits',
      category: 'social',
      actors: [
        { name: 'Inspector Pryce', role: 'duelist' },
        { name: 'Hamish', role: 'duelist' },
      ],
      player_metric: { name: 'barbs', current: 4, starting: 0, threshold: 7 },
      opponent_metric: { name: 'barbs', current: 3, starting: 0, threshold: 7 },
      beats: [],
      secondary_stats: null,
      genre_slug: 'tea_and_murder',
      mood: 'tension',
    };
    const impact: BeatImpactView = {
      effect: 'resolution',
      dial_moved: false,
      resolution: true,
      tag: 'Clean Exit',
      own: 0,
      opponent: 0,
      summary: 'Clean Exit — resolves the confrontation (no dial change by design)',
    };
    const { container } = render(<ConfrontationOverlay data={{ ...base, last_beat_impact: impact }} />);
    // The exact selector the stylesheet styles must match the rendered DOM.
    expect(container.querySelector('.beat-impact[data-effect="resolution"]')).not.toBeNull();
  });
});
