import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CharacterSheet } from '../CharacterSheet';
import type { AbilityDefinition } from '../CharacterSheet';

const makeAbility = (name: string): AbilityDefinition => ({
  name,
  genre_description: `${name} description.`,
  mechanical_effect: `${name} effect.`,
  involuntary: false,
  source: "Class",
});

const BASE_DATA = {
  name: 'Kael',
  class: 'Ranger',
  level: 3,
  stats: { strength: 14, dexterity: 18, constitution: 12, intelligence: 10, wisdom: 15, charisma: 8 },
  abilities: [makeAbility('Tracker'), makeAbility('Beast Companion')],
  class_moves: [] as string[],
  backstory: 'Born in the Ashwood, raised by wolves.',
  portrait_url: '/renders/kael.png',
};

describe('CharacterSheet', () => {
  it('renders the character name', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    expect(screen.getByText('Kael')).toBeInTheDocument();
  });

  it('renders character class and level', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    expect(screen.getByText(/Ranger/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('renders all stat values', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    for (const [stat, value] of Object.entries(BASE_DATA.stats)) {
      expect(screen.getByText(new RegExp(stat, 'i'))).toBeInTheDocument();
      expect(screen.getByText(String(value))).toBeInTheDocument();
    }
  });

  it('renders abilities list', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    expect(screen.getByText('Tracker')).toBeInTheDocument();
    expect(screen.getByText('Beast Companion')).toBeInTheDocument();
  });

  it('renders backstory text', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    expect(screen.getByText(/Born in the Ashwood/)).toBeInTheDocument();
  });

  it('renders portrait image with correct src', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/renders/kael.png');
  });

  it('renders without portrait when portrait_url is absent', () => {
    const dataNoPortrait = { ...BASE_DATA, portrait_url: undefined };
    render(<CharacterSheet data={dataNoPortrait} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // Should still render the rest
    expect(screen.getByText('Kael')).toBeInTheDocument();
  });

  it('renders with empty abilities list', () => {
    const dataNoAbilities = { ...BASE_DATA, abilities: [] };
    render(<CharacterSheet data={dataNoAbilities} />);
    expect(screen.getByText('Kael')).toBeInTheDocument();
  });

  it('renders with empty stats object', () => {
    const dataNoStats = { ...BASE_DATA, stats: {} };
    render(<CharacterSheet data={dataNoStats} />);
    expect(screen.getByText('Kael')).toBeInTheDocument();
  });

  it('has a root element with data-testid for overlay targeting', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    expect(screen.getByTestId('character-sheet')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Story 14-2: Player location on character sheet
// ---------------------------------------------------------------------------

describe('CharacterSheet — Story 14-2: current location', () => {
  const DATA_WITH_LOCATION = {
    ...BASE_DATA,
    current_location: 'The Rusty Cantina',
  };

  it('renders current_location when present', () => {
    render(<CharacterSheet data={DATA_WITH_LOCATION} />);
    expect(screen.getByText('The Rusty Cantina')).toBeInTheDocument();
  });

  it('renders location in a dedicated section or line', () => {
    render(<CharacterSheet data={DATA_WITH_LOCATION} />);
    // Location should have a testid for targeting
    expect(screen.getByTestId('character-location')).toBeInTheDocument();
    expect(screen.getByTestId('character-location')).toHaveTextContent('The Rusty Cantina');
  });

  it('renders gracefully when current_location is absent', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    // Should not crash, and no location section shown
    expect(screen.queryByTestId('character-location')).not.toBeInTheDocument();
    expect(screen.getByText('Kael')).toBeInTheDocument();
  });
});
