export interface CharacterSummary {
  player_id: string;
  name: string;
  character_name: string;
  portrait_url?: string;
  hp: number;
  hp_max: number;
  /**
   * Story 68-1: per-genre label for the survivability pool (Composure /
   * Standing / Poise on social packs). Undefined ⇒ surfaces render the
   * default "HP". Genre-level — uniform across the party.
   */
  survivability_pool_label?: string;
  status_effects: string[];
  class: string;
  level: number;
  current_location: string;
  rig_composure_current?: number;
  rig_composure_max?: number;
  injury_tags?: string[];
}

/**
 * Narrator-recruited NPC companion (hireling / retainer / ally).
 *
 * Distinct from {@link CharacterSummary}: companions have no Edge bar /
 * inventory / sheet at this tier — they are roster visibility only,
 * surfaced in PARTY_STATUS so the Party panel can render the full
 * active roster (PCs + hirelings). Wired in the 2026-05-06 playtest
 * recruitment fix.
 */
export interface CompanionSummary {
  name: string;
  role: string;
  description: string;
  notes: string;
  recruited_turn: number;
  recruited_by: string;
}
