import type { CSSProperties } from "react";
import {
  getCharacterBars,
  getWorldBars,
  type LedgerBar,
  type MagicState,
} from "../types/magic";

interface LedgerPanelProps {
  magicState: MagicState | null;
  characterId: string;
}

const NEAR_THRESHOLD_RATIO = 0.10;  // within 10% of threshold = highlight

function isNearThreshold(bar: LedgerBar): boolean {
  const { spec, value } = bar;
  const span = spec.range[1] - spec.range[0];
  if (spec.direction === "down" && spec.threshold_low != null) {
    return value - spec.threshold_low <= NEAR_THRESHOLD_RATIO * span;
  }
  if (spec.direction === "up" && spec.threshold_high != null) {
    return spec.threshold_high - value <= NEAR_THRESHOLD_RATIO * span;
  }
  return false;
}

function computeBarFillRatio(bar: LedgerBar): number {
  const { spec, value } = bar;
  const [lo, hi] = spec.range;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

function BarRow({ bar }: { bar: LedgerBar }) {
  const fill = computeBarFillRatio(bar);
  const near = isNearThreshold(bar);
  const fillStyle: CSSProperties = {
    width: `${fill * 100}%`,
    transition: "width 600ms ease-out",
  };
  const className = `ledger-bar ${near ? "near-threshold" : ""}`.trim();
  // Phase 5 (Story 47-3): when the bar carries a `promote_to_status`
  // and is near or past its threshold, surface the promotion as a
  // preview node so the player sees the impending Status without
  // opening a separate panel. The data-promotion-severity attribute
  // is the stable selector tests + theme styling pin against.
  const promotion = bar.spec.promote_to_status ?? null;
  const showPromotion = promotion !== null && near;
  return (
    <div
      className={className}
      data-testid={`ledger-${bar.spec.id}`}
      {...(showPromotion
        ? { "data-promotion-severity": promotion!.severity }
        : {})}
    >
      <div className="ledger-bar-label flex justify-between items-center text-xs">
        <span className="bar-id text-[var(--primary)]">{bar.spec.id}</span>
        <span className="bar-value font-mono">{bar.value.toFixed(2)}</span>
      </div>
      <div className="ledger-bar-track h-1.5 rounded-sm bg-[var(--surface)] overflow-hidden">
        <div
          className="ledger-bar-fill h-full bg-[var(--primary)]/70"
          style={fillStyle}
        />
      </div>
      {showPromotion && (
        <div
          className={`ledger-bar-promotion text-[10px] uppercase tracking-wide promotion-${promotion!.severity.toLowerCase()}`}
          data-promotion-severity={promotion!.severity}
        >
          {promotion!.severity} · {promotion!.text}
        </div>
      )}
    </div>
  );
}

export function LedgerPanel({ magicState, characterId }: LedgerPanelProps) {
  if (magicState == null) return null;

  const characterBars = getCharacterBars(magicState, characterId);
  const worldBars = getWorldBars(magicState);

  if (characterBars.length === 0 && worldBars.length === 0) return null;

  return (
    <div className="ledger-panel space-y-3 p-3 border-t border-border/30">
      {characterBars.length > 0 && (
        <section className="ledger-character-bars space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Magic ledger
          </h4>
          {characterBars.map((bar) => (
            <BarRow key={bar.spec.id} bar={bar} />
          ))}
        </section>
      )}
      {worldBars.length > 0 && (
        <section className="ledger-world-bars space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            The Reach
          </h4>
          {worldBars.map((bar) => (
            <BarRow key={bar.spec.id} bar={bar} />
          ))}
        </section>
      )}
    </div>
  );
}
