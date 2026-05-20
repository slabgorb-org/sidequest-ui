import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CharacterSheet } from '../CharacterSheet';
import type { AbilityDefinition, CharacterSheetData } from '../CharacterSheet';

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

// ---------------------------------------------------------------------------
// Story 56-1: Show controlling player's name on character displays (MP only)
//
// AC-2: CharacterSheet header shows the controlling player's name when the
//       sheet data carries a non-empty player_id.
// AC-4: SP path (no player_id) renders no player-name treatment.
// AC-5: NPC sheets (empty player_id) likewise render no suffix.
//
// Implementation assumption: CharacterSheet's `data` (CharacterSheetData)
// grows an optional `player_id` field. The component renders the player's
// name as a secondary-weight label inside the existing sheet header (the
// flex row at CharacterSheet.tsx:52-71). MP-detection lives in App.tsx —
// the component itself only checks "is player_id non-empty?"
// ---------------------------------------------------------------------------

type CharacterSheetDataWithPlayer = CharacterSheetData & { player_id?: string };

describe('CharacterSheet — Story 56-1: controlling player name (MP)', () => {
  it('AC-2: renders the controlling player name in the sheet header', () => {
    const data: CharacterSheetDataWithPlayer = {
      ...BASE_DATA,
      player_id: 'James',
    };
    render(<CharacterSheet data={data} />);
    const sheet = screen.getByTestId('character-sheet');
    // Header is the flex row containing the character name (line 52-71 of
    // CharacterSheet.tsx). Assert the player name is present somewhere
    // visible in the sheet — anchored under the sheet testid so we don't
    // race with any future sibling rendering.
    expect(within(sheet).getByText(/James/)).toBeInTheDocument();
  });

  it('AC-2: empty player_id renders no suffix and no dangling separator', () => {
    const data: CharacterSheetDataWithPlayer = {
      ...BASE_DATA,
      player_id: '',
    };
    render(<CharacterSheet data={data} />);
    const sheet = screen.getByTestId('character-sheet');
    // Negative: no em-dash + nothing trailing pattern. If the
    // implementation uses parentheses, also guard against that:
    expect(sheet.textContent ?? '').not.toMatch(/—\s*$/);
    expect(sheet.textContent ?? '').not.toMatch(/\(\s*\)/);
    expect(sheet.textContent ?? '').not.toMatch(/—\s*undefined/i);
    expect(sheet.textContent ?? '').not.toMatch(/—\s*null/i);
  });

  it('AC-4: absent player_id renders no player-name treatment (single-player path)', () => {
    // The load-bearing SP regression lock: BASE_DATA has no player_id, so
    // this is the canonical SP shape App.tsx assembles in single-player
    // sessions. Nothing about the rendered DOM should leak a player name
    // attribution.
    render(<CharacterSheet data={BASE_DATA} />);
    const sheet = screen.getByTestId('character-sheet');
    // Conservative negative: ensure no em-dash-followed-by-letters
    // attribution leaks anywhere in the sheet body. BASE_DATA's backstory
    // and other fields don't contain em-dashes, so this is a clean check.
    expect(sheet.textContent ?? '').not.toMatch(/—\s+[A-Za-z]/);
  });

  it('AC-6 (wiring): an App-shaped CharacterSheetData with player_id renders the name', () => {
    // Wiring: assemble the data the App.tsx PARTY_STATUS handler would
    // produce in MP (sidequest-ui/src/App.tsx:855-869), with player_id
    // sourced from the matching party member's player_id field. This
    // anchors the test to the production data path even when invoking
    // the sheet in isolation.
    const built: CharacterSheetDataWithPlayer = {
      name: 'Rux',
      class: 'Ranger',
      race: 'Wood Elf',
      level: 2,
      hp: 18,
      hp_max: 20,
      stats: { strength: 12, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 8 },
      abilities: [makeAbility('Tracker')],
      class_moves: [],
      backstory: 'Born under the Ashwood canopy.',
      portrait_url: undefined,
      current_location: 'The Rusty Cantina',
      player_id: 'James',
    };
    render(<CharacterSheet data={built} />);
    const sheet = screen.getByTestId('character-sheet');
    expect(within(sheet).getByText(/James/)).toBeInTheDocument();
  });
});
