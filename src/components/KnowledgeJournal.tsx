import { useState, useMemo } from 'react';
import type { KnowledgeEntry, FactCategory } from '@/providers/GameStateProvider';

const CATEGORIES: FactCategory[] = ['Lore', 'Place', 'Person', 'Quest', 'Ability'];

type SortMode = 'chronological' | 'categorical';

interface KnowledgeJournalProps {
  entries: KnowledgeEntry[];
  onRequestJournal?: (category?: string) => void;
}

export function KnowledgeJournal({ entries, onRequestJournal }: KnowledgeJournalProps) {
  const [activeCategory, setActiveCategory] = useState<FactCategory | 'All'>('All');
  const [sortMode, setSortMode] = useState<SortMode>('chronological');
  const [keyword, setKeyword] = useState('');

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      counts[cat] = entries.filter((e) => e.category === cat).length;
    }
    return counts;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div data-testid="knowledge-journal" className="p-6">
        <p className="text-muted-foreground/60 italic">Your journal is empty. Explore the world to fill its pages.</p>
      </div>
    );
  }

  const categoryFiltered =
    activeCategory === 'All'
      ? entries
      : entries.filter((e) => e.category === activeCategory);

  const tokens = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const filtered =
    tokens.length === 0
      ? categoryFiltered
      : categoryFiltered.filter((e) => {
          const content = e.content.toLowerCase();
          return tokens.every((t) => content.includes(t));
        });

  const sorted = [...filtered];
  if (sortMode === 'chronological') {
    sorted.sort((a, b) => b.learned_turn - a.learned_turn);
  } else {
    sorted.sort((a, b) => {
      const catCmp = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
      if (catCmp !== 0) return catCmp;
      return b.learned_turn - a.learned_turn;
    });
  }

  return (
    <div data-testid="knowledge-journal" className="p-4">
      <div className="mb-3">
        <input
          type="text"
          data-testid="keyword-filter"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Filter by keyword"
          className="w-full text-sm px-2 py-1 rounded
                     border border-border/40 bg-transparent
                     text-foreground placeholder:text-muted-foreground/50
                     focus:outline-none focus:border-border/70 transition-colors"
        />
      </div>
      <div role="tablist" className="flex gap-1 mb-3 flex-wrap">
        <button
          role="tab"
          aria-selected={activeCategory === 'All'}
          onClick={() => setActiveCategory('All')}
          className={`text-xs px-2 py-1 rounded ${activeCategory === 'All' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-xs px-2 py-1 rounded ${activeCategory === cat ? 'bg-primary/20 text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}
          >
            {cat} {categoryCounts[cat] > 0 && <span className="opacity-50">{categoryCounts[cat]}</span>}
          </button>
        ))}
      </div>

      <div className="flex gap-3 mb-3">
        {/* Sort toggle. Pre-2026-04-24 this rendered as plain muted text
            and read as a label, not a control — playtesters didn't realize
            it was clickable. Now styled with a border + chevron so the
            affordance is unmistakable, while staying low-emphasis. */}
        <button
          data-testid="sort-toggle"
          onClick={() =>
            setSortMode((m) => (m === 'chronological' ? 'categorical' : 'chronological'))
          }
          aria-label={`Switch sort to ${sortMode === 'chronological' ? 'category' : 'time'}`}
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded
                     border border-border/40 text-muted-foreground
                     hover:text-foreground hover:border-border/70 transition-colors"
        >
          <span>{sortMode === 'chronological' ? 'Sort by Category' : 'Sort by Time'}</span>
          <span aria-hidden="true" className="opacity-60">⇅</span>
        </button>
        {onRequestJournal && (
          <button
            data-testid="refresh-journal"
            onClick={() => onRequestJournal(activeCategory === 'All' ? undefined : activeCategory)}
            className="inline-flex items-center text-xs px-2 py-0.5 rounded
                       border border-border/40 text-muted-foreground
                       hover:text-foreground hover:border-border/70 transition-colors"
          >
            Refresh from server
          </button>
        )}
      </div>

      <div className="space-y-2">
        {sorted.map((entry) => (
          <div key={entry.fact_id} data-testid="journal-entry" className="text-sm border-l-2 border-border/30 pl-3 py-1">
            <p className="text-foreground/80">{entry.content}</p>
            <div className="flex gap-2 text-xs text-muted-foreground/50 mt-0.5">
              <span>{entry.category}</span>
              <span>Turn {entry.learned_turn}</span>
              {entry.source && <span>{entry.source}</span>}
              {entry.confidence && <span>{entry.confidence}</span>}
              {entry.is_new && (
                <span
                  data-testid="knowledge-new-pill"
                  className="inline-flex items-center rounded-full bg-[var(--primary)]/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]"
                >
                  New
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
