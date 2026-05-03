import { getCharacterBars, type LedgerBar, type MagicState } from "../types/magic";

interface SensitivitiesSectionProps {
  magicState: MagicState | null;
  characterId: string;
}

const PRE_BLEED_COPY = "You hear what the others don't. Sometimes.";

function anyBarDrifted(bars: LedgerBar[]): boolean {
  return bars.some((b) => b.value !== b.spec.starts_at_chargen);
}

/**
 * Names the player's coyote_star "Reader" capacity on the Abilities tab.
 *
 * The world's microbleeds (mug jitters, dust profile carries after-rain,
 * the hum that isn't yours) are easy to read as atmosphere — Keith's own
 * playtest confirmed they vanish unnamed. This subsection makes the
 * capacity legible without giving the player a verb list (per CLAUDE.md
 * Zork: no closed option set in the input path). Two states:
 *
 * - Pre-bleed (all character bars at starts_at_chargen): one cryptic line.
 * - Post-bleed (any bar drifted): expanded framing + cost vocabulary.
 *
 * Returns null when there are no character bars to interpret — covers
 * other genres + pre-magic worlds with no extra gating.
 */
export function SensitivitiesSection({
  magicState,
  characterId,
}: SensitivitiesSectionProps) {
  if (magicState == null) return null;
  const bars = getCharacterBars(magicState, characterId);
  if (bars.length === 0) return null;

  const drifted = anyBarDrifted(bars);

  return (
    <section className="sensitivities-section mt-4 pt-3 border-t border-border/30">
      <h3 className="text-sm italic font-semibold mb-2 text-muted-foreground">
        Sensitivities
      </h3>
      {drifted ? null : (
        <p className="text-sm italic text-muted-foreground/80">{PRE_BLEED_COPY}</p>
      )}
    </section>
  );
}
