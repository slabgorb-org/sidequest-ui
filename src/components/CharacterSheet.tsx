export type AbilitySource = "Race" | "Class" | "Item" | "Play";

export interface AbilityDefinition {
  name: string;
  genre_description: string;
  mechanical_effect: string;
  involuntary: boolean;
  source: AbilitySource;
}

export interface CharacterSheetData {
  name: string;
  class: string;
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
  class_moves: string[];
  backstory: string;
  portrait_url?: string;
  current_location?: string;
  /** Controlling player's name (== PARTY_STATUS `member.player_id` as
   *  returned by the server; the server stores the player's login
   *  displayName there). Populated only in multiplayer sessions — App.tsx
   *  leaves this undefined in single-player so the header renders the
   *  character name only. Story 56-1. */
  player_id?: string;
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
            Level {data.level} {toDisplayName(data.class)}
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

      {data.abilities.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1">Abilities</h3>
          <ul className="list-disc list-inside text-sm">
            {data.abilities.map((ability) => (
              <li key={ability.name}>{toDisplayName(ability.name)}</li>
            ))}
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
