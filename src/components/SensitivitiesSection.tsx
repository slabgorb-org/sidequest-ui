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
      {drifted ? (
        <div className="space-y-2 text-sm text-foreground/85">
          <p>Something stirred. You felt it.</p>
          <p>
            The substrate has weight — the hum behind the hum, the thing
            the dust profile carries that isn't dust. You can answer. You
            can refuse. You can push deeper. You can sit with it.
          </p>
          <p>
            <strong>Sanity</strong> is the price of staying open.{" "}
            <strong>Notice</strong> measures what you catch.{" "}
            <strong>Vitality</strong> decides whether you can carry it back.
          </p>
          <p>
            No one taught you the shape of this. You learn by reaching, or
            by flinching.
          </p>
          <p className="italic text-muted-foreground/80">
            Your own words, in the input bar.
          </p>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground/80">{PRE_BLEED_COPY}</p>
      )}
    </section>
  );
}
