import type { CharacterSummary } from "@/types/party";
import { cn } from "@/lib/utils";

/**
 * Story 69-2 — co-located high-contrast HP pip scale.
 *
 * A compact, glanceable HP readout meant to sit next to the action input on
 * the opening gameboard, so mechanics-first players (Sebastien, Jade) can see
 * the numbers backing the narration without clicking into the CharacterPanel
 * Dockview tab. This is a PLAYER-FACING surface — no OTEL / telemetry here.
 *
 * Reuses the established CharacterPanel HP idiom: a "HP cur/max" label, one
 * pip per max-HP unit, and a destructive (danger) tone once the pool drops to
 * 25% or below. Colors come from the ADR-079 theme tokens (`--primary`,
 * `--border`, and the `destructive` palette) so the scale stays genre-true and
 * high-contrast — never hardcoded hex.
 */

const DANGER_RATIO = 0.25;

export interface HpPipScaleProps {
  characters: CharacterSummary[];
  /** The local player's id; resolves which character's HP sits at the input. */
  currentPlayerId?: string;
}

export function HpPipScale({ characters, currentPlayerId }: HpPipScaleProps) {
  // The scale co-located with the input shows the LOCAL player's own pool
  // (context-story-69-2 Assumptions: single active PC at the opening board).
  // Fall back to the first character when no id matches.
  const local =
    characters.find((c) => c.player_id === currentPlayerId) ?? characters[0];

  return (
    <div
      data-testid="input-hp-scale"
      className="flex items-center gap-2 px-1 py-1"
    >
      {local && <HpPipGroup character={local} />}
    </div>
  );
}

function HpPipGroup({ character }: { character: CharacterSummary }) {
  const { player_id, hp, hp_max } = character;
  // Guard division: an unknown/zero max is treated as full (not danger), and
  // 0 current HP is a real value (danger), never conflated with "missing".
  const ratio = hp_max > 0 ? hp / hp_max : 1;
  const danger = ratio <= DANGER_RATIO;
  const cap = Math.max(0, hp_max);

  return (
    <div
      data-testid={`hp-pip-group-${player_id}`}
      aria-label={`HP ${hp} of ${hp_max}`}
      title="HP / Vitality"
      className={cn(
        "flex items-center gap-1.5 font-mono text-xs tabular-nums",
        danger ? "text-destructive" : "text-[var(--primary)]",
      )}
    >
      <span className="whitespace-nowrap font-semibold">
        HP {hp}/{hp_max}
      </span>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: cap }).map((_, i) => {
          const filled = i < hp;
          return (
            <span
              key={`pip-${i}`}
              data-testid="hp-pip"
              data-filled={filled ? "true" : "false"}
              className={cn(
                "inline-block h-2 w-2 rounded-[1px] border",
                filled
                  ? danger
                    ? "bg-destructive border-destructive"
                    : "bg-[var(--primary)] border-[var(--primary)]"
                  : "bg-transparent border-[var(--border)]",
              )}
            />
          );
        })}
      </span>
    </div>
  );
}
