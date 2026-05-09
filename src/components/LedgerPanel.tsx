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
  // Story 47-10 — when set, the prepared-spells list pulses to surface
  // a recent unprepared-cast rejection (pulse-not-popup UX). Cleared
  // by the parent ~600ms after the pulse fires.
  rejectedSpellId?: string | null;
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

// Story 47-10 — MagicBlock renders the learned_v1 surface (known spells,
// prepared spells per level with slot indicator, spent spells struck-through-
// but-visible until rest). Hidden when the actor has no prepared_spells
// entry (non-caster or fresh-rest pre-prepare state).
function MagicBlock({
  magicState,
  characterId,
  rejectedSpellId,
}: {
  magicState: MagicState;
  characterId: string;
  rejectedSpellId: string | null | undefined;
}) {
  const known = magicState.known_spells?.[characterId] ?? [];
  const prepared = magicState.prepared_spells?.[characterId] ?? {};
  const spent = magicState.spent_spells?.[characterId] ?? {};

  const hasPrepared = Object.values(prepared).some((spells) => spells.length > 0);
  if (!hasPrepared) return null;

  // Per-level slot bars are stored on the ledger as `slots_l<N>`.
  const slotForLevel = (level: number): { value: number; max: number } | null => {
    const key = `character|${characterId}|slots_l${level}`;
    const bar = magicState.ledger[key];
    if (!bar) return null;
    return { value: bar.value, max: bar.spec.range[1] };
  };

  const sortedLevels = Object.keys(prepared)
    .map((k) => Number(k))
    .filter((n) => prepared[n]?.length > 0)
    .sort((a, b) => a - b);

  const pulseClass = rejectedSpellId ? "pulse" : "";

  return (
    <section className="ledger-magic-block space-y-2" data-testid="magic-block">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Memorized magic
      </h4>
      {known.length > 0 && (
        <details className="known-spells text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Known spells ({known.length})
          </summary>
          <ul className="pl-4 pt-1 space-y-0.5 font-mono text-[11px]">
            {known.map((sid) => (
              <li key={sid}>{sid}</li>
            ))}
          </ul>
        </details>
      )}
      <div
        className={`prepared-spells-list space-y-1 ${pulseClass}`}
        data-testid="magic-block-prepared"
        data-pulse={rejectedSpellId ? "true" : undefined}
      >
        {sortedLevels.map((level) => {
          const slots = slotForLevel(level);
          const spentAtLevel = spent[level] ?? [];
          return (
            <div key={`l${level}`} className="prepared-level text-xs">
              <span className="level-label font-mono mr-2">L{level}</span>
              {slots && (
                <span className="slot-indicator font-mono mr-2">
                  {slots.value.toFixed(0)}/{slots.max.toFixed(0)} slots
                </span>
              )}
              <span className="spell-list">
                {prepared[level].map((sid, i) => {
                  const isSpent = spentAtLevel.includes(sid);
                  const isRejected = rejectedSpellId === sid;
                  const className = [
                    "spell-name",
                    isSpent ? "spent" : "",
                    isRejected ? "struck rejected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <span key={`${sid}-${i}`}>
                      {i > 0 && ", "}
                      {isSpent ? (
                        <s className={className}>{sid}</s>
                      ) : (
                        <span className={className}>{sid}</span>
                      )}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LedgerPanel({
  magicState,
  characterId,
  rejectedSpellId,
}: LedgerPanelProps) {
  if (magicState == null) return null;

  const characterBars = getCharacterBars(magicState, characterId);
  const worldBars = getWorldBars(magicState);
  const hasPrepared = Object.values(
    magicState.prepared_spells?.[characterId] ?? {},
  ).some((spells) => spells.length > 0);

  if (characterBars.length === 0 && worldBars.length === 0 && !hasPrepared) {
    return null;
  }

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
      <MagicBlock
        magicState={magicState}
        characterId={characterId}
        rejectedSpellId={rejectedSpellId ?? null}
      />
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
