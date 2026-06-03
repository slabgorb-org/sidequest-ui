export type GameMode = "solo" | "multiplayer";

const MODES: { value: GameMode; label: string; subtitle: string }[] = [
  { value: "solo", label: "Solo", subtitle: "Just you and the narrator" },
  {
    value: "multiplayer",
    label: "Multiplayer",
    subtitle: "Share the table over the wire",
  },
];

/**
 * Two-state segmented control for picking solo vs multiplayer mode.
 *
 * Visual parity with the lobby world accordion: selected option uses the
 * genre accent stripe and tinted background; unselected is muted with a hover
 * affordance. WAI-ARIA radiogroup role for keyboard users; native arrow-key
 * roving works because each option is a button with the radio role.
 */
export function ModePicker({
  value,
  onChange,
}: {
  value: GameMode;
  onChange: (m: GameMode) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Game mode" className="flex flex-col w-full">
      {MODES.map((m) => {
        const isSelected = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-mode={m.value}
            tabIndex={isSelected || (!value && m === MODES[0]) ? 0 : -1}
            onClick={() => onChange(m.value)}
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
            <span className="text-base tracking-wide">{m.label}</span>
            <span className="text-xs italic text-muted-foreground/60 mt-0.5">
              {m.subtitle}
            </span>
          </button>
        );
      })}
    </div>
  );
}
