import type { CreationAnswer, LinkedLoreFragment } from "@/types/payloads";
import { PortraitFrame } from "./PortraitFrame";

export type AbilitySource = "Race" | "Class" | "Item" | "Play";

export interface AbilityDefinition {
  name: string;
  genre_description: string;
  mechanical_effect: string;
  involuntary: boolean;
  source: AbilitySource;
  /** URL to the reference page anchor; null when no anchor exists. */
  reference_url?: string | null;
}

/** A resolved class move (confrontation beat) for the Abilities panel.
 *  Mirrors the server's protocol `ClassMove` (id + label + optional
 *  description). The UI renders `label` with `description` as a tooltip. */
export interface ClassMove {
  id: string;
  label: string;
  description?: string;
}

export interface CharacterSheetData {
  name: string;
  class: string;
  /** Server-attached URL into /reference/rules/<pack>#class-<slug>;
   *  populated when the class is a known classes.yaml entry on the
   *  active genre pack. Null/absent when no anchor exists. */
  class_reference_url?: string | null;
  /** Race label ("Uplifted Animal", "Beastkin", "Human"). Server emits this on
   *  PARTY_STATUS as `members[].sheet.race`. Used as the sheet subtitle —
   *  previously the subtitle showed the genre slug, which is wrong (the genre
   *  is the rulebook, not part of character identity). */
  race?: string;
  /** Display-only flavor label for Calling — the chargen phrase the player
   *  chose ("Country Veterinary Surgeon") when it differs from the collapsed
   *  mechanical class ("Doctor"). Server emits it on PARTY_STATUS as
   *  `members[].sheet.calling_label`; the panel renders it OVER `class`.
   *  Absent when the label is the archetype (UI falls back to `class`). */
  calling_label?: string;
  /** Display-only flavor label for Origin ("The Village Itself") shown OVER
   *  `race`. Emitted as `members[].sheet.origin_label`; absent when the label
   *  is the archetype (UI falls back to `race`). */
  origin_label?: string;
  level: number;
  /** Current edge (composure). Sourced from PARTY_STATUS members[].current_hp.
   *  ADR-014 / ADR-078: HP was removed from CreatureCore in favor of EdgePool;
   *  the wire field is still named current_hp until the protocol-level rename
   *  ships, but the value is character.core.edge.current. Surfaced in the
   *  CharacterPanel header so Sebastien-axis (mechanical) players can see
   *  how close they are to a yield. */
  hp?: number;
  /** Maximum edge (composure ceiling). Sourced from PARTY_STATUS
   *  members[].max_hp. See `hp` field doc for the legacy-name caveat. */
  hp_max?: number;
  /** Story 68-1: per-genre label for the survivability (HP) pool — Composure /
   *  Standing / Poise on social packs. Sourced from PARTY_STATUS
   *  members[].survivability_pool_label. Absent ⇒ the badge renders "HP"
   *  (mechanical packs unchanged). */
  survivability_pool_label?: string;
  stats: Record<string, number>;
  abilities: AbilityDefinition[];
  /** Resolved confrontation-beat choices for the Abilities panel. Each carries
   *  the human label + an optional description (server resolves the bare beat
   *  id via /api/.. CharacterSheetDetails.class_moves). Playtest 2026-05-21:
   *  these used to render as raw snake_case ids. */
  class_moves: ClassMove[];
  backstory: string;
  portrait_url?: string;
  current_location?: string;
  /** Controlling player's name (== PARTY_STATUS `member.player_id` as
   *  returned by the server; the server stores the player's login
   *  displayName there). Populated only in multiplayer sessions — App.tsx
   *  leaves this undefined in single-player so the header renders the
   *  character name only. Story 56-1. */
  player_id?: string;
  /** Authenticated player identity (email / dev host) from PARTY_STATUS
   *  `member.player_identity`. Distinct from `player_id` (display-name
   *  handle). The suffix prefers this field when present, falling back to
   *  `player_id`. Undefined when server has not resolved identity or peer
   *  is disconnected — must never produce a fabricated suffix. Story 67-6. */
  player_identity?: string;
  /** Current rig composure. Absent/undefined when character has no rig. */
  rig_composure_current?: number;
  /** Maximum rig composure. Absent/undefined when character has no rig. */
  rig_composure_max?: number;
  /** Crash-related injury statuses (e.g. 'injury', 'dismounted'). */
  injury_tags?: string[];
  /** Durable per-scene chargen answers (story 93-2). The History section
   *  (story 93-3) renders one Origin row per entry. Absent/empty on legacy
   *  saves ⇒ no History section. */
  creation_answers?: CreationAnswer[];
  /** Player-linked creation-seed lore fragments (story 93-4). Rendered as a
   *  "Lore" subsection beneath the origin block inside the History section.
   *  Absent/empty ⇒ no Lore subsection. */
  lore_fragments?: LinkedLoreFragment[];
  /** WN-family skill name → level mapping (ADR-143 Task 11). Absent/empty
   *  for non-WN characters — Skills section is NOT rendered when empty.
   *  Mechanics-first: Sebastien/Jade axis — the math must be legible. */
  skills?: Record<string, number>;
  /** WN-family focus ids (ADR-143 Task 11). Absent/empty for non-WN
   *  characters — Foci section is NOT rendered when empty. */
  foci?: string[];
}

export interface CharacterSheetProps {
  data: CharacterSheetData;
}

/** Convert snake_case or kebab-case identifiers to title case display names. */
function toDisplayName(id: string): string {
  return id
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CharacterSheet({ data }: CharacterSheetProps) {
  return (
    <div data-testid="character-sheet" className="p-6 space-y-4">
      <div className="flex items-start gap-4">
        <PortraitFrame
          url={data.portrait_url}
          name={data.name}
          sizeClass="w-24 h-24"
          radiusClass="rounded-xl"
          initialsClassName="bg-[var(--surface)] text-[var(--primary)] text-3xl font-semibold border border-[var(--primary)]/30"
        />
        <div>
          <h2 className="text-2xl font-bold text-[var(--primary)]">
            {data.name}
            {data.player_id && data.player_id !== data.name ? (
              <span
                data-testid="character-sheet-player-name"
                className="ml-2 text-sm font-normal text-muted-foreground"
              >
                — {data.player_id}
              </span>
            ) : null}
          </h2>
          {/* Prefer the chargen flavor label ("Country Veterinary Surgeon")
              over the collapsed mechanical class ("Doctor"), but keep the link
              to the mechanical class rules page — flavor text, mechanical
              anchor. Falls back to the class slug when no label was emitted. */}
          <p className="text-sm text-muted-foreground">
            Level {data.level}{' '}
            {data.class_reference_url ? (
              <a
                href={data.class_reference_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                {data.calling_label || toDisplayName(data.class)}
              </a>
            ) : (
              data.calling_label || toDisplayName(data.class)
            )}
          </p>
          {data.current_location && (
            <p data-testid="character-location" className="text-sm text-muted-foreground/80 mt-1">
              {data.current_location}
            </p>
          )}
        </div>
      </div>

      {Object.keys(data.stats).length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(data.stats).sort(([a], [b]) => a.localeCompare(b)).map(([stat, value]) => (
            <div key={stat} className="flex justify-between px-2 py-1 rounded bg-[var(--surface)]">
              <span className="text-[var(--primary)]">{toDisplayName(stat)}</span>
              <span className="font-mono">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ADR-143 Task 11: WN-family Skills — only rendered when non-empty.
          Mirrors the Stats grid layout so the math is legible in the same
          visual language (mechanics-first — Sebastien/Jade axis). */}
      {data.skills && Object.keys(data.skills).length > 0 && (
        <div data-testid="character-skills">
          <h3 className="text-sm font-semibold mb-1">Skills</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.skills).sort(([a], [b]) => a.localeCompare(b)).map(([skill, level]) => (
              <div key={skill} className="flex justify-between px-2 py-1 rounded bg-[var(--surface)]">
                <span className="text-[var(--primary)]">{toDisplayName(skill)}</span>
                <span className="font-mono">{level}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADR-143 Task 11: WN-family Foci — only rendered when non-empty. */}
      {data.foci && data.foci.length > 0 && (
        <div data-testid="character-foci">
          <h3 className="text-sm font-semibold mb-1">Foci</h3>
          <ul className="list-disc list-inside text-sm">
            {data.foci.map((focus) => (
              <li key={focus}>{toDisplayName(focus)}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.rig_composure_current != null && data.rig_composure_max != null) && (
        <div data-testid="rig-composure-section" className="space-y-2">
          <h3 className="text-sm font-semibold mb-1">Composure</h3>
          <div className="flex gap-4">
            {data.hp != null && data.hp_max != null && (
              <div className="flex-1">
                <span
                  className="text-xs text-muted-foreground"
                  title={
                    data.survivability_pool_label
                      ? data.survivability_pool_label
                      : "HP / Vitality"
                  }
                >
                  {data.survivability_pool_label ?? "HP"}
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded bg-[var(--muted)]">
                    <div
                      className="h-2 rounded bg-[var(--primary)]"
                      style={{ width: `${(data.hp / data.hp_max) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono">{data.hp}/{data.hp_max}</span>
                </div>
              </div>
            )}
            <div className="flex-1">
              <span className="text-xs text-muted-foreground">Rig</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded bg-[var(--muted)]">
                  <div
                    className="h-2 rounded bg-[var(--accent)]"
                    style={{ width: `${(data.rig_composure_current / data.rig_composure_max) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono">{data.rig_composure_current}/{data.rig_composure_max}</span>
              </div>
            </div>
          </div>
          {data.injury_tags && data.injury_tags.length > 0 && (
            <div data-testid="injury-tags" className="text-xs text-[var(--accent)]">
              Injuries: {data.injury_tags.map((tag) => toDisplayName(tag)).join(', ')}
            </div>
          )}
        </div>
      )}

      {data.abilities.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1">Abilities</h3>
          <ul className="list-disc list-inside text-sm">
            {data.abilities.map((ability) => {
              const label = toDisplayName(ability.name);
              return (
                <li key={ability.name}>
                  {ability.reference_url ? (
                    <a
                      href={ability.reference_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      {label}
                    </a>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-1">Backstory</h3>
        <p className="text-sm font-[var(--font-narrative)]">{data.backstory}</p>
      </div>

      {/* History — story 93-3. Reads the durable chargen provenance
          (creation_answers) and lists, per scene, the prompt the player saw and
          the answer they gave. Structured as the future home for player-linked
          lore (93-4), but renders ONLY the Origin block now — no lore stubs.
          Renders nothing on legacy saves where creation_answers is absent/empty. */}
      {data.creation_answers && data.creation_answers.length > 0 && (
        <div data-testid="character-history">
          <h3 className="text-sm font-semibold mb-1">History</h3>
          <div data-testid="character-origin" className="space-y-2">
            {data.creation_answers.map((answer) => (
              <div key={answer.scene_id} className="text-sm">
                <p className="text-muted-foreground">{answer.prompt}</p>
                <p className="font-[var(--font-narrative)]">
                  {answer.value}
                  {answer.archetype_inferred && (
                    <span
                      data-testid="origin-inferred-badge"
                      className="ml-2 text-xs px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--accent)]"
                    >
                      inferred from your words
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
          {/* Lore — story 93-4. The character's own creation-seed lore
              fragments (server: members[].sheet.lore_fragments), shown
              beneath the origin block. Each row shows the fragment's title +
              summary; when the server provides a lore_route the title links
              to that page, otherwise it renders as plain text (No Silent
              Fallbacks — never a fabricated href). Renders nothing when there
              are no linked fragments. */}
          {data.lore_fragments && data.lore_fragments.length > 0 && (
            <div data-testid="history-lore" className="mt-3 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Lore
              </h4>
              {data.lore_fragments.map((fragment) => (
                <div
                  key={fragment.fragment_id}
                  data-testid="history-lore-item"
                  className="text-sm"
                >
                  {fragment.lore_route ? (
                    <a
                      href={fragment.lore_route}
                      className="font-[var(--font-narrative)] text-[var(--accent)] underline"
                    >
                      {fragment.title}
                    </a>
                  ) : (
                    <p className="font-[var(--font-narrative)]">{fragment.title}</p>
                  )}
                  <p className="text-muted-foreground">{fragment.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
