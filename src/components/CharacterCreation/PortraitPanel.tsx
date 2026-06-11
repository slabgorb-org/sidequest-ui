import { useState, useMemo } from "react";

export interface PortraitOption {
  slug: string;
  portrait_url: string;
  culture: string;
  archetype: string;
  sex: string;
  role: string;
}

interface PortraitPanelProps {
  portraits: PortraitOption[];
  suggestArchetype: string | null;
  onConfirm: (slug: string) => void;
  onSkip: () => void;
}

export function PortraitPanel({
  portraits,
  suggestArchetype,
  onConfirm,
  onSkip,
}: PortraitPanelProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Soft-suggest: stable sort putting archetype-matching portraits first.
  // Never filter or sort by sex — gender is never a selection filter.
  const sorted = useMemo(() => {
    if (!suggestArchetype) return portraits;
    return [...portraits].sort((a, b) => {
      const aMatch = a.archetype === suggestArchetype ? 0 : 1;
      const bMatch = b.archetype === suggestArchetype ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [portraits, suggestArchetype]);

  if (portraits.length === 0) {
    return (
      <div data-testid="portrait-panel" className="flex flex-col gap-4 w-full max-w-xl">
        <p
          data-testid="portrait-empty"
          className="text-sm text-muted-foreground/60 italic"
        >
          No sample portraits for this world yet.
        </p>
        <div className="flex justify-end border-t border-border/40 pt-3">
          <button
            data-testid="portrait-skip"
            onClick={onSkip}
            className="text-sm px-4 py-2 rounded border border-border/50 hover:border-border text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="portrait-panel" className="flex flex-col gap-4 w-full max-w-xl">
      <div className="grid grid-cols-3 gap-3">
        {sorted.map((portrait) => {
          const isSelected = selectedSlug === portrait.slug;
          return (
            <button
              key={portrait.slug}
              data-testid={`portrait-tile-${portrait.slug}`}
              onClick={() => setSelectedSlug(portrait.slug)}
              className={`rounded overflow-hidden border-2 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? "border-primary ring-2 ring-primary/50"
                  : "border-border/40 hover:border-border"
              }`}
              aria-pressed={isSelected}
            >
              <img
                src={portrait.portrait_url}
                alt={`${portrait.role} — ${portrait.culture}`}
                className="w-full h-full object-cover"
              />
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 justify-between border-t border-border/40 pt-3">
        <button
          data-testid="portrait-skip"
          onClick={onSkip}
          className="text-sm px-4 py-2 rounded border border-border/50 hover:border-border text-muted-foreground hover:text-foreground"
        >
          Skip
        </button>
        <button
          data-testid="portrait-confirm"
          onClick={() => {
            if (selectedSlug) onConfirm(selectedSlug);
          }}
          disabled={selectedSlug === null}
          className="text-sm px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
