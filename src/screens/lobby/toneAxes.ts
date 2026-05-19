/**
 * Narrative-axis → tone-chip translation.
 *
 * `axis_snapshot` is a `{ axis_name: float }` map from `world.yaml` where
 * values run 0.0–1.0 (midpoint 0.5 is "neutral"). The lobby preview
 * renders every authored axis as a tone chip so the player can read the
 * world's tagged fingerprint at a glance.
 *
 * Axis names are world-authored (cosy, gossip, chrome, weirdness, comedy,
 * stakes, etc.) — there is no canonical 5. The renderer is vocabulary-
 * agnostic: it just reports each axis as low / medium / high.
 *
 * Three buckets:
 *   v ≤ 0.33           → "low {axis}"
 *   0.33 < v < 0.67    → "medium {axis}"
 *   v ≥ 0.67           → "high {axis}"
 *
 * Chips are sorted by distance-from-neutral (most extreme first) so the
 * world's strongest signals lead. Medium chips (distance ≈ 0) trail at
 * the end of the list.
 */

export interface ToneChip {
  /** e.g. "low comedy", "medium chrome", "high cosy". */
  label: string;
  /** Bucket-indicator glyph: ▾ (low), ◇ (medium), ▴ (high). */
  glyph: string;
}

/** At or below this threshold, an axis reads as "low." */
const LOW_THRESHOLD = 0.33;
/** At or above this threshold, an axis reads as "high." */
const HIGH_THRESHOLD = 0.67;

const LOW_GLYPH = "▾";
const MEDIUM_GLYPH = "◇";
const HIGH_GLYPH = "▴";

/**
 * Produce a sorted list of tone chips from a world's axis snapshot.
 *
 * Every entry in `axis_snapshot` produces exactly one chip. Sort key is
 * distance from neutral (0.5), descending, so the most polarized axes
 * lead and medium chips trail.
 */
export function getToneChips(
  axis_snapshot: Record<string, number>,
): ToneChip[] {
  const chips: Array<{ chip: ToneChip; distance: number }> = [];

  for (const [axis, value] of Object.entries(axis_snapshot)) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `getToneChips: axis "${axis}" has non-finite value ${value}; ` +
          `world.yaml axis_snapshot must hold finite numbers in [0, 1].`,
      );
    }
    let label: string;
    let glyph: string;
    if (value <= LOW_THRESHOLD) {
      label = `low ${axis}`;
      glyph = LOW_GLYPH;
    } else if (value >= HIGH_THRESHOLD) {
      label = `high ${axis}`;
      glyph = HIGH_GLYPH;
    } else {
      label = `medium ${axis}`;
      glyph = MEDIUM_GLYPH;
    }
    const distance = Math.abs(value - 0.5);
    chips.push({ chip: { label, glyph }, distance });
  }

  chips.sort((a, b) => b.distance - a.distance);
  return chips.map((c) => c.chip);
}
