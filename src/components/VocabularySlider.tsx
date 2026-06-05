import type { NarratorVocabulary } from "@/types/protocol";

const OPTIONS: { value: NarratorVocabulary; label: string; subtitle: string }[] = [
  { value: "accessible", label: "Accessible", subtitle: "Simple, direct — ~8th-grade reading level" },
  { value: "literary", label: "Literary", subtitle: "Rich but clear; varied vocabulary" },
  { value: "epic", label: "Epic", subtitle: "Elevated, archaic, mythic diction" },
];

/**
 * Story 82-2 (ADR-049) — narrator vocabulary control (the DICTION register,
 * independent of length). Segmented radiogroup matching ModePicker's lobby
 * idiom; the chosen value rides the CONNECT payload (`narrator_vocabulary`) and
 * is read into the server's per-turn TurnContext. Pairs with VerbositySlider.
 */
export function VocabularySlider({
  value,
  onChange,
}: {
  value: NarratorVocabulary;
  onChange: (v: NarratorVocabulary) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Narrator vocabulary"
      data-testid="vocabulary-slider"
      className="flex flex-col w-full"
    >
      {OPTIONS.map((o) => {
        const isSelected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-testid={`vocabulary-option-${o.value}`}
            data-vocabulary={o.value}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`
              flex flex-col items-start
              w-full text-left px-3 py-2
              bg-transparent border-0 border-l-4
              transition-colors cursor-pointer
              focus-visible:outline-none focus-visible:bg-muted/20
              ${
                isSelected
                  ? "border-l-[var(--primary)] bg-[var(--primary)]/20 text-foreground font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                  : "border-l-transparent text-foreground/60 hover:border-l-muted-foreground/40 hover:bg-muted/20 hover:text-foreground/85"
              }
            `}
          >
            <span className="text-base tracking-wide">{o.label}</span>
            <span className="text-xs italic text-muted-foreground/60 mt-0.5">{o.subtitle}</span>
          </button>
        );
      })}
    </div>
  );
}
