import { useRef } from "react";
import type { CSSProperties } from "react";
import type { CharacterSheetData, AbilityDefinition, ClassMove } from "./CharacterSheet";
import { PortraitFrame } from "./PortraitFrame";
import { GenericResourceBar, type ResourceThreshold } from "./GenericResourceBar";
import { LedgerPanel } from "./LedgerPanel";
import { useLocalPrefs } from "@/hooks/useLocalPrefs";
import type { CharacterSummary, CompanionSummary } from "@/types/party";
import { getCharacterBars, type MagicState } from "@/types/magic";
import { SensitivitiesSection } from "./SensitivitiesSection";

type TabId = "stats" | "abilities" | "status";

export interface ResourcePool {
  value: number;
  max: number;
  /** Optional: the PARTY_STATUS wire omits this when a pool declares no
   *  thresholds (ProtocolBase drops empty-default lists). Absent ⇒ no
   *  thresholds; GenericResourceBar treats it as `[]`. */
  thresholds?: ResourceThreshold[];
}

interface CharacterPanelPrefs {
  activeTab: TabId;
  [key: string]: unknown;
}

const DEFAULTS: CharacterPanelPrefs = {
  activeTab: "stats",
};

// Folio palette — illuminated-manuscript treatment from the 2026-05-09
// design pass (Character Sheet.html, FolioPanel theme="dark"). The semantic
// names are kept (ink, paper, crimson, gold, rule) but values now resolve
// through CSS custom properties set by useGenreTheme (ADR-079), so the
// panel reads as a coherent artifact in every genre — dark torchlight in
// caverns_and_claudes, cream watercolour in tea_and_murder, etc. — instead
// of a fixed dark palette that clashed with the rest of the page.
const FOLIO = {
  ink: "var(--card-foreground)",
  // Side-panel secondary text (party class/level, subtitle, status badges)
  // was sitting on raw --muted-foreground, which lands near background
  // luminance in several genre themes (UX review 2026-05-25 needed 1.8–3×
  // brightness to read names/tab labels). Lift it toward the readable ink
  // colour by mixing 55% card-foreground into the muted token — stays
  // theme-driven (both ends resolve through useGenreTheme / ADR-079) instead
  // of hardcoding a colour, but clears the contrast floor.
  inkSoft:
    "color-mix(in oklch, var(--card-foreground) 55%, var(--muted-foreground))",
  paper: "var(--card)",
  paper2: "var(--muted)",
  crimson: "var(--accent)",
  gold: "var(--primary)",
  rule: "var(--border)",
} as const;

const FONT_DISPLAY = "'Pirata One', serif";
// Functional/legible face for everything that NAMES A MECHANIC — stat
// labels, tab labels, section headers, the Edge label. Pirata One
// (FONT_DISPLAY) is a blackletter display face: legible as a versal/
// masthead, illegible on 3-letter mechanical tokens ("DEX"→"DECC"). EB
// Garamond is already loaded (index.html, full weight axis); chosen over
// the spec's parenthetical var(--font-ui) option because rugged's
// --font-ui is 'Oswald' which is NOT loaded and silently degrades to
// Impact — a No-Silent-Fallback violation. Pirata One stays ONLY on the
// genuinely decorative surfaces (character name, avatar monogram).
const FONT_LABEL = "'EB Garamond', Georgia, serif";
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

  // Story 56-1 / 67-4 / 67-6: controlling-player suffix in the header.
  // Prefer player_identity (authenticated email / dev host) over player_id
  // (display-name handle); render only when it differs from the character
  // name (no doubled "Kael — Kael", story 67-4) and the roster has >1 PC
  // (the conservative MP signal App.tsx uses). Undefined player_identity ⇒
  // disconnected peer ⇒ no fabricated suffix.
  const playerSuffix = character.player_identity || character.player_id;
  const showPlayerSuffix =
    !!playerSuffix &&
    playerSuffix !== character.name &&
    characters.length > 1;

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
        <PortraitFrame
          url={character.portrait_url}
          name={character.name}
          sizeClass="w-12 h-12"
          radiusClass="rounded-lg"
          imgStyle={{ borderColor: FOLIO.gold }}
          imgClassName="border border-[var(--primary)]/30"
          initialsStyle={{
            background: FOLIO.paper2,
            borderColor: FOLIO.gold,
            color: FOLIO.crimson,
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
          }}
          initialsClassName="border border-[var(--primary)]/30 text-[var(--primary)] text-xl font-semibold"
        />
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
            {/* Story 56-1: controlling player's name in MP only. Three-guard
                gate — player_id non-empty (data present), characters defined,
                characters.length > 1 (the same conservative roster-only
                multiplayer signal App.tsx uses; the canonical isMultiplayer
                in GameBoard.tsx:456-458 is broader). Defense in depth
                alongside App.tsx, which already leaves player_id undefined
                in SP. AC-4 single-player suppression is the load-bearing AC.
                Story 67-4: also suppress when player_id == name — a player
                whose identity equals their character name would render a
                doubled "Kael — Kael" header. Mirrors CharacterSheet.tsx's
                `player_id !== data.name` guard so the two surfaces agree.
                Story 67-6: prefer player_identity (authenticated email / dev
                host) over player_id (display-name handle). Undefined
                player_identity means disconnected peer — no fabricated suffix. */}
            {showPlayerSuffix ? (
              <span
                data-testid="character-panel-player-name"
                className="ml-2 text-xs font-normal"
                style={{
                  fontFamily: FONT_BODY,
                  color: FOLIO.inkSoft,
                  letterSpacing: 0,
                }}
              >
                — {playerSuffix}
              </span>
            ) : null}
          </h2>
          {/* current_location omitted: set once at chargen, never updated — top header is single source of truth. */}
          {/* Subtitle is calling · origin ("Country Veterinary Surgeon · The
              Village Itself"). Prefers the chargen FLAVOR labels over the
              collapsed mechanical slug (playtest 2026-05-28: a vet picked
              "Country Veterinary Surgeon" but the panel showed "Doctor ·
              Servant"). Falls back to the class/race slug when no label was
              emitted, then to calling-only when origin is absent — never to
              genre (playtest 2026-04-23). The flavor labels are already
              proper phrases; toDisplayName only normalizes a bare slug. */}
          <p
            data-testid="character-subtitle"
            className="text-xs text-muted-foreground leading-tight"
            style={{
              fontFamily: FONT_BODY,
              fontStyle: "italic",
              color: FOLIO.inkSoft,
            }}
          >
            {character.calling_label || toDisplayName(character.class)}
            {character.origin_label || character.race
              ? ` · ${character.origin_label || character.race}`
              : ""}
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
          {/* HP / Vitality badge — load-bearing for the mechanics-first
              players (Sebastien/Jade). ADR-114 (ablative HP substrate)
              reclaims this pool as HP: the engine logs hp=N/M and this is the
              character's survivability/vitality, NOT the confrontation Edge
              metric (that lives in ConfrontationOverlay's dual-dial). Server
              emits current/max on PARTY_STATUS members as current_hp/max_hp;
              App.tsx fans them into hp/hp_max on CharacterSheetData. Hidden
              when both are absent so we never render a fake "0/0". */}
          {hasEdge && (
            <EdgeBadge
              current={character.hp!}
              max={character.hp_max!}
              label={character.survivability_pool_label ?? "HP"}
            />
          )}
        </div>
      </div>

      {/* Edge ♦-tick bar — Folio signature. Adds an at-a-glance read of
          composure under the header. Hidden on edge-less genres so we
          don't paint a row of empty diamonds. */}
      {hasEdge && (
        <FolioEdgeTicks
          current={character.hp!}
          max={character.hp_max!}
          label={character.survivability_pool_label ?? "HP"}
        />
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
                color: active ? FOLIO.gold : FOLIO.ink,
                opacity: active ? 1 : 0.95,
                borderBottom: active
                  ? `2px solid ${FOLIO.gold}`
                  : "2px solid transparent",
                marginBottom: -1,
                fontFamily: FONT_LABEL,
                fontSize: 15,
                fontWeight: active ? 600 : 500,
                letterSpacing: 1,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span aria-hidden="true" style={{ color: FOLIO.gold, fontSize: 13 }}>
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
            class_moves={character.class_moves ?? []}
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
              fontFamily: FONT_LABEL,
              color: FOLIO.gold,
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
                  isWaiting ? "opacity-90" : "",
                ].filter(Boolean).join(" ")}
                style={{
                  background: FOLIO.paper2,
                  borderColor: FOLIO.rule,
                }}
              >
                <PortraitFrame
                  url={c.portrait_url}
                  name={c.character_name || c.name}
                  sizeClass="w-8 h-8"
                  radiusClass="rounded-md"
                  imgStyle={{ borderColor: FOLIO.gold }}
                  imgClassName="border border-border"
                  initialsStyle={{
                    background: FOLIO.paper,
                    color: FOLIO.crimson,
                    borderColor: FOLIO.gold,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 14,
                    fontWeight: 400,
                  }}
                  initialsClassName="bg-secondary text-secondary-foreground text-[10px] font-bold border border-border"
                />
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
                            background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                            color: FOLIO.crimson,
                            boxShadow:
                              "0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent) inset",
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
                          Composing
                        </span>
                      </>
                    )}
                    {isWaiting && (
                      <>
                        {" "}
                        <span
                          data-testid={`party-member-waiting-badge-${c.player_id}`}
                          className="ml-1 inline-flex items-center gap-1 align-middle rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{
                            background: "color-mix(in srgb, #047857 12%, transparent)",
                            border: "1px solid color-mix(in srgb, #047857 45%, transparent)",
                            color: "#047857",
                            fontFamily: FONT_DISPLAY,
                            letterSpacing: 1.2,
                          }}
                        >
                          ✓ Sealed
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
                          {c.survivability_pool_label ?? "HP"} {c.hp}/{c.hp_max}
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
              fontFamily: FONT_LABEL,
              color: FOLIO.gold,
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
              <PortraitFrame
                name={c.name}
                sizeClass="w-8 h-8"
                radiusClass="rounded-md"
                initialsStyle={{
                  background: FOLIO.paper,
                  color: FOLIO.gold,
                  borderColor: FOLIO.rule,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 14,
                  fontWeight: 400,
                }}
                initialsClassName="bg-secondary/40 text-secondary-foreground/80 text-[10px] font-bold border border-border/60"
              />
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
function EdgeBadge({
  current,
  max,
  label = "HP",
}: {
  current: number;
  max: number;
  // Story 68-1: per-genre survivability label (Composure / Standing / Poise).
  label?: string;
}) {
  const ratio = max > 0 ? current / max : 1;
  const danger = ratio <= 0.25;
  const tone = danger
    ? "border-destructive/60 text-destructive"
    : "border-[var(--primary)]/40 text-[var(--primary)]";
  return (
    <div
      data-testid="character-edge-badge"
      className={`px-2 py-0.5 rounded-md text-xs border font-mono ${tone}`}
      aria-label={`${label} ${current} of ${max}`}
      title={label === "HP" ? "HP / Vitality" : label}
      style={{
        borderColor: danger ? FOLIO.crimson : FOLIO.gold,
        color: danger ? FOLIO.crimson : FOLIO.ink,
        background: FOLIO.paper2,
        fontFamily: FONT_BODY,
        fontVariantNumeric: "tabular-nums",
        borderRadius: 2,
      }}
    >
      {label} {current}/{max}
    </div>
  );
}

/** ♦ row across the panel — one diamond per max-edge unit, filled in gold
 *  while above the danger threshold and crimson once the ratio crosses 25%.
 *  Gives a tabletop-flavored at-a-glance pool reading without competing with
 *  the textual badge in the header corner. */
function FolioEdgeTicks({
  current,
  max,
  label = "HP",
}: {
  current: number;
  max: number;
  // Story 68-1: per-genre survivability label (Composure / Standing / Poise).
  label?: string;
}) {
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
        title={label === "HP" ? "HP / Vitality" : label}
        style={{
          fontFamily: FONT_LABEL,
          fontSize: 14,
          color: FOLIO.gold,
          letterSpacing: 1,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {label} {current}/{cap}
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
                fontSize: 13,
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

/**
 * Light & Darkness survival gauge (2026-06-13 spec). Reuses the FolioEdgeTicks
 * pip layout under the "Light" label, adds a torch-charge readout, and surfaces
 * the −2-in-the-dark roll penalty as a crimson affordance when the pool hits 0.
 *
 * `torchCharges` is OPTIONAL: torch count is an inventory quantity, and the
 * server does not (yet) project a torch-charge count into PARTY_STATUS — only
 * the light ResourcePool (current/max) reaches the UI. Until that wiring lands,
 * the call site omits torchCharges and the readout is suppressed; the gauge
 * still renders the pool and the dark-penalty affordance. Threading a real
 * torch count is a follow-up (server-side PARTY_STATUS field).
 *
 * The minus glyph is U+2212 (MINUS SIGN), matching the spec's affordance copy.
 */
export function LightGauge({
  current,
  max,
  torchCharges,
}: {
  current: number;
  max: number;
  torchCharges?: number;
}) {
  return (
    <div
      data-testid="light-gauge"
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <FolioEdgeTicks current={current} max={max} label="Light" />
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          padding: "0 16px",
        }}
      >
        {torchCharges !== undefined && (
          <span
            data-testid="light-gauge-torches"
            style={{
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: FOLIO.inkSoft,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {torchCharges} torch{torchCharges === 1 ? "" : "es"} left
          </span>
        )}
        {current === 0 && (
          <span
            data-testid="light-gauge-dark-penalty"
            style={{
              fontFamily: FONT_LABEL,
              fontSize: 12,
              fontWeight: 600,
              color: FOLIO.crimson,
              letterSpacing: 0.5,
            }}
          >
            {"−"}2 in the dark
          </span>
        )}
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
                className="text-sm"
                style={{
                  fontFamily: FONT_LABEL,
                  fontSize: 15,
                  color: FOLIO.ink,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {toDisplayName(stat)}
              </span>
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 15,
                  color: FOLIO.gold,
                  fontWeight: 600,
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
                fontSize: 24,
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

export function AbilitiesContent({
  abilities,
  class_moves,
  magicState,
  characterId,
}: {
  abilities: AbilityDefinition[];
  class_moves: ClassMove[];
  magicState: MagicState | null;
  characterId: string;
}) {
  // Filter scaffolding leaks (server-side filter is the source of truth, but
  // a client guard prevents regressions if a future server change forgets).
  const real = abilities.filter((a) => !a.name.includes("auto-filled"));

  const classAbilities = real.filter((a) => a.source === "Class");
  const itemAbilities = real.filter((a) => a.source === "Item");
  const playAbilities = real.filter((a) => a.source === "Play");

  const showClassSig = classAbilities.length > 0;
  const showClassMoves = class_moves.length > 0;
  const showItem = itemAbilities.length > 0;
  const showEarned = playAbilities.length > 0;

  // SensitivitiesSection self-hides (renders null) when there is no magic
  // state or no ledger bars for this character — mirror its predicate so the
  // empty-state below only fires when the WHOLE panel would otherwise render
  // blank (the Lv1-Scavenger "completely empty tab" playtest report).
  const showSensitivities =
    magicState != null && getCharacterBars(magicState, characterId).length > 0;
  const hasAnything =
    showClassSig || showClassMoves || showItem || showEarned || showSensitivities;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {showClassSig && (
        <section>
          <h4 style={{ fontFamily: FONT_LABEL, color: FOLIO.gold, marginBottom: 6 }}>
            Class signature
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {classAbilities.map((a) => (
              <AbilityCard key={a.name} ability={a} />
            ))}
          </div>
        </section>
      )}

      {showClassMoves && (
        <section>
          <h4 style={{ fontFamily: FONT_LABEL, color: FOLIO.gold, marginBottom: 6 }}>
            Class moves
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {class_moves.map((m) => (
              <span
                key={m.id}
                title={m.description ?? undefined}
                style={{
                  padding: "2px 8px",
                  background: FOLIO.paper2,
                  border: `1px solid ${FOLIO.rule}`,
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: FOLIO.ink,
                  cursor: m.description ? "help" : "default",
                }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {showItem && (
        <section>
          <h4 style={{ fontFamily: FONT_LABEL, color: FOLIO.gold, marginBottom: 6 }}>
            From inventory
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {itemAbilities.map((a) => (
              <AbilityCard key={a.name} ability={a} />
            ))}
          </div>
        </section>
      )}

      {showEarned && (
        <section>
          <h4 style={{ fontFamily: FONT_LABEL, color: FOLIO.gold, marginBottom: 6 }}>
            Earned
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {playAbilities.map((a) => (
              <AbilityCard key={a.name} ability={a} />
            ))}
          </div>
        </section>
      )}

      <SensitivitiesSection magicState={magicState} characterId={characterId} />

      {!hasAnything && (
        <p
          data-testid="abilities-empty-state"
          style={{
            fontFamily: FONT_BODY,
            fontSize: 14,
            fontStyle: "italic",
            color: FOLIO.inkSoft,
            margin: 0,
          }}
        >
          No special abilities yet.
        </p>
      )}
    </div>
  );
}

function AbilityCard({ ability }: { ability: AbilityDefinition }) {
  return (
    <div
      style={{
        padding: 10,
        background: FOLIO.paper2,
        border: `1px solid ${FOLIO.gold}`,
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 17,
          color: FOLIO.ink,
          marginBottom: 4,
        }}
      >
        {ability.name}
      </div>
      <div
        style={{
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: FOLIO.ink,
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        {ability.genre_description}
      </div>
      <div
        style={{
          fontFamily: FONT_BODY,
          fontSize: 12,
          fontStyle: "italic",
          color: FOLIO.inkSoft,
        }}
      >
        {ability.mechanical_effect}
      </div>
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
      {entries.map(([name, pool]) =>
        // Light & Darkness survival pool gets the dedicated gauge (pip row +
        // −2-in-the-dark affordance) instead of the generic bar. torchCharges
        // is omitted until the server projects a torch count into PARTY_STATUS
        // (see LightGauge docstring).
        name === "light" ? (
          <LightGauge key={name} current={pool.value} max={pool.max} />
        ) : (
          <GenericResourceBar
            key={name}
            name={name}
            value={pool.value}
            max={pool.max}
            genre_slug={genreSlug}
            thresholds={pool.thresholds}
            onThresholdCrossed={onThresholdCrossed}
          />
        ),
      )}
    </div>
  );
}
