/**
 * The ONE name-for-display helper, shared by every surface that shows the player a
 * seated actor (story 166-10 / ADR-156 §6).
 *
 * THE RULE
 * --------
 *   Every field the player READS shows `display_name ?? name`.
 *   Every field the engine RESOLVES BY stays the canonical seat id (`name`).
 *
 * `name` is a load-bearing entity id, not a label: the server resolves the
 * opponent's stat block by it (`find_creature_core`), and tag targets,
 * initiative tokens, sealed commits and the Fate attack-target `<option value>`
 * all carry it. Repoint it to make the display right and the enemy on screen
 * becomes one the engine cannot find — round 1 of 166-10 shipped exactly that.
 *
 * So the stage name the narrator's prose gives a generic Other arrives as a
 * SEPARATE field, and this helper is the only thing that chooses between them.
 * It lives in `lib/` rather than inside a component because there is more than
 * one confrontation surface: `ConfrontationOverlay` (the seven Without-Number
 * packs) and `FateConflictSurface` (pulp_noir, spaghetti_western, tea_and_murder,
 * wry_whimsy). They must never disagree about what an enemy is called.
 */

/** The display-relevant shape of any seated actor on the wire — an
 *  `EncounterActor` (confrontation payload) or a `FateConflictParticipant`
 *  (Fate payload). Both carry the canonical seat id plus an optional stage name. */
export interface DisplayableActor {
  name: string;
  display_name?: string | null;
}

/** De-underscore + capitalize the first letter of each segment; the rest of each
 * segment is left untouched, so an already-humanized real name ("Kanga
 * Moana-Teru") passes through unchanged rather than being lower-cased and
 * mangled. Same transform the spell-id picker uses. */
export function humanizeActorName(name: string): string {
  return name
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The name to SHOW for an actor: its stage name if the world has given it one,
 * otherwise its seat id. Both go through the same humanizing transform — a
 * narrator-invented stage name can arrive slugged just as a seat id can. */
export function actorDisplayName(actor: DisplayableActor): string {
  return humanizeActorName(actor.display_name ?? actor.name);
}
