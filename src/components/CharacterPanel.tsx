import { useRef } from "react";
import type { CharacterSheetData } from "./CharacterSheet";
import { GenericResourceBar, type ResourceThreshold } from "./GenericResourceBar";
import { LedgerPanel } from "./LedgerPanel";
import { useLocalPrefs } from "@/hooks/useLocalPrefs";
import type { CharacterSummary } from "@/types/party";
import type { MagicState } from "@/types/magic";
import { SensitivitiesSection } from "./SensitivitiesSection";
type TabId = "stats" | "abilities" | "status";

export interface ResourcePool {
  value: number;
  max: number;
  thresholds: ResourceThreshold[];
}

interface CharacterPanelPrefs {
  activeTab: TabId;
  [key: string]: unknown;
}

const DEFAULTS: CharacterPanelPrefs = {
  activeTab: "stats",
};

export interface CharacterPanelProps {
  character: CharacterSheetData;
  resources?: Record<string, ResourcePool> | null;
  genreSlug?: string;
  onResourceThresholdCrossed?: (info: {
    resource: string;
    threshold: ResourceThreshold;
  }) => void;
  characters?: CharacterSummary[];
  currentPlayerId?: string;
  activePlayerId?: string | null;
  /** Magic ledger state (Coyote Star Phase 4). Null when the world has
   *  no magic configured — LedgerPanel renders nothing. characterId for
   *  ledger lookup is character.name (matches server add_character() contract).
   */
  magicState?: MagicState | null;
}

function toDisplayName(id: string): string {
  return id
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Cap at 2 initials — avatar badges are ~2ch wide, and uncapped initials on
// a long sentence-name produces noise like "TCMSTRIR".
function toAvatarInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CharacterPanel({
  character,
  resources,
  genreSlug,
  onResourceThresholdCrossed,
  characters = [],
  currentPlayerId,
  activePlayerId,
  magicState = null,
}: CharacterPanelProps) {
  const [prefs, setPref] = useLocalPrefs<CharacterPanelPrefs>(
    "sq-character-panel",
    DEFAULTS,
  );

  const hasResources = resources != null && Object.keys(resources).length > 0;

  // Backstory removed: lives in the top-level Lore panel now. Character
  // tab is the mechanical sheet (stats / abilities / status), not lore.
  const tabs: { id: TabId; label: string }[] = [
    { id: "stats", label: "Stats" },
    { id: "abilities", label: "Abilities" },
    ...(hasResources ? [{ id: "status" as TabId, label: "Status" }] : []),
  ];

  // Inventory has its own top-level panel — drop the redundant subtab.
  // If a previous session persisted activeTab="inventory" (now removed),
  // fall back to "stats" instead of leaving the panel blank.
  const activeTab: TabId = (tabs.some((t) => t.id === prefs.activeTab) ? prefs.activeTab : "stats");

  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <div
      data-testid="character-panel"
      ref={panelRef}
      className="character-panel flex flex-col bg-card/50 h-full overflow-y-auto"
    >
      {/* Header: portrait · name/subtitle · level badge */}
      <div className="flex items-center gap-3 p-4" data-testid="character-header">
        {character.portrait_url ? (
          <img
            src={character.portrait_url}
            alt={character.name}
            className="w-12 h-12 rounded-full object-cover shrink-0 border border-[var(--primary)]/30"
          />
        ) : (
          <div
            aria-hidden="true"
            data-testid="character-portrait-placeholder"
            className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center bg-[var(--surface)] border border-[var(--primary)]/30 text-[var(--primary)] text-xl font-semibold"
          >
            {toAvatarInitials(character.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {/* tracking-wide adds a touch of letter-spacing so tight kerns
              like "hir" don't read as "ib" at the H2 size on screenshot
              compression (playtest 2026-04-24 "Sibley vs Shirley"
              observer report). DOM is authoritative; CSS softens the
              rendering ambiguity. */}
          <h2 className="text-lg font-bold tracking-wide text-[var(--primary)] truncate">{character.name}</h2>
          {/* current_location omitted: set once at chargen, never updated — top header is single source of truth. */}
          {/* Subtitle is class · race ("Beastkin · Uplifted Animal"). Was
              showing class · genre, which conflated the rulebook with the
              character's identity (playtest 2026-04-23). Falls back to
              class-only when race is absent — never to genre. */}
          <p data-testid="character-subtitle" className="text-xs text-muted-foreground leading-tight">
            {toDisplayName(character.class)}
            {character.race ? ` · ${character.race}` : ""}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <div
            data-testid="character-level-badge"
            className="px-2 py-0.5 rounded-md text-xs border border-[var(--primary)]/40 text-[var(--primary)] font-semibold"
          >
            Lv {character.level}
          </div>
          {/* Edge badge — load-bearing for Sebastien-axis players (mechanical
              visibility). ADR-014 / ADR-078: HP was removed from CreatureCore
              in favor of EdgePool (composure currency). Server emits current/max
              on PARTY_STATUS members as current_hp/max_hp (legacy wire field
              names — protocol rename is a follow-up); App.tsx fans them out
              into hp/hp_max on CharacterSheetData. Hidden when both are absent
              (genres that don't model edge) so we never render a fake "0/0". */}
          {typeof character.hp === "number" && typeof character.hp_max === "number" && (
            <EdgeBadge current={character.hp} max={character.hp_max} />
          )}
        </div>
      </div>

      {/* Tabs + content */}
      <div role="tablist" className="flex border-b border-border/30 px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setPref({ activeTab: tab.id })}
            className={`px-3 py-1.5 text-xs transition-colors ${
              activeTab === tab.id
                ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex-1 overflow-auto p-4">
        {activeTab === "stats" && <StatsContent stats={character.stats} />}
        {activeTab === "abilities" && (
          <AbilitiesContent
            abilities={character.abilities}
            magicState={magicState}
            characterId={character.name}
          />
        )}
        {activeTab === "status" && hasResources && (
          <StatusContent
            resources={resources!}
            genreSlug={genreSlug ?? ""}
            onThresholdCrossed={onResourceThresholdCrossed}
          />
        )}
      </div>

      {/* Magic ledger — Phase 4 (Coyote Star). Null-safe: LedgerPanel
          returns null when magicState is null or no bars match this
          character. characterId is character.name to match the server's
          add_character() contract (snapshot.magic_state ledger key). */}
      <LedgerPanel magicState={magicState} characterId={character.name} />

      {/* Party members section */}
      {characters.length > 0 && (
        <div data-testid="party-section" className="border-t border-border/30 p-2 flex flex-col gap-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">Party</h3>
          {characters.map((c) => {
            const isSelf = currentPlayerId !== undefined && c.player_id === currentPlayerId;
            const isActing = activePlayerId !== undefined && activePlayerId !== null && c.player_id === activePlayerId;
            const isWaiting = activePlayerId !== undefined && activePlayerId !== null && c.player_id !== activePlayerId;
            return (
              <div
                key={c.player_id}
                data-testid={`party-member-${c.player_id}`}
                className={[
                  "flex items-center gap-2 p-2 rounded-md bg-card border border-border/50",
                  "transition-all duration-300",
                  isActing ? "ring-2 ring-primary" : "",
                  isWaiting ? "opacity-65" : "",
                ].filter(Boolean).join(" ")}
              >
                {c.portrait_url ? (
                  <img
                    src={c.portrait_url}
                    alt={c.character_name || c.name}
                    className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground flex-shrink-0 border border-border">
                    {toAvatarInitials(c.character_name || c.name)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-foreground truncate">
                    {c.character_name || c.name}
                    {isSelf && (
                      <>
                        {" "}
                        <span
                          data-testid={`party-member-you-badge-${c.player_id}`}
                          className="ml-1 text-[11px] text-muted-foreground/60 font-normal"
                        >
                          (YOU)
                        </span>
                      </>
                    )}
                    {isActing && (
                      <>
                        {" "}
                        <span
                          data-testid={`party-member-acting-badge-${c.player_id}`}
                          className="ml-1 inline-flex items-center gap-1 align-middle rounded-sm bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/40"
                        >
                          <span
                            data-testid={`party-member-acting-pulse-${c.player_id}`}
                            aria-hidden="true"
                            className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                          />
                          ACTING
                        </span>
                      </>
                    )}
                    {isWaiting && (
                      <>
                        {" "}
                        <span
                          data-testid={`party-member-waiting-badge-${c.player_id}`}
                          className="ml-1 inline-block align-middle rounded-sm border border-muted-foreground/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
                        >
                          Waiting
                        </span>
                      </>
                    )}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {toDisplayName(c.class)} Lv.{c.level}
                    {/* Inline Edge for party rows so glance value matches the
                        CharacterPanel header. ADR-014 / ADR-078: HP was
                        removed in favor of EdgePool — wire field names
                        (hp/hp_max on CharacterSummary) are kept until a
                        protocol-level rename. Skip when the genre doesn't
                        report edge at all (both 0 = uninitialized). */}
                    {(c.hp_max > 0 || c.hp > 0) && (
                      <>
                        {" · "}
                        <span
                          data-testid={`party-member-edge-${c.player_id}`}
                          className={
                            c.hp_max > 0 && c.hp / c.hp_max <= 0.25
                              ? "text-destructive font-semibold"
                              : "text-foreground/80"
                          }
                        >
                          Edge {c.hp}/{c.hp_max}
                        </span>
                      </>
                    )}
                  </span>
                  {c.status_effects.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-0.5">
                      {c.status_effects.map((effect) => (
                        <span key={effect} className="inline-block px-1 py-0.5 text-[9px] rounded bg-accent/20 text-accent-foreground">
                          {effect}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

/**
 * Edge badge in the CharacterPanel header. ADR-014 / ADR-078: edge (composure)
 * replaced the legacy HP field on CreatureCore — the badge now reflects the
 * actual schema. Color shifts to destructive when the player drops to 1/4 max
 * so a glance is enough to know "I'm one push from a yield". Same threshold
 * rule as the inline party-row edge for consistency.
 */
function EdgeBadge({ current, max }: { current: number; max: number }) {
  const ratio = max > 0 ? current / max : 1;
  const tone =
    ratio <= 0.25
      ? "border-destructive/60 text-destructive"
      : "border-[var(--primary)]/40 text-[var(--primary)]";
  return (
    <div
      data-testid="character-edge-badge"
      className={`px-2 py-0.5 rounded-md text-xs border font-mono ${tone}`}
      aria-label={`Edge ${current} of ${max}`}
    >
      Edge {current}/{max}
    </div>
  );
}

function StatsContent({ stats }: { stats: Record<string, number> }) {
  const entries = Object.entries(stats).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground/60">No stats available.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {entries.map(([stat, value]) => (
        <div key={stat} className="flex justify-between px-2 py-1 rounded bg-[var(--surface)]">
          <span className="text-[var(--primary)] text-sm">{toDisplayName(stat)}</span>
          <span className="font-mono text-sm">{value}</span>
        </div>
      ))}
    </div>
  );
}

function AbilitiesContent({
  abilities,
  magicState,
  characterId,
}: {
  abilities: string[];
  magicState: MagicState | null;
  characterId: string;
}) {
  const real = abilities.filter((a) => !a.includes("auto-filled"));
  return (
    <div>
      {real.length === 0 ? (
        <p className="text-sm text-muted-foreground/60">No abilities.</p>
      ) : (
        <ul className="list-disc list-inside text-sm space-y-1">
          {real.map((ability) => (
            <li key={ability}>{ability}</li>
          ))}
        </ul>
      )}
      <SensitivitiesSection magicState={magicState} characterId={characterId} />
    </div>
  );
}

function StatusContent({
  resources,
  genreSlug,
  onThresholdCrossed,
}: {
  resources: Record<string, ResourcePool>;
  genreSlug: string;
  onThresholdCrossed?: (info: {
    resource: string;
    threshold: ResourceThreshold;
  }) => void;
}) {
  const entries = Object.entries(resources);
  return (
    <div className="space-y-3">
      {entries.map(([name, pool]) => (
        <GenericResourceBar
          key={name}
          name={name}
          value={pool.value}
          max={pool.max}
          genre_slug={genreSlug}
          thresholds={pool.thresholds}
          onThresholdCrossed={onThresholdCrossed}
        />
      ))}
    </div>
  );
}
