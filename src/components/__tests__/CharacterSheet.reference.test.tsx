import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CharacterSheet } from '../CharacterSheet';
import type { CharacterSheetData, AbilityDefinition } from '../CharacterSheet';

const baseAbility: AbilityDefinition = {
  name: 'Cosh',
  genre_description: 'Bonk.',
  mechanical_effect: 'Stun.',
  involuntary: false,
  source: 'Class',
};

function makeData(overrides: Partial<CharacterSheetData> = {}): CharacterSheetData {
  return {
    name: 'Mr. Pip',
    class: 'Burglar',
    level: 1,
    stats: {},
    abilities: [],
    class_moves: [],
    backstory: '',
    ...overrides,
  };
}

describe('CharacterSheet reference hyperlinks', () => {
  it('renders an ability with reference_url as a target=_blank anchor', () => {
    render(<CharacterSheet data={makeData({
      abilities: [{ ...baseAbility, reference_url: '/reference/rules/p#class-burglar-signature-cosh' }],
    })} />);
    const link = screen.getByRole('link', { name: /cosh/i });
    expect(link).toHaveAttribute('href', '/reference/rules/p#class-burglar-signature-cosh');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel') ?? '').toMatch(/noopener/);
  });

  it('renders an ability without reference_url as plain text (no link)', () => {
    render(<CharacterSheet data={makeData({
      abilities: [{ ...baseAbility, reference_url: null }],
    })} />);
    expect(screen.queryByRole('link', { name: /cosh/i })).toBeNull();
    expect(screen.getByText(/cosh/i)).toBeInTheDocument();
  });

  it('renders an ability with no reference_url field at all (undefined) as plain text', () => {
    render(<CharacterSheet data={makeData({
      abilities: [baseAbility],   // reference_url omitted entirely
    })} />);
    expect(screen.queryByRole('link', { name: /cosh/i })).toBeNull();
  });

  it('renders the class label in the subtitle as an anchor when class_reference_url is set', () => {
    render(<CharacterSheet data={makeData({
      class: 'Burglar',
      class_reference_url: '/reference/rules/p#class-burglar',
    })} />);
    const link = screen.getByRole('link', { name: /burglar/i });
    expect(link).toHaveAttribute('href', '/reference/rules/p#class-burglar');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders the class label as plain text when class_reference_url is absent', () => {
    render(<CharacterSheet data={makeData({ class: 'Burglar' })} />);
    expect(screen.queryByRole('link', { name: /burglar/i })).toBeNull();
    expect(screen.getByText(/burglar/i)).toBeInTheDocument();
  });
});
