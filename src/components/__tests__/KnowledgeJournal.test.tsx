import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KnowledgeJournal } from '../KnowledgeJournal';
import type { KnowledgeEntry, FactCategory } from '@/providers/GameStateProvider';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function entry(overrides: Partial<KnowledgeEntry> & { fact_id: string }): KnowledgeEntry {
  return {
    content: 'A mysterious fact about the world',
    category: 'Lore' as FactCategory,
    is_new: true,
    learned_turn: 1,
    source: 'Observation',
    confidence: 'Certain',
    ...overrides,
  };
}

const ENTRIES: KnowledgeEntry[] = [
  entry({
    fact_id: 'f1',
    content: 'The grove\'s oldest tree radiates corruption from its roots',
    category: 'Place',
    is_new: true,
    learned_turn: 3,
  }),
  entry({
    fact_id: 'f2',
    content: 'Elder Mirova guards a secret beneath the well',
    category: 'Person',
    is_new: true,
    learned_turn: 5,
  }),
  entry({
    fact_id: 'f3',
    content: 'The ancient runes pulse with a ward against shadow creatures',
    category: 'Lore',
    is_new: true,
    learned_turn: 7,
  }),
  entry({
    fact_id: 'f4',
    content: 'Find the source of corruption before the harvest moon',
    category: 'Quest',
    is_new: true,
    learned_turn: 2,
  }),
  entry({
    fact_id: 'f5',
    content: 'Root-bonding allows you to sense corruption in living wood',
    category: 'Ability',
    is_new: true,
    learned_turn: 1,
  }),
  entry({
    fact_id: 'f6',
    content: 'A hooded figure was seen near the well at midnight',
    category: 'Person',
    is_new: false,
    learned_turn: 4,
  }),
];

// ---------------------------------------------------------------------------
// AC-1: Browse screen — dedicated journal view accessible from game UI
// ---------------------------------------------------------------------------

describe('AC-1: Browse screen renders', () => {
  it('renders the journal view container', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    expect(screen.getByTestId('knowledge-journal')).toBeInTheDocument();
  });

  it('renders all entries by default', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    expect(screen.getByText(/grove's oldest tree/i)).toBeInTheDocument();
    expect(screen.getByText(/Elder Mirova/i)).toBeInTheDocument();
    expect(screen.getByText(/ancient runes/i)).toBeInTheDocument();
    expect(screen.getByText(/source of corruption/i)).toBeInTheDocument();
    expect(screen.getByText(/Root-bonding/i)).toBeInTheDocument();
    expect(screen.getByText(/hooded figure/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-2: Category filter — entries filterable by Lore, Place, Person, Quest, Ability
// ---------------------------------------------------------------------------

describe('AC-2: Category filtering', () => {
  it('shows category filter tabs for all five categories', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    expect(screen.getByRole('tab', { name: /lore/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /place/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /person/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /quest/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ability/i })).toBeInTheDocument();
  });

  it('shows an "All" tab that is selected by default', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const allTab = screen.getByRole('tab', { name: /all/i });
    expect(allTab).toBeInTheDocument();
    expect(allTab).toHaveAttribute('aria-selected', 'true');
  });

  it('filters to only Place entries when Place tab clicked', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('tab', { name: /place/i }));

    expect(screen.getByText(/grove's oldest tree/i)).toBeInTheDocument();
    expect(screen.queryByText(/Elder Mirova/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ancient runes/i)).not.toBeInTheDocument();
  });

  it('filters to only Person entries when Person tab clicked', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('tab', { name: /person/i }));

    expect(screen.getByText(/Elder Mirova/i)).toBeInTheDocument();
    expect(screen.getByText(/hooded figure/i)).toBeInTheDocument();
    expect(screen.queryByText(/ancient runes/i)).not.toBeInTheDocument();
  });

  it('returns to all entries when All tab clicked after filtering', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('tab', { name: /lore/i }));
    fireEvent.click(screen.getByRole('tab', { name: /all/i }));

    expect(screen.getAllByTestId('journal-entry')).toHaveLength(ENTRIES.length);
  });
});

// ---------------------------------------------------------------------------
// AC-3: Genre voice — entries display in genre-voiced content
// ---------------------------------------------------------------------------

describe('AC-3: Genre-voiced content', () => {
  it('renders the full content text of each entry', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    expect(screen.getByText(/grove's oldest tree radiates corruption/i)).toBeInTheDocument();
    expect(screen.getByText(/Root-bonding allows you to sense corruption/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-4: Provenance — each entry shows when it was discovered (turn number)
// ---------------------------------------------------------------------------

describe('AC-4: Turn provenance', () => {
  it('displays the turn number for each entry', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    expect(screen.getByText(/turn 3/i)).toBeInTheDocument();
    expect(screen.getByText(/turn 5/i)).toBeInTheDocument();
    expect(screen.getByText(/turn 7/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-5: New indicator — new revelations are marked
// ---------------------------------------------------------------------------

describe('AC-5: New indicators', () => {
  it('shows "new" badge for new revelations', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const f1 = screen.getByText(/grove's oldest tree/i).closest('[data-testid="journal-entry"]');
    expect(f1).toBeTruthy();
    expect(within(f1 as HTMLElement).getByText(/new/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-6: Category display — each entry shows its category
// ---------------------------------------------------------------------------

describe('AC-6: Category display', () => {
  it('shows category label for entries', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const f1 = screen.getByText(/grove's oldest tree/i).closest('[data-testid="journal-entry"]');
    expect(f1).toBeTruthy();
    expect(within(f1 as HTMLElement).getByText('Place')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-7: Sort options — toggle between chronological and categorical
// ---------------------------------------------------------------------------

describe('AC-7: Sort toggle', () => {
  it('renders a sort toggle control', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    expect(screen.getByTestId('sort-toggle')).toBeInTheDocument();
  });

  it('defaults to chronological sort (most recent first)', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const entries = screen.getAllByTestId('journal-entry');
    // Most recent (turn 7: ancient runes) should be first
    expect(within(entries[0]).getByText(/ancient runes/i)).toBeInTheDocument();
    // Oldest (turn 1: Root-bonding) should be last
    expect(within(entries[entries.length - 1]).getByText(/Root-bonding/i)).toBeInTheDocument();
  });

  it('switches to categorical sort when toggled', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    fireEvent.click(screen.getByTestId('sort-toggle'));

    const entries = screen.getAllByTestId('journal-entry');
    expect(entries.length).toBe(ENTRIES.length);
  });

  it('switches back to chronological when toggled again', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    fireEvent.click(screen.getByTestId('sort-toggle'));
    fireEvent.click(screen.getByTestId('sort-toggle'));

    const entries = screen.getAllByTestId('journal-entry');
    // Back to most-recent-first
    expect(within(entries[0]).getByText(/ancient runes/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-8: Empty state — new games show appropriate empty journal message
// ---------------------------------------------------------------------------

describe('AC-8: Empty state', () => {
  it('shows empty message when no entries', () => {
    render(<KnowledgeJournal entries={[]} />);
    expect(screen.getByText(/your journal is empty/i)).toBeInTheDocument();
  });

  it('shows explore prompt in empty state', () => {
    render(<KnowledgeJournal entries={[]} />);
    expect(screen.getByText(/explore the world/i)).toBeInTheDocument();
  });

  it('does not render category tabs in empty state', () => {
    render(<KnowledgeJournal entries={[]} />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('handles single entry without crashing', () => {
    render(<KnowledgeJournal entries={[ENTRIES[0]]} />);
    expect(screen.getAllByTestId('journal-entry')).toHaveLength(1);
  });

  it('handles entries all in same category', () => {
    const loreOnly = [
      entry({ fact_id: 'l1', content: 'Fact one', category: 'Lore', learned_turn: 1 }),
      entry({ fact_id: 'l2', content: 'Fact two', category: 'Lore', learned_turn: 2 }),
    ];
    render(<KnowledgeJournal entries={loreOnly} />);
    fireEvent.click(screen.getByRole('tab', { name: /lore/i }));
    expect(screen.getAllByTestId('journal-entry')).toHaveLength(2);
  });

  it('shows category count badges on filter tabs', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    // Person category has 2 entries (f2 + f6)
    const personTab = screen.getByRole('tab', { name: /person/i });
    expect(personTab).toHaveTextContent('2');
  });
});

// ---------------------------------------------------------------------------
// AC-9: Keyword filter (spec 2026-05-03)
// ---------------------------------------------------------------------------

describe('AC-9: Keyword filter', () => {
  it('renders a keyword filter input', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    expect(screen.getByTestId('keyword-filter')).toBeInTheDocument();
  });

  it('filters entries to those whose content contains the keyword (case-insensitive)', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const input = screen.getByTestId('keyword-filter') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'corruption' } });

    // f1 (grove tree radiates corruption), f4 (find the source of corruption),
    // f5 (Root-bonding allows you to sense corruption) — three matches.
    expect(screen.getAllByTestId('journal-entry')).toHaveLength(3);
    expect(screen.queryByText(/Elder Mirova/i)).not.toBeInTheDocument();
  });

  it('matches case-insensitively', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const input = screen.getByTestId('keyword-filter') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'MIROVA' } });

    expect(screen.getAllByTestId('journal-entry')).toHaveLength(1);
    expect(screen.getByText(/Elder Mirova/i)).toBeInTheDocument();
  });

  it('matches substrings, not whole words', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const input = screen.getByTestId('keyword-filter') as HTMLInputElement;

    // "rune" is a substring of "runes" (f3)
    fireEvent.change(input, { target: { value: 'rune' } });

    expect(screen.getAllByTestId('journal-entry')).toHaveLength(1);
    expect(screen.getByText(/ancient runes/i)).toBeInTheDocument();
  });

  it('shows all entries when input is empty', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const input = screen.getByTestId('keyword-filter') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'corruption' } });
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getAllByTestId('journal-entry')).toHaveLength(ENTRIES.length);
  });

  it('shows all entries when input is whitespace-only', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const input = screen.getByTestId('keyword-filter') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '   ' } });

    expect(screen.getAllByTestId('journal-entry')).toHaveLength(ENTRIES.length);
  });

  it('narrows by AND across multiple tokens', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const input = screen.getByTestId('keyword-filter') as HTMLInputElement;

    // "corruption sense" should match only f5 (Root-bonding allows you to
    // sense corruption) — both tokens present in content. f1 has corruption
    // but not sense; f4 has corruption but not sense.
    fireEvent.change(input, { target: { value: 'corruption sense' } });

    expect(screen.getAllByTestId('journal-entry')).toHaveLength(1);
    expect(screen.getByText(/Root-bonding/i)).toBeInTheDocument();
  });

  it('treats each whitespace-separated token as an independent substring', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const input = screen.getByTestId('keyword-filter') as HTMLInputElement;

    // f6 ("hooded figure was seen near the well at midnight") contains
    // both "well" and "midnight". Token order does not matter.
    fireEvent.change(input, { target: { value: 'midnight well' } });

    expect(screen.getAllByTestId('journal-entry')).toHaveLength(1);
    expect(screen.getByText(/hooded figure/i)).toBeInTheDocument();
  });

  it('shows empty-result message when filters yield zero matches', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    const input = screen.getByTestId('keyword-filter') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'xyznomatch' } });

    expect(screen.queryAllByTestId('journal-entry')).toHaveLength(0);
    expect(screen.getByTestId('keyword-filter-empty')).toBeInTheDocument();
    expect(screen.getByTestId('keyword-filter-empty')).toHaveTextContent(/xyznomatch/);
  });

  it('does NOT show empty-result message when filter is empty', () => {
    render(<KnowledgeJournal entries={ENTRIES} />);
    expect(screen.queryByTestId('keyword-filter-empty')).not.toBeInTheDocument();
  });
});
