import type { DiceRequestPayload, DiceResultPayload, DiceThrowParams } from "@/types/payloads";
import { InlineDiceTray } from "@/dice/InlineDiceTray";
import { YieldButton } from "@/components/YieldButton";

// ═══════════════════════════════════════════════════════════
// Types — exported for tests and consumers
// ═══════════════════════════════════════════════════════════

export interface EncounterActor {
  name: string;
  role: string;
  portrait_url?: string;
}

/**
 * Dual-dial metric — mirrors the server's `EncounterMetric` (sidequest-server
 * `sidequest/game/encounter.py:122`). Each side has its own ascending dial:
 * `current` advances toward `threshold` and the side that hits threshold
 * first triggers resolution. There's no shared/bidirectional bar — see
 * ADR-024 dual-track tension model.
 */
export interface EncounterMetric {
  name: string;
  current: number;
  starting: number;
  threshold: number;
}

/**
 * Wire shape matches the server's `BeatDef` (sidequest-server
 * `sidequest/genre/models/rules.py:73`). Most fields are advisory metadata
 * the UI doesn't need; we declare the ones the overlay + dice dispatcher
 * actually read. Per the dual-track schema migration, `base` is the scalar
 * magnitude that drives DC scaling (replaces the legacy `metric_delta`).
 */
export interface BeatOption {
  id: string;
  label: string;
  /** Beat kind: closed enum from BeatKind (drives per-tier delta defaults). */
  kind?: string;
  /** Scalar magnitude — drives DC scaling and risk color. Defaults to 1 server-side. */
  base?: number;
  stat_check: string;
  risk?: string;
  resolution?: boolean;
  /** Tag created when this beat resolves; required for kind=angle. */
  target_tag?: string;
  /**
   * Optional one-line italic flavor hint, authored per beat in pack YAML
   * and threaded through `BeatDef.flavor` on the server (D2 confrontation
   * panel, 2026-05-13). No longer rendered on the tile as of 2026-05-26 —
   * the player's typed InputBar action now carries the flavor, and a second
   * authored flavor line competed with it. Field retained on the wire shape
   * for back-compat / potential reuse (e.g. hover detail).
   */
  flavor?: string;
}

export interface StatValue {
  current: number;
  max: number;
}

export interface SecondaryStats {
  stats: Record<string, StatValue>;
  damage_tier?: string;
}

export interface ConfrontationData {
  type: string;
  label: string;
  category: string;
  actors: EncounterActor[];
  /** Player edge — advances on player_metric deltas; resolution at threshold. */
  player_metric: EncounterMetric;
  /** Opponent edge — advances on opponent_metric deltas; resolution at threshold. */
  opponent_metric: EncounterMetric;
  beats: BeatOption[];
  secondary_stats: SecondaryStats | null;
  genre_slug: string;
  mood: string;
  /**
   * Server-side clear signal: when `false`, the confrontation has ended and
   * the overlay should unmount. Absent or `true` means active. Handled at
   * dispatch in App.tsx (search: `payload.active !== false`).
   */
  active?: boolean;
}

/**
 * Outcome of a magic confrontation (Story 47-3 Phase 5). Carried on
 * the new ``CONFRONTATION_OUTCOME`` WebSocket message; the overlay
 * mounts a branch-explicit reveal panel when this is non-null. The
 * four branches mirror server
 * ``sidequest/magic/confrontations.py:_BranchName``.
 */
export type ConfrontationBranch =
  | "clear_win"
  | "pyrrhic_win"
  | "clear_loss"
  | "refused";

export interface ConfrontationOutcome {
  confrontation_id: string;
  label: string;
  branch: ConfrontationBranch;
  /** Mandatory advancement output IDs that fired with this branch. */
  mandatory_outputs: string[];
}

interface ConfrontationOverlayProps {
  data: ConfrontationData | null;
  onBeatSelect?: (beatId: string) => void;
  /** Dice state — rendered inline below beats when active. */
  diceRequest?: DiceRequestPayload | null;
  diceResult?: DiceResultPayload | null;
  playerId?: string;
  onDiceThrow?: (params: DiceThrowParams, face: number[]) => void;
  onYield?: () => void;
  /**
   * Phase 5: branch-explicit outcome reveal. When non-null, the overlay
   * renders a panel callout above the beat list with the resolved
   * branch + mandatory_outputs (per design Decision #9: explicit panel
   * callout at outcome time, always shown).
   */
  outcome?: ConfrontationOutcome | null;
}

// ═══════════════════════════════════════════════════════════
// Visual helpers
// ═══════════════════════════════════════════════════════════

/**
 * Risk color — maps |base| to a green→red hue. DC scales with `base` (see
 * App.tsx handleBeatSelect), so this gives players a qualitative sense of
 * how risky a beat is without revealing the exact DC.
 */
function riskColor(base: number): string {
  const risk = Math.min(1, Math.abs(base) / 10);
  const hue = 120 * (1 - risk);
  return `hsl(${hue.toFixed(0)}, 55%, 60%)`;
}

// Kind label — friendly tile-footer text per BeatKind enum.
const KIND_LABEL: Record<string, string> = {
  press: "press",
  soak: "defend",
  angle: "angle",
  finisher: "finish",
};

// Sort: defenders first, then by risk ascending, finishers pinned right.
function sortedBeats(beats: BeatOption[] | undefined | null): BeatOption[] {
  return [...(beats ?? [])].sort((a, b) => {
    if (!!a.resolution !== !!b.resolution) return a.resolution ? 1 : -1;
    const ka = a.kind === "soak" ? -1 : 0;
    const kb = b.kind === "soak" ? -1 : 0;
    if (ka !== kb) return ka - kb;
    return (a.base ?? 1) - (b.base ?? 1);
  });
}

// ═══════════════════════════════════════════════════════════
// Compact status line — one row: actors · label · dual edges
// ═══════════════════════════════════════════════════════════

function ActorChip({ actor }: { actor: EncounterActor }) {
  // Story 65-6: render the world-scoped portrait when present; fall back to the
  // name initial for actors without one. Guard on presence so a null/empty URL
  // never produces a broken <img>.
  const hasPortrait =
    typeof actor.portrait_url === "string" && actor.portrait_url.length > 0;
  return (
    <div
      data-testid="actor-portrait"
      data-has-portrait={hasPortrait ? "true" : "false"}
      title={`${actor.name} — ${actor.role}`}
      className="w-5 h-5 rounded-full bg-muted border border-border grid place-items-center text-[10px] font-semibold text-foreground flex-shrink-0 overflow-hidden"
    >
      {hasPortrait ? (
        <img
          src={actor.portrait_url}
          alt={actor.name}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        actor.name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

type MetricSide = "player" | "opponent";

const SIDE_LABEL: Record<MetricSide, string> = {
  player: "You",
  opponent: "Them",
};

// Player edge cool blue; opponent edge amber/red — matches the UX addendum
// recommendation (Adora Belle Dearheart, 2026-04-25) and the D2 mock palette.
// Backed by --encounter-player / --encounter-opponent tokens (D2 handoff,
// 2026-05-13). Inline-styled because the oklch hues sit outside the
// Tailwind palette; switching to the tokens keeps theme overrides honest.
const SIDE_COLOR_VAR: Record<MetricSide, string> = {
  player: "var(--encounter-player)",
  opponent: "var(--encounter-opponent)",
};

function EdgeBar({
  metric,
  side,
}: {
  metric: EncounterMetric;
  side: MetricSide;
}) {
  const threshold = metric.threshold > 0 ? metric.threshold : 10;
  const fillPct = Math.max(0, Math.min(100, (metric.current / threshold) * 100));
  const atThreshold = metric.current >= metric.threshold && metric.threshold > 0;
  return (
    <div
      data-testid="metric-bar"
      data-metric-side={side}
      data-metric-name={metric.name}
      data-at-threshold={atThreshold ? "true" : undefined}
      className="flex-1 flex items-center gap-1.5 min-w-0"
    >
      <span
        className="text-[9px] uppercase tracking-wider font-semibold flex-shrink-0"
        style={{ color: SIDE_COLOR_VAR[side] }}
        aria-label={`${side === "player" ? "Player" : "Opponent"} edge`}
      >
        {SIDE_LABEL[side]}
      </span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden min-w-[24px]">
        <div
          data-testid="metric-bar-fill"
          className={`h-full transition-all duration-300 ${atThreshold ? "animate-pulse" : ""}`}
          style={{
            width: `${fillPct}%`,
            background: SIDE_COLOR_VAR[side],
            boxShadow: atThreshold ? `0 0 8px ${SIDE_COLOR_VAR[side]}` : undefined,
          }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
        {metric.current}/{metric.threshold}
        <span className="sr-only"> {metric.name}</span>
      </span>
    </div>
  );
}

function StatusLine({ data }: { data: ConfrontationData }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 rounded-md mb-2 border"
      style={{
        background: "oklch(0.21 0.008 80)",
        borderColor: "var(--border-soft)",
      }}
    >
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {data.actors.map((a, i) => (
          <span key={a.name} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-[10px] text-muted-foreground/60">vs</span>
            )}
            <ActorChip actor={a} />
          </span>
        ))}
      </div>
      <span className="font-serif italic text-[13px] text-foreground flex-shrink-0">
        {data.label}
      </span>
      <div
        data-testid="dual-dial-bars"
        className="flex-1 flex items-center gap-3 min-w-0"
      >
        <EdgeBar metric={data.player_metric} side="player" />
        <EdgeBar metric={data.opponent_metric} side="opponent" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// D2 tile — label + stat caps + italic flavor + footer
// ═══════════════════════════════════════════════════════════

function BeatTile({
  beat,
  onSelect,
}: {
  beat: BeatOption;
  onSelect?: (id: string) => void;
}) {
  const base = beat.base ?? 1;
  // The roll the player makes is d20 + their stat modifier vs this DC. `base`
  // is the dial-IMPACT magnitude (how far the dial moves on a success) and it
  // ALSO scales the DC — it is NOT a roll bonus. Showing "+{base}" next to the
  // stat name read as "Cunning +3" while the actual roll modifier was the
  // ability mod (+1) — a self-contradicting player-facing number (playtest
  // 59-8, Sebastien/Jade lane). Show the DC instead: it matches what the dice
  // panel displays on commit ("need 16 on d20") and is the honest difficulty
  // signal. Formula mirrors the server NativeRulesetModule.compute_dc /
  // _opposed_dc (10 + 2*|base|, clamped 10..30) and App.tsx's dice-request
  // builder, so all three agree on the same number.
  const dc = Math.min(30, Math.max(10, 10 + Math.abs(base) * 2));
  const color = riskColor(base);
  const finisher = !!beat.resolution;
  const tooltip = beat.risk
    ? `${beat.label} (${beat.stat_check}) — ${beat.risk}`
    : `${beat.label} (${beat.stat_check})`;

  // Surfaces are inline because the spec hues sit outside the Tailwind
  // scale. Hover swaps the bg via a CSS variable so the rule stays in one
  // place instead of two near-duplicate Tailwind classes.
  const normalBg = "oklch(0.22 0.008 80)";
  const normalHover = "oklch(0.24 0.008 80)";
  const finisherBg = "color-mix(in oklab, var(--accent-finisher) 7%, var(--card))";
  const finisherHover = "color-mix(in oklab, var(--accent-finisher) 11%, var(--card))";
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      data-resolution={finisher ? "true" : undefined}
      data-risk={Math.min(1, Math.abs(base) / 10).toFixed(2)}
      onClick={() => onSelect?.(beat.id)}
      className="relative text-left cursor-pointer rounded-md transition-colors flex flex-col justify-center gap-0.5 min-h-[40px] px-2.5 pl-3.5 py-1.5 border"
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        background: finisher ? finisherBg : normalBg,
        borderColor: finisher ? "var(--accent-finisher)" : "var(--border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = finisher ? finisherHover : normalHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = finisher ? finisherBg : normalBg;
      }}
    >
      {/* Risk color stripe — dynamic hue, inline */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
        style={{ background: color }}
      />

      {/* Row 1 — label + finisher star. The player's typed action carries
          the flavor now (beats are submit verbs for the InputBar draft),
          so the per-tile italic flavor line was dropped 2026-05-26 — it
          competed with the player's own prose and cost ~44px of height. */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={[
            "text-[13px] truncate min-w-0",
            finisher ? "font-bold" : "font-semibold",
          ].join(" ")}
        >
          {beat.label}
        </span>
        {finisher && (
          <span
            aria-label="resolution beat"
            title="Resolution — can end the confrontation"
            className="text-[12px] font-bold leading-none flex-shrink-0"
            style={{ color: "var(--accent-finisher)" }}
          >
            ✦
          </span>
        )}
      </div>

      {/* Row 2 — mechanical signal kept legible for the crunch players:
          kind · stat · +base on the left, risk dot on the right. */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <span className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-semibold truncate min-w-0">
          {KIND_LABEL[beat.kind ?? ""] ?? beat.kind ?? ""}
          {beat.kind && <span className="opacity-50"> · </span>}
          {beat.stat_check}
          <span className="opacity-50"> · </span>
          <span className="text-foreground/70 tracking-normal normal-case">DC {dc}</span>
        </span>
        {beat.risk && (
          <span
            className="inline-flex items-center gap-1 text-[10px] italic truncate min-w-0 flex-shrink-0"
            style={{ color }}
          >
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: color }}
            />
            {beat.risk}
          </span>
        )}
      </div>
    </button>
  );
}

function BeatGrid({
  beats,
  onSelect,
}: {
  beats: BeatOption[];
  onSelect?: (id: string) => void;
}) {
  return (
    <div
      data-testid="beat-grid"
      className="grid gap-1.5 content-start"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
    >
      {sortedBeats(beats).map((beat) => (
        <BeatTile key={beat.id} beat={beat} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Secondary stats panel — chase rigs, ship pools, etc.
// ═══════════════════════════════════════════════════════════

function SecondaryStatsPanel({ stats }: { stats: SecondaryStats }) {
  const entries = Object.entries(stats.stats ?? {});
  if (entries.length === 0) return null;
  return (
    <div
      data-testid="secondary-stats"
      className="mt-2 p-2 bg-muted/40 rounded text-xs space-y-1"
    >
      {stats.damage_tier && (
        <div className="text-center font-semibold text-muted-foreground/70 mb-1">
          {stats.damage_tier}
        </div>
      )}
      {entries.map(([name, val]) => (
        <div key={name} className="flex justify-between">
          <span className="capitalize">{name.replace(/_/g, " ")}</span>
          <span className="tabular-nums">{val.current} / {val.max}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Outcome reveal — branch + mandatory outputs
// ═══════════════════════════════════════════════════════════

const OUTPUT_HUMANIZE: Record<string, string> = {
  sanity_decrement: "Sanity drops",
  sanity_increment: "Sanity recovers",
  notice_decrement: "Notice fades",
  notice_increment: "Notice rises",
  hegemony_heat_increment: "Hegemony heat rises",
  hegemony_heat_decrement: "Hegemony heat eases",
  control_tier_advance: "Control of the touch grows (tier advance)",
  status_add_scratch: "Scratch status added",
  status_add_wound: "Wound status added",
  status_add_scar: "Scar status added",
  scar_political: "Political scar added",
  character_scar_extracted: "Character extracted (Scar)",
  item_acquired: "Item acquired",
  item_acquired_alien: "Alien item acquired",
  item_acquired_with_low_bond: "Item acquired (low bond)",
  item_history_increment: "Item history grows",
  bond_increment: "Bond strengthens",
  bond_decrement: "Bond weakens",
  bond_increment_to_alien: "Alien bond strengthens",
  lore_revealed: "Lore revealed",
  lore_revealed_major: "Major lore revealed",
  sanity_floor_lowered: "Sanity floor lowered",
  status_clear_bleeding_through: "Bleeding-through clears",
};

function humanizeOutput(outputId: string): string {
  return OUTPUT_HUMANIZE[outputId] ?? outputId;
}

function ConfrontationOutcomeReveal({ outcome }: { outcome: ConfrontationOutcome }) {
  return (
    <div
      data-testid="confrontation-outcome-reveal"
      data-branch={outcome.branch}
      className={`confrontation-outcome-reveal mt-2 p-2 rounded border outcome-${outcome.branch}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide mb-1">
        {outcome.label} · {outcome.branch.replace(/_/g, " ")}
      </div>
      <ul className="mandatory-outputs text-xs space-y-0.5">
        {outcome.mandatory_outputs.map((id) => (
          <li key={id} data-output-id={id}>
            {humanizeOutput(id)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════

/**
 * Confrontation panel — D2 tile-grid design.
 *
 * Mounted between the dockview workspace and the InputBar (see GameBoard).
 * Beat tiles are alternate submit verbs for whatever the player has typed
 * into the InputBar; plain Enter is locked during an active confrontation,
 * so a tile click is the only way to commit the turn. The ▾ chevron on
 * each tile reserves the slot for the upcoming expand-for-details feature.
 */
export function ConfrontationOverlay({
  data,
  onBeatSelect,
  diceRequest,
  diceResult,
  playerId,
  onDiceThrow,
  onYield,
  outcome,
}: ConfrontationOverlayProps) {
  if (!data) return null;

  return (
    <div
      data-testid="confrontation-overlay"
      data-type={data.type}
      data-genre={data.genre_slug}
      className="confrontation-panel bg-card/60 border-t border-border/40 px-3 pt-2 pb-1"
    >
      <StatusLine data={data} />

      {/*
       * Phase 5 (Story 47-3): branch-explicit outcome reveal.
       * D2 handoff (2026-05-13) re-anchors the reveal between the status
       * line and the beat grid so it reads as "what just resolved" sitting
       * above the next move-set rather than detached above the dial row.
       */}
      {outcome && <ConfrontationOutcomeReveal outcome={outcome} />}

      {/*
       * Commit row — beats (the submit verbs for the InputBar draft) on the
       * left, the persistent die lane on the right (Klinger design,
       * 2026-05-26). Side-by-side rather than stacked so the die gets a
       * stable, examinable home that never reflows the beats and never
       * flashes in/out: it shares the row's height instead of adding to it.
       * When the dice tray isn't wired (no onDiceThrow/playerId, e.g. in
       * isolation tests) the beats reclaim the full width.
       */}
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <BeatGrid beats={data.beats ?? []} onSelect={onBeatSelect} />

          {/* Yield — only when the player has spent edge to refund. */}
          {onYield !== undefined &&
            data.player_metric.current > data.player_metric.starting && (
              <div className="mt-2">
                <YieldButton onYield={onYield} disabled={false} />
              </div>
            )}
        </div>

        {/* Persistent die lane — rolls here on beat commit, then the settled
            die stays put (examinable, no flash) until the next commit. */}
        {onDiceThrow && playerId && (
          <div className="flex-shrink-0" style={{ width: 200 }}>
            <InlineDiceTray
              diceRequest={diceRequest ?? null}
              diceResult={diceResult ?? null}
              playerId={playerId}
              onThrow={onDiceThrow}
              genreSlug={data.genre_slug}
            />
          </div>
        )}
      </div>

      {/* Secondary stats — chase rigs, ship pools, etc. */}
      {data.secondary_stats && <SecondaryStatsPanel stats={data.secondary_stats} />}
    </div>
  );
}
