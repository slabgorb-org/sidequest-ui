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
  /** Current rig composure. Absent/undefined when character has no rig. */
  rig_composure_current?: number;
  /** Maximum rig composure. Absent/undefined when character has no rig. */
  rig_composure_max?: number;
  /** Crash-related injury statuses (e.g. 'injury', 'dismounted'). */
  injury_tags?: string[];
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
        {data.portrait_url && (
          <img
            src={data.portrait_url}
            alt={data.name}
            className="w-24 h-24 rounded object-cover"
          />
        )}
        <div>
          <h2 className="text-2xl font-bold text-[var(--primary)]">
            {data.name}
            {data.player_id ? (
              <span
                data-testid="character-sheet-player-name"
                className="ml-2 text-sm font-normal text-muted-foreground"
              >
                — {data.player_id}
              </span>
            ) : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            Level {data.level}{' '}
            {data.class_reference_url ? (
              <a
                href={data.class_reference_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                {toDisplayName(data.class)}
              </a>
            ) : (
              toDisplayName(data.class)
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

      {(data.rig_composure_current != null && data.rig_composure_max != null) && (
        <div data-testid="rig-composure-section" className="space-y-2">
          <h3 className="text-sm font-semibold mb-1">Composure</h3>
          <div className="flex gap-4">
            {data.hp != null && data.hp_max != null && (
              <div className="flex-1">
                <span className="text-xs text-muted-foreground">Edge</span>
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
    </div>
  );
}
