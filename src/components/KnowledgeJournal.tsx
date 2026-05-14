import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { KnowledgeEntry, FactCategory } from '@/providers/GameStateProvider';

const CATEGORIES: FactCategory[] = ['Lore', 'Place', 'Person', 'Quest', 'Ability'];

type SortMode = 'chronological' | 'categorical';

interface KnowledgeJournalProps {
  entries: KnowledgeEntry[];
  onRequestJournal?: (category?: string) => void;
}

// Folio palette — kept in sync with CharacterPanel / InventoryPanel so all
// three side panels read as the same artifact. Values resolve through CSS
// custom properties set by useGenreTheme (ADR-079); the semantic names
// (ink, paper, crimson, gold, rule) stay stable while colors shift per genre.
const FOLIO = {
  ink: 'var(--card-foreground)',
  inkSoft: 'var(--muted-foreground)',
  paper: 'var(--card)',
  paper2: 'var(--muted)',
  crimson: 'var(--accent)',
  gold: 'var(--primary)',
  rule: 'var(--border)',
} as const;

const FONT_DISPLAY = "'Pirata One', serif";
const FONT_BODY = "'EB Garamond', serif";

// Small pill control — used for category tabs and the inline action buttons.
// Accepts an `active` flag so we can render the same shape for both selected
// and unselected states without forking JSX.
function pillStyle(active: boolean): CSSProperties {
  return {
    background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
    color: active ? FOLIO.crimson : FOLIO.inkSoft,
    border: `1px solid ${active ? FOLIO.crimson : FOLIO.rule}`,
    fontFamily: FONT_DISPLAY,
    fontSize: 13,
    letterSpacing: 1,
    padding: '3px 8px',
    borderRadius: 2,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    lineHeight: 1.2,
    textTransform: 'none',
  };
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
      <div
        data-testid="knowledge-journal"
        className="p-6"
        style={{
          background: FOLIO.paper,
          color: FOLIO.ink,
          fontFamily: FONT_BODY,
          padding: 0,
        }}
      >
        <FolioJournalHeader total={0} />
        <p
          className="text-muted-foreground/60 italic"
          style={{
            fontFamily: FONT_BODY,
            fontStyle: 'italic',
            color: FOLIO.inkSoft,
            padding: '24px 16px',
            margin: 0,
            fontSize: 15,
            lineHeight: 1.4,
          }}
        >
          Your journal is empty. Explore the world to fill its pages.
        </p>
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
    <div
      data-testid="knowledge-journal"
      className="p-4"
      style={{
        background: FOLIO.paper,
        color: FOLIO.ink,
        fontFamily: FONT_BODY,
        padding: 0,
      }}
    >
      <FolioJournalHeader total={entries.length} />

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Keyword filter — paper2 input with a gold rule, ink text, italic
            placeholder. Clear button is a Pirata One ✕ in inkSoft. */}
        <div className="mb-3 relative" style={{ position: 'relative', margin: 0 }}>
          <input
            type="text"
            data-testid="keyword-filter"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Filter by keyword"
            className="w-full text-sm px-2 py-1 pr-7 rounded
                       border border-border/40 bg-transparent
                       text-foreground placeholder:text-muted-foreground/50
                       focus:outline-none focus:border-border/70 transition-colors"
            style={{
              width: '100%',
              fontFamily: FONT_BODY,
              fontSize: 15,
              color: FOLIO.ink,
              background: FOLIO.paper2,
              border: `1px solid ${FOLIO.rule}`,
              borderRadius: 2,
              padding: '5px 26px 5px 8px',
              outline: 'none',
            }}
          />
          {keyword.length > 0 && (
            <button
              type="button"
              data-testid="keyword-filter-clear"
              onClick={() => setKeyword('')}
              aria-label="Clear keyword filter"
              className="absolute right-1 top-1/2 -translate-y-1/2
                         text-muted-foreground/60 hover:text-foreground
                         text-sm leading-none px-1"
              style={{
                position: 'absolute',
                right: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: FOLIO.crimson,
                fontFamily: FONT_DISPLAY,
                fontSize: 16,
                lineHeight: 1,
                padding: '2px 4px',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Category tabs — Pirata One pills with crimson active state. The
            count beside each label is rendered as italic gold marginalia in
            the manuscript voice. */}
        <div role="tablist" className="flex gap-1 mb-3 flex-wrap"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: 0 }}>
          <button
            role="tab"
            aria-selected={activeCategory === 'All'}
            onClick={() => setActiveCategory('All')}
            className={`text-xs px-2 py-1 rounded ${activeCategory === 'All' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}
            style={pillStyle(activeCategory === 'All')}
          >
            All
          </button>
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs px-2 py-1 rounded ${active ? 'bg-primary/20 text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}
                style={pillStyle(active)}
              >
                {cat}
                {categoryCounts[cat] > 0 && (
                  <span
                    className="opacity-50"
                    style={{
                      fontFamily: FONT_BODY,
                      fontStyle: 'italic',
                      fontSize: 12,
                      color: FOLIO.gold,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {categoryCounts[cat]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sort + refresh actions — same paper2 button language as the cards
            below so the controls don't compete with the entries. */}
        <div className="flex gap-3 mb-3" style={{ display: 'flex', gap: 8, margin: 0 }}>
          {/* Sort toggle. Pre-2026-04-24 this rendered as plain muted text
              and read as a label, not a control — playtesters didn't realize
              it was clickable. The Folio pass restyles the affordance with a
              gold rule + crimson ⇅ chevron so it reads unambiguously as a
              button while staying low-emphasis. */}
          <button
            data-testid="sort-toggle"
            onClick={() =>
              setSortMode((m) => (m === 'chronological' ? 'categorical' : 'chronological'))
            }
            aria-label={`Switch sort to ${sortMode === 'chronological' ? 'category' : 'time'}`}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded
                       border border-border/40 text-muted-foreground
                       hover:text-foreground hover:border-border/70 transition-colors"
            style={{
              ...pillStyle(false),
              fontFamily: FONT_BODY,
              fontStyle: 'italic',
              fontSize: 14,
              letterSpacing: 0.3,
              color: FOLIO.ink,
              background: FOLIO.paper2,
            }}
          >
            <span>{sortMode === 'chronological' ? 'Sort by Category' : 'Sort by Time'}</span>
            <span aria-hidden="true" style={{ color: FOLIO.crimson, fontSize: 15 }}>⇅</span>
          </button>
          {onRequestJournal && (
            <button
              data-testid="refresh-journal"
              onClick={() => onRequestJournal(activeCategory === 'All' ? undefined : activeCategory)}
              className="inline-flex items-center text-xs px-2 py-0.5 rounded
                         border border-border/40 text-muted-foreground
                         hover:text-foreground hover:border-border/70 transition-colors"
              style={{
                ...pillStyle(false),
                fontFamily: FONT_BODY,
                fontStyle: 'italic',
                fontSize: 14,
                letterSpacing: 0.3,
                color: FOLIO.ink,
                background: FOLIO.paper2,
              }}
            >
              Refresh from server
            </button>
          )}
        </div>

        {/* Entry list. Each entry is a paper2 card with a gold-rule left edge,
            content in EB Garamond, marginalia (category · turn · source ·
            confidence) below in italic ink-soft. NEW pill is the same crimson
            "SIG" pennant pattern as the Inventory equipped marker. */}
        <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.length === 0 && tokens.length > 0 && (
            <p
              data-testid="keyword-filter-empty"
              className="text-muted-foreground/60 italic text-sm py-4"
              style={{
                fontFamily: FONT_BODY,
                fontStyle: 'italic',
                color: FOLIO.inkSoft,
                fontSize: 15,
                padding: '16px 0',
                textAlign: 'center',
                margin: 0,
              }}
            >
              No entries match "{tokens.join(' ')}"
            </p>
          )}
          {sorted.map((entry) => (
            <div
              key={entry.fact_id}
              data-testid="journal-entry"
              className="text-sm border-l-2 border-border/30 pl-3 py-1"
              style={{
                position: 'relative',
                background: FOLIO.paper2,
                borderTopWidth: 1,
                borderTopStyle: 'solid',
                borderTopColor: FOLIO.rule,
                borderRightWidth: 1,
                borderRightStyle: 'solid',
                borderRightColor: FOLIO.rule,
                borderBottomWidth: 1,
                borderBottomStyle: 'solid',
                borderBottomColor: FOLIO.rule,
                borderLeftWidth: 3,
                borderLeftStyle: 'solid',
                borderLeftColor: entry.is_new ? FOLIO.crimson : FOLIO.gold,
                padding: '8px 10px',
                margin: 0,
              }}
            >
              {entry.is_new && (
                <span
                  data-testid="knowledge-new-pill"
                  className="inline-flex items-center rounded-full bg-[var(--primary)]/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]"
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: -1,
                    padding: '1px 5px',
                    background: FOLIO.crimson,
                    color: FOLIO.paper,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: 400,
                    borderRadius: 0,
                    lineHeight: 1.2,
                  }}
                >
                  New
                </span>
              )}
              <p
                className="text-foreground/80"
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 15,
                  lineHeight: 1.45,
                  color: FOLIO.ink,
                  margin: 0,
                }}
              >
                {entry.content}
              </p>
              <div
                className="flex gap-2 text-xs text-muted-foreground/50 mt-0.5"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 4,
                  fontSize: 12,
                  fontFamily: FONT_BODY,
                  fontStyle: 'italic',
                  color: FOLIO.inkSoft,
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'normal',
                    fontSize: 12,
                    color: FOLIO.crimson,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {entry.category}
                </span>
                <span style={{ color: FOLIO.gold, fontVariantNumeric: 'tabular-nums oldstyle-nums' }}>
                  Turn {entry.learned_turn}
                </span>
                {entry.source && <span>{entry.source}</span>}
                {entry.confidence && <span>{entry.confidence}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Header cartouche shared between the empty-state and populated views.
 *  Same double-rule + paper2→paper gradient as the CharacterPanel and
 *  InventoryPanel headers, with a "Journal" Pirata One title and an italic
 *  gold entry-count to the right. */
function FolioJournalHeader({ total }: { total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '12px 16px',
        borderBottom: `2px double ${FOLIO.rule}`,
        background: `linear-gradient(180deg, ${FOLIO.paper2} 0%, ${FOLIO.paper} 70%)`,
      }}
    >
      <h2
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 400,
          fontSize: 24,
          color: FOLIO.ink,
          letterSpacing: 0.5,
          lineHeight: 1.05,
          margin: 0,
        }}
      >
        Journal
      </h2>
      <span
        style={{
          fontFamily: FONT_BODY,
          fontStyle: 'italic',
          fontSize: 14,
          color: FOLIO.gold,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {total === 1 ? '1 entry' : `${total} entries`}
      </span>
    </div>
  );
}
