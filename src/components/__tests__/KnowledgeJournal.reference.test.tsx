import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KnowledgeJournal } from '../KnowledgeJournal';
import type { KnowledgeEntry, FactCategory } from '@/providers/GameStateProvider';

// ---------------------------------------------------------------------------
// Fixtures — mirrors the entry() helper in KnowledgeJournal.test.tsx
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    fact_id: 'fact-1',
    content: 'The Rending',
    category: 'Lore' as FactCategory,
    learned_turn: 1,
    source: 'Observation',
    confidence: 'Certain',
    is_new: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reference hyperlink tests
// ---------------------------------------------------------------------------

describe('KnowledgeJournal reference hyperlinks', () => {
  it('renders an entry with reference_url as a target=_blank anchor wrapping the content', () => {
    render(
      <KnowledgeJournal
        entries={[
          makeEntry({
            reference_url: '/reference/lore/tea_and_murder/glenross#legend-the-rending',
          }),
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: /the rending/i });
    expect(link).toHaveAttribute(
      'href',
      '/reference/lore/tea_and_murder/glenross#legend-the-rending',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel') ?? '').toMatch(/noopener/);
  });

  it('renders an entry without reference_url as plain text (null)', () => {
    render(<KnowledgeJournal entries={[makeEntry({ reference_url: null })]} />);
    expect(screen.queryByRole('link', { name: /the rending/i })).toBeNull();
    expect(screen.getByText(/the rending/i)).toBeInTheDocument();
  });

  it('renders an entry with reference_url omitted (undefined) as plain text', () => {
    render(<KnowledgeJournal entries={[makeEntry()]} />);
    expect(screen.queryByRole('link', { name: /the rending/i })).toBeNull();
    expect(screen.getByText(/the rending/i)).toBeInTheDocument();
  });
});
