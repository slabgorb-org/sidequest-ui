import type { NarratorVerbosity } from "@/types/protocol";

const OPTIONS: { value: NarratorVerbosity; label: string; subtitle: string }[] = [
  { value: "concise", label: "Concise", subtitle: "Brief — 1–2 sentences, action over atmosphere" },
  { value: "standard", label: "Standard", subtitle: "Balanced detail and pacing" },
  { value: "verbose", label: "Verbose", subtitle: "Elaborate, atmospheric prose" },
];

/**
 * Story 82-2 (ADR-049) — narrator verbosity control (how MUCH the narrator
 * says). Segmented radiogroup matching ModePicker's lobby idiom; the chosen
 * value rides the CONNECT payload (`narrator_verbosity`) and is read into the
 * server's per-turn TurnContext. Pairs with VocabularySlider (which tunes
 * diction, an independent axis).
 */
export function VerbositySlider({
  value,
  onChange,
}: {
  value: NarratorVerbosity;
  onChange: (v: NarratorVerbosity) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Narrator verbosity"
      data-testid="verbosity-slider"
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
            data-testid={`verbosity-option-${o.value}`}
            data-verbosity={o.value}
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
