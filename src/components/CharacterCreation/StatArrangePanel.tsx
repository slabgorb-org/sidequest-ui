import { useState } from "react";

interface ClassRequirement {
  name: string;
  requirementLabel: string;
}

export interface StatArrangePanelProps {
  pool: number[];
  assignment: Record<string, number | null>;
  classRequirements: ClassRequirement[];
  qualifyingClasses: string[];
  onAssign: (payload: { stat: string; value: number }) => void;
  onClear: (payload: { stat: string }) => void;
  onConfirm: () => void;
  onReject: () => void;
  confirmEnabled: boolean;
}

const STAT_ORDER = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export function StatArrangePanel({
  pool,
  assignment,
  classRequirements,
  qualifyingClasses,
  onAssign,
  onClear,
  onConfirm,
  onReject,
  confirmEnabled,
}: StatArrangePanelProps) {
  const [selectedPoolIdx, setSelectedPoolIdx] = useState<number | null>(null);

  const handlePoolClick = (idx: number) => {
    setSelectedPoolIdx(idx === selectedPoolIdx ? null : idx);
  };

  const handleSlotClick = (stat: string) => {
    if (assignment[stat] !== null) {
      onClear({ stat });
      return;
    }
    if (selectedPoolIdx === null) return;
    onAssign({ stat, value: pool[selectedPoolIdx] });
    setSelectedPoolIdx(null);
  };

  return (
    <div data-testid="stat-arrange-panel" className="flex flex-col gap-4 w-full max-w-xl">
      <div className="border-b border-border/40 pb-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-2">Pool</div>
        <div className="flex gap-2 flex-wrap">
          {pool.map((value, idx) => (
            <button
              key={idx}
              data-testid={`arrange-pool-value-${idx}`}
              data-selected={selectedPoolIdx === idx}
              onClick={() => handlePoolClick(idx)}
              className={`w-12 h-12 rounded border tabular-nums text-lg font-bold ${
                selectedPoolIdx === idx
                  ? "bg-primary/20 border-primary ring-2 ring-primary/50"
                  : "bg-card/50 border-border/50 hover:border-border"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {STAT_ORDER.map((stat) => {
          const value = assignment[stat];
          return (
            <button
              key={stat}
              data-testid={`arrange-slot-${stat}`}
              onClick={() => handleSlotClick(stat)}
              className="flex flex-col items-center rounded bg-background/40 border border-border/40 py-2 hover:border-border"
            >
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                {stat}
              </span>
              <span className="text-lg font-bold text-[var(--primary)] tabular-nums">
                {value ?? "—"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-border/40 pt-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-2">
          Qualifies
        </div>
        <ul className="text-sm space-y-1">
          {classRequirements.map((req) => {
            const qualifies = qualifyingClasses.includes(req.name);
            return (
              <li
                key={req.name}
                data-testid={`arrange-class-${req.name}`}
                data-qualifies={qualifies}
                className={
                  qualifies
                    ? "text-foreground"
                    : "text-muted-foreground/60 line-through"
                }
              >
                {qualifies ? "✓" : "✗"} {req.name} ({req.requirementLabel})
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex gap-3 justify-between border-t border-border/40 pt-3">
        <button
          data-testid="arrange-reject"
          onClick={onReject}
          className="text-sm px-4 py-2 rounded border border-border/50 hover:border-border text-muted-foreground hover:text-foreground"
        >
          Reject these dice
        </button>
        <button
          data-testid="arrange-confirm"
          onClick={onConfirm}
          disabled={!confirmEnabled}
          className="text-sm px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm arrangement
        </button>
      </div>
    </div>
  );
}
