import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CharacterSheet } from '../CharacterSheet';
import type { AbilityDefinition, CharacterSheetData, ClassMove } from '../CharacterSheet';
// Story 93-3 AC-4: the chargen-provenance entry type is canonical in payloads.ts
// (the wire-types home). If Dev defines it elsewhere this import breaks tsc — the
// build gate enforces the "typed in payloads.ts" AC. CharacterSheetData re-uses it.
import type { CreationAnswer } from '@/types/payloads';

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
  class_moves: [] as ClassMove[],
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
// flex row at CharacterSheet.tsx:57; h2 with player_id span at lines 66-76).
// MP-detection lives in App.tsx — the component itself only checks "is
// player_id non-empty?"
// ---------------------------------------------------------------------------

describe('CharacterSheet — Story 56-1: controlling player name (MP)', () => {
  it('AC-2: renders the controlling player name in the sheet header', () => {
    const data: CharacterSheetData = {
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
    const data: CharacterSheetData = {
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

  it('collapses to a single name when player_id equals the character name (no "X — X")', () => {
    // Playtest 2026-05-25: a player whose handle == their character name
    // (Baldrick/Baldrick) rendered "Baldrick — Baldrick". When the two are
    // identical the suffix is noise — suppress it (and the separator).
    const data: CharacterSheetData = {
      ...BASE_DATA,
      name: 'Baldrick',
      player_id: 'Baldrick',
    };
    render(<CharacterSheet data={data} />);
    const sheet = screen.getByTestId('character-sheet');
    expect(within(sheet).queryByTestId('character-sheet-player-name')).toBeNull();
    expect(sheet.textContent ?? '').not.toMatch(/Baldrick\s*—\s*Baldrick/);
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
    const built: CharacterSheetData = {
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

// ---------------------------------------------------------------------------
// Story 53-5: RigComposure + Edge + injury tags on CharacterSheet
//
// AC-3: CharacterSheet renders a "Composure" section with Edge and
//       RigComposure bars side-by-side, plus injury tag display.
// AC-2: CharacterSheetData carries optional rig_composure_current,
//       rig_composure_max, and injury_tags fields.
// ---------------------------------------------------------------------------

describe('CharacterSheet — Story 53-5: RigComposure + Edge + injury tags', () => {
  const RIG_DATA: CharacterSheetData = {
    ...BASE_DATA,
    hp: 4,
    hp_max: 5,
    rig_composure_current: 8,
    rig_composure_max: 12,
    injury_tags: [],
  };

  const CRASHED_RIG_DATA: CharacterSheetData = {
    ...BASE_DATA,
    hp: 3,
    hp_max: 5,
    rig_composure_current: 0,
    rig_composure_max: 10,
    injury_tags: ['injury', 'dismounted'],
  };

  // --- AC-3: RigComposure bar renders when data is present ---

  it('AC-3: renders RigComposure section when rig_composure fields are present', () => {
    render(<CharacterSheet data={RIG_DATA} />);
    const sheet = screen.getByTestId('character-sheet');
    expect(within(sheet).getByTestId('rig-composure-section')).toBeInTheDocument();
  });

  it('AC-3: renders rig composure current and max values', () => {
    render(<CharacterSheet data={RIG_DATA} />);
    const section = screen.getByTestId('rig-composure-section');
    expect(within(section).getByText(/8/)).toBeInTheDocument();
    expect(within(section).getByText(/12/)).toBeInTheDocument();
  });

  it('AC-3: renders HP bar in composure section when hp fields are present', () => {
    // ADR-114: the hp/hp_max pool is the character's survivability HP and is
    // labeled "HP" (not the confrontation Edge metric).
    render(<CharacterSheet data={RIG_DATA} />);
    const section = screen.getByTestId('rig-composure-section');
    expect(within(section).getByText(/^HP$/i)).toBeInTheDocument();
  });

  it('Story 68-1: renders the genre survivability label instead of "HP" when set', () => {
    // The survivability pool is genre-flavored (Composure/Standing/Poise on
    // social packs). "Poise" avoids colliding with the section's "Composure"
    // heading. Absent the label, the bar falls back to "HP" (test above).
    render(<CharacterSheet data={{ ...RIG_DATA, survivability_pool_label: 'Poise' }} />);
    const section = screen.getByTestId('rig-composure-section');
    expect(within(section).getByText(/^Poise$/)).toBeInTheDocument();
    expect(within(section).queryByText(/^HP$/i)).not.toBeInTheDocument();
  });

  it('AC-3: renders RigComposure label distinct from HP', () => {
    render(<CharacterSheet data={RIG_DATA} />);
    const section = screen.getByTestId('rig-composure-section');
    expect(within(section).getByText(/Rig/i)).toBeInTheDocument();
  });

  // --- AC-3: Conditional rendering — absent rig pool ---

  it('AC-3: does NOT render rig composure section when rig fields are absent', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    expect(screen.queryByTestId('rig-composure-section')).not.toBeInTheDocument();
  });

  it('AC-3: does NOT render rig composure section when fields are null', () => {
    const dataNoRig: CharacterSheetData = {
      ...BASE_DATA,
      hp: 4,
      hp_max: 5,
      rig_composure_current: undefined,
      rig_composure_max: undefined,
    };
    render(<CharacterSheet data={dataNoRig} />);
    expect(screen.queryByTestId('rig-composure-section')).not.toBeInTheDocument();
  });

  // --- AC-3: Zero composure (wrecked rig) ---

  it('AC-3: renders rig composure at zero (wrecked) as a valid state', () => {
    render(<CharacterSheet data={CRASHED_RIG_DATA} />);
    const section = screen.getByTestId('rig-composure-section');
    expect(within(section).getByText(/0/)).toBeInTheDocument();
    expect(within(section).getByText(/10/)).toBeInTheDocument();
  });

  // --- AC-3: Injury tags ---

  it('AC-3: renders injury tags when present', () => {
    render(<CharacterSheet data={CRASHED_RIG_DATA} />);
    const tags = screen.getByTestId('injury-tags');
    expect(tags).toBeInTheDocument();
    expect(within(tags).getByText(/injury/i)).toBeInTheDocument();
    expect(within(tags).getByText(/dismounted/i)).toBeInTheDocument();
  });

  it('AC-3: does NOT render injury tags section when empty', () => {
    render(<CharacterSheet data={RIG_DATA} />);
    expect(screen.queryByTestId('injury-tags')).not.toBeInTheDocument();
  });

  it('AC-3: does NOT render injury tags section when absent', () => {
    render(<CharacterSheet data={BASE_DATA} />);
    expect(screen.queryByTestId('injury-tags')).not.toBeInTheDocument();
  });

  // --- Wiring: CharacterSheetData type accepts rig fields ---

  it('AC-6 (wiring): an App-shaped CharacterSheetData with rig pool renders correctly', () => {
    const appShaped: CharacterSheetData = {
      name: 'Dusty',
      class: 'Road Warrior',
      level: 4,
      hp: 5,
      hp_max: 5,
      rig_composure_current: 10,
      rig_composure_max: 15,
      injury_tags: [],
      stats: { grit: 14, reflex: 16, nerve: 12 },
      abilities: [makeAbility('Turbo Boost')],
      class_moves: [],
      backstory: 'Last of the V8 interceptors.',
      portrait_url: undefined,
    };
    render(<CharacterSheet data={appShaped} />);
    const sheet = screen.getByTestId('character-sheet');
    expect(within(sheet).getByTestId('rig-composure-section')).toBeInTheDocument();
    expect(within(sheet).getByText('Dusty')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Story 93-3: Character-sheet History section — origin block
//
// Renders a new "History" section that reads the creation_answers provenance
// (story 93-2: durable per-scene chargen answers carried on the sheet) and
// lists, per scene, the prompt the player saw + the answer they gave. Freeform
// answers show the player's verbatim words; preset answers show the chosen
// option label (the server stores the LABEL in `value` for choice kinds and
// the verbatim text for freeform kinds — CreationAnswer.value). Scenes whose
// freeform fed the 93-1 archetype inference (archetype_inferred=true) carry an
// "inferred from your words" badge so the player sees where the engine read
// them.
//
// AC-1: History section with an Origin block listing each scene's prompt+answer.
// AC-2: freeform → verbatim words; preset → chosen option label.
// AC-3: archetype_inferred scenes carry an "inferred from your words" badge.
// AC-4: the section renders nothing (graceful) when creation_answers is
//       absent/empty on legacy saves. (Mapping-side absence guard lives in
//       partyStatusMapping.test.ts.)
// AC-5: the History container is structured to host more later (lore in 93-4)
//       but renders ONLY the origin block now — no placeholder/stub lore rows.
// AC-6: component test asserts History/Origin rows render from a
//       creation_answers fixture incl. the inferred badge.
//
// Implementation anchors (testids consistent with this file's convention,
// e.g. rig-composure-section / injury-tags):
//   - data-testid="character-history"      — the History section container
//   - data-testid="character-origin"       — the Origin block within History
//   - data-testid="origin-inferred-badge"  — the per-scene inferred badge
// ---------------------------------------------------------------------------

describe('CharacterSheet — Story 93-3: History section (origin block)', () => {
  // A two-scene fixture: one freeform answer that fed archetype inference
  // (badge expected) and one preset pick that did not (no badge).
  const ORIGIN_ANSWERS: CreationAnswer[] = [
    {
      scene_id: 'origin_scene',
      prompt: 'Where do you hail from?',
      kind: 'freeform',
      value: 'I crawled out of a suspension pod beneath the salt flats.',
      archetype_inferred: true,
    },
    {
      scene_id: 'calling_scene',
      prompt: 'What is your calling?',
      kind: 'choice',
      value: 'Wasteland Mechanic',
      archetype_inferred: false,
    },
  ];

  const DATA_WITH_HISTORY: CharacterSheetData = {
    ...BASE_DATA,
    creation_answers: ORIGIN_ANSWERS,
  };

  // --- AC-1: History + Origin block render ---

  it('AC-1: renders a History section containing an Origin block', () => {
    render(<CharacterSheet data={DATA_WITH_HISTORY} />);
    const sheet = screen.getByTestId('character-sheet');
    const history = within(sheet).getByTestId('character-history');
    expect(history).toBeInTheDocument();
    expect(within(history).getByTestId('character-origin')).toBeInTheDocument();
  });

  it('AC-1: lists each chargen scene\'s prompt and the player\'s answer', () => {
    render(<CharacterSheet data={DATA_WITH_HISTORY} />);
    const origin = screen.getByTestId('character-origin');
    // Both prompts the player saw.
    expect(within(origin).getByText(/Where do you hail from\?/)).toBeInTheDocument();
    expect(within(origin).getByText(/What is your calling\?/)).toBeInTheDocument();
    // Both answers the player gave.
    expect(
      within(origin).getByText(/I crawled out of a suspension pod beneath the salt flats\./),
    ).toBeInTheDocument();
    expect(within(origin).getByText(/Wasteland Mechanic/)).toBeInTheDocument();
  });

  // --- AC-2: freeform verbatim vs preset label ---

  it('AC-2: freeform answers render the player\'s verbatim words', () => {
    render(<CharacterSheet data={DATA_WITH_HISTORY} />);
    const origin = screen.getByTestId('character-origin');
    expect(
      within(origin).getByText('I crawled out of a suspension pod beneath the salt flats.'),
    ).toBeInTheDocument();
  });

  it('AC-2: preset answers render the chosen option label', () => {
    render(<CharacterSheet data={DATA_WITH_HISTORY} />);
    const origin = screen.getByTestId('character-origin');
    expect(within(origin).getByText('Wasteland Mechanic')).toBeInTheDocument();
  });

  // --- AC-3: inferred badge ---

  it('AC-3: shows exactly one "inferred from your words" badge for the inferred scene', () => {
    render(<CharacterSheet data={DATA_WITH_HISTORY} />);
    const history = screen.getByTestId('character-history');
    const badges = within(history).queryAllByTestId('origin-inferred-badge');
    // Only the freeform/inferred scene carries the badge — not the preset pick.
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent(/inferred from your words/i);
  });

  it('AC-3: renders no badge when no scene fed archetype inference', () => {
    const noneInferred: CharacterSheetData = {
      ...BASE_DATA,
      creation_answers: ORIGIN_ANSWERS.map((a) => ({ ...a, archetype_inferred: false })),
    };
    render(<CharacterSheet data={noneInferred} />);
    const history = screen.getByTestId('character-history');
    // History still renders (origin content present) — just no badge.
    expect(within(history).getByTestId('character-origin')).toBeInTheDocument();
    expect(within(history).queryAllByTestId('origin-inferred-badge')).toHaveLength(0);
  });

  it('AC-3: treats a missing archetype_inferred flag as not-inferred (no badge)', () => {
    // Legacy/optional flag: a CreationAnswer without archetype_inferred must
    // not produce a badge (server defaults it false; the UI must not invert).
    const data: CharacterSheetData = {
      ...BASE_DATA,
      creation_answers: [
        { scene_id: 's', prompt: 'A prompt?', kind: 'freeform', value: 'an answer' } as CreationAnswer,
      ],
    };
    render(<CharacterSheet data={data} />);
    const history = screen.getByTestId('character-history');
    expect(within(history).queryAllByTestId('origin-inferred-badge')).toHaveLength(0);
  });

  // --- AC-4: graceful absence/empty ---

  it('AC-4: renders no History section when creation_answers is absent (legacy save)', () => {
    // BASE_DATA carries no creation_answers — the canonical legacy shape.
    render(<CharacterSheet data={BASE_DATA} />);
    expect(screen.queryByTestId('character-history')).not.toBeInTheDocument();
    // The rest of the sheet still renders.
    expect(screen.getByText('Kael')).toBeInTheDocument();
  });

  it('AC-4: renders no History section when creation_answers is an empty array', () => {
    render(<CharacterSheet data={{ ...BASE_DATA, creation_answers: [] }} />);
    expect(screen.queryByTestId('character-history')).not.toBeInTheDocument();
    expect(screen.getByText('Kael')).toBeInTheDocument();
  });

  // --- AC-5: origin block only — no premature lore stubs ---

  it('AC-5: renders only the origin block — no lore section or placeholder rows yet', () => {
    render(<CharacterSheet data={DATA_WITH_HISTORY} />);
    const history = screen.getByTestId('character-history');
    // 93-4 attaches lore here; until then there is NO lore surface and no
    // empty-state stub. The word "lore" must not appear in the History body,
    // and no lore testid may exist (No Stubbing — guards against a skeleton).
    expect(within(history).queryByTestId('history-lore')).toBeNull();
    expect(history.textContent ?? '').not.toMatch(/lore/i);
    expect(history.textContent ?? '').not.toMatch(/coming soon|placeholder|no entries yet/i);
  });

  // --- AC-6: wiring from an App-shaped sheet ---

  it('AC-6 (wiring): an App-shaped CharacterSheetData renders History/Origin incl. the inferred badge', () => {
    const appShaped: CharacterSheetData = {
      name: 'Vesska',
      class: 'Mechanic',
      level: 1,
      stats: { strength: 12, dexterity: 14, constitution: 13, intelligence: 11, wisdom: 10, charisma: 9 },
      abilities: [makeAbility('Jury-Rig')],
      class_moves: [],
      backstory: 'Forged in the long foundry.',
      portrait_url: undefined,
      creation_answers: ORIGIN_ANSWERS,
    };
    render(<CharacterSheet data={appShaped} />);
    const sheet = screen.getByTestId('character-sheet');
    const history = within(sheet).getByTestId('character-history');
    expect(within(history).getByTestId('character-origin')).toBeInTheDocument();
    expect(within(history).getByText(/Where do you hail from\?/)).toBeInTheDocument();
    expect(within(history).queryAllByTestId('origin-inferred-badge')).toHaveLength(1);
  });
});
