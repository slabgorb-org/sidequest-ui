// Pure mappers extracted from App.tsx's PARTY_STATUS handler. Kept pure so the
// wire → UI-type assembly is unit-testable without rendering the App — the
// component tests for CharacterPanel exercise the render site, but only these
// mappers prove the wire field (`player_identity`, story 67-6) is carried
// through production. See sidequest-ui/CLAUDE.md "Every Test Suite Needs a
// Wiring Test."

import type { CharacterSheetData, AbilityDefinition, ClassMove } from "@/components/CharacterSheet";
import type { CreationAnswer } from "@/types/payloads";
import type { CharacterSummary } from "@/types/party";

/**
 * Map a single PARTY_STATUS member (raw wire object) into the roster-facing
 * {@link CharacterSummary}. Mirrors the inline `members.map(...)` in App.tsx.
 *
 * Story 67-6: `player_identity` (authenticated email / dev host) rides
 * alongside `player_id` (display-name handle). Undefined when the server has
 * not resolved identity or the peer is disconnected.
 */
export function toCharacterSummary(m: Record<string, unknown>): CharacterSummary {
  return {
    player_id: (m.player_id as string) ?? "",
    player_identity: (m.player_identity as string) || undefined,
    name: (m.name as string) ?? "",
    character_name: (m.character_name as string) ?? (m.name as string) ?? "",
    hp: (m.current_hp as number) ?? 0,
    hp_max: (m.max_hp as number) ?? 0,
    // Story 68-1: genre survivability label (undefined ⇒ surfaces show "HP").
    survivability_pool_label:
      typeof m.survivability_pool_label === "string"
        ? (m.survivability_pool_label as string)
        : undefined,
    status_effects: (m.statuses as string[]) ?? [],
    class: (m.class as string) ?? "",
    level: (m.level as number) ?? 1,
    portrait_url: (m.portrait_url as string) || undefined,
    current_location: (m.current_location as string) ?? "",
  };
}

/**
 * Assemble the UI-facing {@link CharacterSheetData} from a PARTY_STATUS member
 * (`rawLocal`, the local player's wire object) plus its nested `sheet` facet.
 * Mirrors the inline `built: CharacterSheetData` assembly in App.tsx.
 *
 * `isMultiplayer` gates the identity treatment: in single-player the suffix
 * fields (`player_id`, `player_identity`) are left undefined so the header
 * renders the character name only (load-bearing AC-4, story 56-1). Story 67-6
 * extends this with `player_identity`, which the CharacterPanel suffix prefers
 * over `player_id`.
 */
export function toCharacterSheetData(
  rawLocal: Record<string, unknown>,
  sheetFacet: Record<string, unknown>,
  isMultiplayer: boolean,
): CharacterSheetData {
  return {
    name: (rawLocal.character_name as string) ?? (rawLocal.name as string) ?? "",
    class: (rawLocal.class as string) ?? "",
    class_reference_url: (rawLocal.class_reference_url as string | null | undefined) ?? null,
    race: (sheetFacet.race as string) || undefined,
    calling_label: (sheetFacet.calling_label as string) || undefined,
    origin_label: (sheetFacet.origin_label as string) || undefined,
    level: (rawLocal.level as number) ?? 1,
    hp: typeof rawLocal.current_hp === "number" ? (rawLocal.current_hp as number) : undefined,
    hp_max: typeof rawLocal.max_hp === "number" ? (rawLocal.max_hp as number) : undefined,
    // Story 68-1: genre survivability label for the sheet's HP badge.
    survivability_pool_label:
      typeof rawLocal.survivability_pool_label === "string"
        ? (rawLocal.survivability_pool_label as string)
        : undefined,
    stats: (sheetFacet.stats as Record<string, number>) ?? {},
    abilities: (sheetFacet.abilities as AbilityDefinition[]) ?? [],
    class_moves: (sheetFacet.class_moves as ClassMove[]) ?? [],
    backstory: (sheetFacet.backstory as string) ?? "",
    portrait_url: (rawLocal.portrait_url as string) || undefined,
    current_location: (rawLocal.current_location as string) ?? "",
    player_id: isMultiplayer
      ? ((rawLocal.player_id as string) || undefined)
      : undefined,
    // Story 67-6: authenticated identity, MP-gated like player_id. The
    // CharacterPanel suffix prefers this over player_id; undefined ⇒ no
    // fabricated suffix for a disconnected peer.
    player_identity: isMultiplayer
      ? ((rawLocal.player_identity as string) || undefined)
      : undefined,
    rig_composure_current: typeof rawLocal.rig_composure_current === "number" ? rawLocal.rig_composure_current as number : undefined,
    rig_composure_max: typeof rawLocal.rig_composure_max === "number" ? rawLocal.rig_composure_max as number : undefined,
    injury_tags: Array.isArray(rawLocal.injury_tags) ? rawLocal.injury_tags as string[] : undefined,
    // Story 93-3: durable chargen provenance for the History section. NOT
    // identity-gated — a solo player's own chargen history is theirs to see, so
    // this is threaded regardless of isMultiplayer (unlike player_id). Absent
    // facet ⇒ undefined (no fabrication; the component then renders no History).
    creation_answers: Array.isArray(sheetFacet.creation_answers)
      ? (sheetFacet.creation_answers as CreationAnswer[])
      : undefined,
    // ADR-143 Task 11: WN-family skills/foci ride the sheet facet
    // (members[].sheet.skills / .foci). NOT identity-gated — a player's own
    // mechanical surface is theirs to see regardless of MP. The server sends
    // {} / [] for non-WN characters; the CharacterSheet renders the Skills /
    // Foci sections only when non-empty, so an empty pass-through stays
    // hidden (no fabrication of sections for non-WN packs).
    skills:
      sheetFacet.skills && typeof sheetFacet.skills === "object"
        ? (sheetFacet.skills as Record<string, number>)
        : undefined,
    foci: Array.isArray(sheetFacet.foci) ? (sheetFacet.foci as string[]) : undefined,
  };
}
