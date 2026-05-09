import { useRef } from "react";
import type { CSSProperties } from "react";
import type { CharacterSheetData } from "./CharacterSheet";
import { GenericResourceBar, type ResourceThreshold } from "./GenericResourceBar";
import { LedgerPanel } from "./LedgerPanel";
import { useLocalPrefs } from "@/hooks/useLocalPrefs";
import type { CharacterSummary, CompanionSummary } from "@/types/party";
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

// Dark-Folio palette — illuminated-manuscript treatment locked in by the
// 2026-05-09 design pass (Character Sheet.html, FolioPanel theme="dark").
// Colors live as a const rather than CSS vars because the panel is a single
// committed surface; theme-swapping at runtime is out of scope.
const FOLIO = {
  ink: "#ecdba8",
  inkSoft: "#b09a6a",
  paper: "#1a140d",
  paper2: "#221a10",
  crimson: "#d6735e",
  gold: "#d4a945",
  rule: "rgba(212,169,69,0.22)",
} as const;

const FONT_DISPLAY = "'Pirata One', serif";
const FONT_BODY = "'EB Garamond', serif";

export interface CharacterPanelProps {
  character: CharacterSheetData;
  resources?: Record<string, ResourcePool> | null;
  genreSlug?: string;
  onResourceThresholdCrossed?: (info: {
    resource: string;
    threshold: ResourceThreshold;
  }) => void;
  characters?: CharacterSummary[];
  /**
   * Narrator-recruited NPC companions on contract with the party
   * (playtest 2026-05-06 wiring fix). Rendered as a separate "Companions"
   * subsection below the player roster — companions have no Edge bar
   * or inventory at this tier, so the row shows only name + role +
   * notes. Empty array hides the subsection entirely.
   */
  companions?: CompanionSummary[];
  currentPlayerId?: string;
  activePlayerId?: string | null;
  /**
   * Per-player submission state for the current round (simultaneous-action
   * MP model). When provided, drives the ACTING/WAITING badges instead of
   * ``activePlayerId`` — a player IN this set has submitted (badge =
   * "Waiting"), one NOT in it still has the floor (badge = "Acting").
   *
   * Derived in ``App.tsx`` from ``turnStatusEntries`` (server-emitted, one
   * entry per submission, cleared on TURN_STATUS{status="resolved"}).
   *
   * Pingpong 2026-05-03 [BUG] floor/turn-status inconsistent: the prior
   * activePlayerId-only logic encodes sequential-turn semantics ("it's
   * X's turn"). In the simultaneous-action MP model both PCs act per
   * round, so ``activePlayerId`` is either null or stale-pointing to
   * whichever PC submitted last — labels then invert (the player who
   * already submitted shows ACTING, the player still composing shows
   * WAITING). When ``submittedPlayerIds`` is provided, that source wins
   * and the badges match the per-player banner truth.
   */
  submittedPlayerIds?: ReadonlySet<string>;
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

// D&D-style modifier math, surfaced on the Folio stat cards as italic gold
// marginalia next to the raw value. Sign is always rendered.
function statMod(v: number): string {
  const m = Math.floor((v - 10) / 2);
  return (m >= 0 ? "+" : "") + m;
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
  companions = [],
  currentPlayerId,
  activePlayerId,
  submittedPlayerIds,
  magicState = null,
}: CharacterPanelProps) {
  const [prefs, setPref] = useLocalPrefs<CharacterPanelPrefs>(
    "sq-character-panel",
    DEFAULTS,
  );

  const hasResources = resources != null && Object.keys(resources).length > 0;

  // Backstory removed: lives in the top-level Lore panel now. Character
  // tab is the mechanical sheet (stats / abilities / status), not lore.
  const tabs: { id: TabId; label: string; glyph: string }[] = [
    { id: "stats", label: "Stats", glyph: "✦" },
    { id: "abilities", label: "Abilities", glyph: "❖" },
    ...(hasResources
      ? [{ id: "status" as TabId, label: "Status", glyph: "✺" }]
      : []),
  ];

  // Inventory has its own top-level panel — drop the redundant subtab.
  // If a previous session persisted activeTab="inventory" (now removed),
  // fall back to "stats" instead of leaving the panel blank.
  const activeTab: TabId = (tabs.some((t) => t.id === prefs.activeTab) ? prefs.activeTab : "stats");

  const panelRef = useRef<HTMLDivElement>(null);

  const hasEdge =
    typeof character.hp === "number" && typeof character.hp_max === "number";

  return (
    <div
      data-testid="character-panel"
      ref={panelRef}
      className="character-panel flex flex-col h-full overflow-y-auto"
      style={{
        background: FOLIO.paper,
        color: FOLIO.ink,
        fontFamily: FONT_BODY,
      }}
    >
      {/* Header: portrait · name/subtitle · level badge · edge badge.
          The double-rule border-bottom and the linear-gradient on the
          paper2 → paper backdrop mark this as the illuminated cartouche;
          the ♦ tick row below the header gives Sebastien-axis players an
          at-a-glance edge meter that reads in one eye-flick. */}
      <div
        className="flex items-center gap-3 p-4"
        data-testid="character-header"
        style={{
          borderBottom: `2px double ${FOLIO.rule}`,
          background: `linear-gradient(180deg, ${FOLIO.paper2} 0%, ${FOLIO.paper} 70%)`,
        }}
      >
        {character.portrait_url ? (
          <img
            src={character.portrait_url}
            alt={character.name}
            className="w-12 h-12 rounded-full object-cover shrink-0 border border-[var(--primary)]/30"
            style={{ borderColor: FOLIO.gold }}
          />
        ) : (
          <div
            aria-hidden="true"
            data-testid="character-portrait-placeholder"
            className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center bg-[var(--surface)] border border-[var(--primary)]/30 text-[var(--primary)] text-xl font-semibold"
            style={{
              background: FOLIO.paper2,
              borderColor: FOLIO.gold,
              color: FOLIO.crimson,
              fontFamily: FONT_DISPLAY,
              fontSize: 26,
            }}
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
          <h2
            className="text-lg font-bold tracking-wide text-[var(--primary)] truncate"
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 400,
              color: FOLIO.ink,
              letterSpacing: 0.5,
              lineHeight: 1.05,
            }}
          >
            {character.name}
          </h2>
          {/* current_location omitted: set once at chargen, never updated — top header is single source of truth. */}
          {/* Subtitle is class · race ("Beastkin · Uplifted Animal"). Was
              showing class · genre, which conflated the rulebook with the
              character's identity (playtest 2026-04-23). Falls back to
              class-only when race is absent — never to genre. */}
          <p
            data-testid="character-subtitle"
            className="text-xs text-muted-foreground leading-tight"
            style={{
              fontFamily: FONT_BODY,
              fontStyle: "italic",
              color: FOLIO.inkSoft,
            }}
          >
            {toDisplayName(character.class)}
            {character.race ? ` · ${character.race}` : ""}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <div
            data-testid="character-level-badge"
            className="px-2 py-0.5 rounded-md text-xs border border-[var(--primary)]/40 text-[var(--primary)] font-semibold"
            style={{
              borderColor: FOLIO.crimson,
              color: FOLIO.crimson,
              fontFamily: FONT_DISPLAY,
              letterSpacing: 0.5,
              fontWeight: 400,
              borderRadius: 2,
              background: FOLIO.paper2,
            }}
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
          {hasEdge && (
            <EdgeBadge current={character.hp!} max={character.hp_max!} />
          )}
        </div>
      </div>

      {/* Edge ♦-tick bar — Folio signature. Adds an at-a-glance read of
          composure under the header. Hidden on edge-less genres so we
          don't paint a row of empty diamonds. */}
      {hasEdge && (
        <FolioEdgeTicks current={character.hp!} max={character.hp_max!} />
      )}

      {/* Tabs — Pirata One label with a small gold glyph in front of each.
          Active tab gets a crimson rule under it; inactive labels sit in
          ink-soft and pull up to crimson on hover via a CSS pseudo class
          we can't easily express here, so we keep hover transitions to
          opacity (the Tailwind hover:text-foreground class no longer
          applies once we override color inline). */}
      <div
        role="tablist"
        className="flex px-2"
        style={{
          borderBottom: `1px solid ${FOLIO.rule}`,
          background: FOLIO.paper,
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => setPref({ activeTab: tab.id })}
              className={`px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: active ? FOLIO.crimson : FOLIO.inkSoft,
                borderBottom: active
                  ? `2px solid ${FOLIO.crimson}`
                  : "2px solid transparent",
                marginBottom: -1,
                fontFamily: FONT_DISPLAY,
                fontSize: 13,
                letterSpacing: 1,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span aria-hidden="true" style={{ color: FOLIO.gold, fontSize: 11 }}>
                {tab.glyph}
              </span>
              {tab.label}
            </button>
          );
        })}
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
        <div
          data-testid="party-section"
          className="border-t border-border/30 p-2 flex flex-col gap-1"
          style={{ borderTop: `1px solid ${FOLIO.rule}` }}
        >
          <h3
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1"
            style={{
              fontFamily: FONT_DISPLAY,
              color: FOLIO.crimson,
              letterSpacing: 1.5,
              fontWeight: 400,
            }}
          >
            Party
          </h3>
          {characters.map((c) => {
            const isSelf = currentPlayerId !== undefined && c.player_id === currentPlayerId;
            // Per-player submission state wins when present (simultaneous-action
            // MP). Falls back to single-active-player semantics for sequential
            // turns / solo / pre-MP. See ``submittedPlayerIds`` prop docstring.
            let isActing: boolean;
            let isWaiting: boolean;
            if (submittedPlayerIds !== undefined) {
              const submitted = submittedPlayerIds.has(c.player_id);
              isActing = !submitted;
              isWaiting = submitted;
            } else {
              isActing =
                activePlayerId !== undefined &&
                activePlayerId !== null &&
                c.player_id === activePlayerId;
              isWaiting =
                activePlayerId !== undefined &&
                activePlayerId !== null &&
                c.player_id !== activePlayerId;
            }
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
                style={{
                  background: FOLIO.paper2,
                  borderColor: FOLIO.rule,
                }}
              >
                {c.portrait_url ? (
                  <img
                    src={c.portrait_url}
                    alt={c.character_name || c.name}
                    className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                    style={{ borderColor: FOLIO.gold }}
                  />
                ) : (
                  <span
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground flex-shrink-0 border border-border"
                    style={{
                      background: FOLIO.paper,
                      color: FOLIO.crimson,
                      borderColor: FOLIO.gold,
                      fontFamily: FONT_DISPLAY,
                      fontSize: 12,
                      fontWeight: 400,
                    }}
                  >
                    {toAvatarInitials(c.character_name || c.name)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <span
                    className="block text-xs font-semibold text-foreground truncate"
                    style={{ color: FOLIO.ink, fontFamily: FONT_BODY }}
                  >
                    {c.character_name || c.name}
                    {isSelf && (
                      <>
                        {" "}
                        <span
                          data-testid={`party-member-you-badge-${c.player_id}`}
                          className="ml-1 text-[11px] text-muted-foreground/60 font-normal"
                          style={{ color: FOLIO.inkSoft, fontStyle: "italic" }}
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
                          style={{
                            background: `${FOLIO.crimson}26`,
                            color: FOLIO.crimson,
                            boxShadow: `0 0 0 1px ${FOLIO.crimson}66 inset`,
                            fontFamily: FONT_DISPLAY,
                            letterSpacing: 1.2,
                          }}
                        >
                          <span
                            data-testid={`party-member-acting-pulse-${c.player_id}`}
                            aria-hidden="true"
                            className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                            style={{ background: FOLIO.crimson }}
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
                          style={{
                            borderColor: FOLIO.rule,
                            color: FOLIO.inkSoft,
                            fontFamily: FONT_DISPLAY,
                            letterSpacing: 1.2,
                          }}
                        >
                          Waiting
                        </span>
                      </>
                    )}
                  </span>
                  <span
                    className="block text-[10px] text-muted-foreground"
                    style={{ color: FOLIO.inkSoft, fontFamily: FONT_BODY }}
                  >
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
                          style={{
                            color:
                              c.hp_max > 0 && c.hp / c.hp_max <= 0.25
                                ? FOLIO.crimson
                                : FOLIO.ink,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          Edge {c.hp}/{c.hp_max}
                        </span>
                      </>
                    )}
                  </span>
                  {c.status_effects.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-0.5">
                      {c.status_effects.map((effect) => (
                        <span
                          key={effect}
                          className="inline-block px-1 py-0.5 text-[9px] rounded bg-accent/20 text-accent-foreground"
                          style={{
                            background: FOLIO.paper,
                            color: FOLIO.gold,
                            border: `1px solid ${FOLIO.rule}`,
                            fontFamily: FONT_BODY,
                            fontStyle: "italic",
                          }}
                        >
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

      {/* Companions section (playtest 2026-05-06): narrator-recruited
          NPC hirelings. No Edge bar / inventory at this tier — minimum
          panel-visibility surface so Sebastien can confirm "yes, the
          hireling exists in game state, not just in prose." */}
      {companions.length > 0 && (
        <div
          data-testid="companions-section"
          className="border-t border-border/30 p-2 flex flex-col gap-1"
          style={{ borderTop: `1px solid ${FOLIO.rule}` }}
        >
          <h3
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1"
            style={{
              fontFamily: FONT_DISPLAY,
              color: FOLIO.crimson,
              letterSpacing: 1.5,
              fontWeight: 400,
            }}
          >
            Companions
          </h3>
          {companions.map((c) => (
            <div
              key={c.name}
              data-testid={`companion-${c.name}`}
              className="flex items-center gap-2 p-2 rounded-md bg-card/60 border border-border/40"
              style={{
                background: FOLIO.paper2,
                borderColor: FOLIO.rule,
              }}
              title={
                c.notes
                  ? `${c.description || c.role}\nContract: ${c.notes}`
                  : c.description || c.role
              }
            >
              <span
                className="w-8 h-8 rounded-full bg-secondary/40 flex items-center justify-center text-[10px] font-bold text-secondary-foreground/80 flex-shrink-0 border border-border/60"
                style={{
                  background: FOLIO.paper,
                  color: FOLIO.gold,
                  borderColor: FOLIO.rule,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 12,
                  fontWeight: 400,
                }}
              >
                {toAvatarInitials(c.name)}
              </span>
              <div className="flex-1 min-w-0">
                <span
                  className="block text-xs font-semibold text-foreground/90 truncate"
                  style={{ color: FOLIO.ink, fontFamily: FONT_BODY }}
                >
                  {c.name}
                  <span
                    data-testid={`companion-tag-${c.name}`}
                    className="ml-1 inline-block align-middle rounded-sm border border-muted-foreground/30 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70"
                    style={{
                      borderColor: FOLIO.rule,
                      color: FOLIO.inkSoft,
                      fontFamily: FONT_DISPLAY,
                      letterSpacing: 1.2,
                    }}
                  >
                    NPC
                  </span>
                </span>
                <span
                  className="block text-[10px] text-muted-foreground truncate"
                  style={{ color: FOLIO.inkSoft, fontFamily: FONT_BODY }}
                >
                  {c.role || "companion"}
                  {c.recruited_by ? ` · w/ ${c.recruited_by}` : ""}
                </span>
                {c.notes && (
                  <span
                    className="block text-[9px] text-muted-foreground/70 italic truncate"
                    style={{ color: FOLIO.inkSoft, fontFamily: FONT_BODY }}
                  >
                    {c.notes}
                  </span>
                )}
              </div>
            </div>
          ))}
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
  const danger = ratio <= 0.25;
  const tone = danger
    ? "border-destructive/60 text-destructive"
    : "border-[var(--primary)]/40 text-[var(--primary)]";
  return (
    <div
      data-testid="character-edge-badge"
      className={`px-2 py-0.5 rounded-md text-xs border font-mono ${tone}`}
      aria-label={`Edge ${current} of ${max}`}
      style={{
        borderColor: danger ? FOLIO.crimson : FOLIO.gold,
        color: danger ? FOLIO.crimson : FOLIO.ink,
        background: FOLIO.paper2,
        fontFamily: FONT_BODY,
        fontVariantNumeric: "tabular-nums",
        borderRadius: 2,
      }}
    >
      Edge {current}/{max}
    </div>
  );
}

/** ♦ row across the panel — one diamond per max-edge unit, filled in gold
 *  while above the danger threshold and crimson once the ratio crosses 25%.
 *  Gives a tabletop-flavored at-a-glance pool reading without competing with
 *  the textual badge in the header corner. */
function FolioEdgeTicks({ current, max }: { current: number; max: number }) {
  const danger = max > 0 && current / max <= 0.25;
  const fill = danger ? FOLIO.crimson : FOLIO.gold;
  const cap = Math.max(0, max);
  return (
    <div
      data-testid="character-edge-ticks"
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "8px 16px",
        borderBottom: `1px solid ${FOLIO.rule}`,
        background: FOLIO.paper,
      }}
    >
      <span
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 12,
          color: FOLIO.crimson,
          letterSpacing: 1,
        }}
      >
        Edge
      </span>
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 3,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: cap }).map((_, i) => {
          const filled = i < current;
          return (
            <span
              key={i}
              style={{
                flex: "1 1 0",
                textAlign: "center",
                fontSize: 11,
                lineHeight: 1,
                color: filled ? fill : FOLIO.rule,
                textShadow: filled ? `0 0 0 ${fill}` : "none",
              }}
            >
              ♦
            </span>
          );
        })}
      </div>
    </div>
  );
}

function StatsContent({ stats }: { stats: Record<string, number> }) {
  const entries = Object.entries(stats).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground/60"
        style={{ color: FOLIO.inkSoft, fontFamily: FONT_BODY, fontStyle: "italic" }}
      >
        No stats available.
      </p>
    );
  }
  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 6,
      }}
    >
      {entries.map(([stat, value]) => {
        const cardStyle: CSSProperties = {
          position: "relative",
          border: `1px solid ${FOLIO.rule}`,
          background: FOLIO.paper2,
          padding: "8px 10px",
          minWidth: 0,
        };
        return (
          <div
            key={stat}
            className="flex flex-col rounded bg-[var(--surface)]"
            style={cardStyle}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 6,
              }}
            >
              <span
                className="text-[var(--primary)] text-sm"
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 12,
                  color: FOLIO.ink,
                  letterSpacing: 0.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 400,
                }}
              >
                {toDisplayName(stat)}
              </span>
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 11,
                  color: FOLIO.gold,
                  fontStyle: "italic",
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}
              >
                {statMod(value)}
              </span>
            </div>
            <span
              className="font-mono"
              style={{
                fontFamily: FONT_BODY,
                fontSize: 22,
                color: FOLIO.ink,
                lineHeight: 1.1,
                marginTop: 2,
                fontVariantNumeric: "tabular-nums oldstyle-nums",
              }}
            >
              {value}
            </span>
          </div>
        );
      })}
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
  // The 'auto-filled' suffix is server-side scaffolding noise from genres
  // where missing fields are stubbed during chargen — don't surface it.
  const real = abilities.filter((a) => !a.includes("auto-filled"));
  return (
    <div>
      {real.length === 0 ? (
        <p
          className="text-sm text-muted-foreground/60"
          style={{
            color: FOLIO.inkSoft,
            fontFamily: FONT_BODY,
            fontStyle: "italic",
          }}
        >
          No abilities.
        </p>
      ) : (
        <ul
          className="list-disc list-inside text-sm space-y-1"
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {real.map((ability) => (
            <li
              key={ability}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "6px 10px",
                background: FOLIO.paper2,
                border: `1px solid ${FOLIO.rule}`,
                minWidth: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  border: `1px solid ${FOLIO.gold}`,
                  background: FOLIO.paper,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: FONT_DISPLAY,
                  fontSize: 18,
                  color: FOLIO.crimson,
                  lineHeight: 1,
                }}
              >
                {ability.charAt(0).toUpperCase()}
              </span>
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: FOLIO.ink,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {ability}
              </span>
            </li>
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
    <div className="space-y-3" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
