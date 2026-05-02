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
  /** When true, renders inline (no fixed positioning) for use inside a widget. */
  inline?: boolean;
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
// Metric bar — one ascending dial, color-coded by side
// ═══════════════════════════════════════════════════════════

type MetricSide = 'player' | 'opponent';

const SIDE_LABEL: Record<MetricSide, string> = {
  player: 'Player edge',
  opponent: 'Opponent edge',
};

// Cool blue for the player edge, amber/red for the opponent edge — matches
// the UX addendum recommendation (Adora Belle Dearheart, 2026-04-25). Bars
// flash when they reach threshold so Sebastien sees the cause before the
// narrator delivers the effect.
const SIDE_FILL_CLASS: Record<MetricSide, string> = {
  player: 'bg-sky-500',
  opponent: 'bg-amber-500',
};

function MetricBar({ metric, side }: { metric: EncounterMetric; side: MetricSide }) {
  const threshold = metric.threshold > 0 ? metric.threshold : 10;
  const fillPct = Math.max(0, Math.min(100, (metric.current / threshold) * 100));
  const atThreshold = metric.current >= metric.threshold && metric.threshold > 0;

  return (
    <div
      data-testid="metric-bar"
      data-metric-side={side}
      data-metric-name={metric.name}
      data-at-threshold={atThreshold ? 'true' : undefined}
      className="mb-2"
    >
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-semibold uppercase tracking-wide">
          {SIDE_LABEL[side]} <span className="text-muted-foreground capitalize">({metric.name})</span>
        </span>
        <span className="text-muted-foreground tabular-nums">
          {metric.current} / {metric.threshold}
        </span>
      </div>
      <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          data-testid="metric-bar-fill"
          className={`h-full rounded-full transition-all duration-300 ${SIDE_FILL_CLASS[side]} ${
            atThreshold ? 'animate-pulse' : ''
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Actor portraits
// ═══════════════════════════════════════════════════════════

function ActorPortrait({
  actor,
  isStandoff,
}: {
  actor: EncounterActor;
  isStandoff: boolean;
}) {
  const portraitClasses = [
    'flex flex-col items-center gap-1',
    isStandoff ? 'extreme-closeup' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div data-testid="actor-portrait" className={portraitClasses}>
      {actor.portrait_url ? (
        <img
          src={actor.portrait_url}
          alt={actor.name}
          className="w-16 h-16 rounded-full object-cover border-2 border-border"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground border-2 border-border">
          {actor.name.charAt(0)}
        </div>
      )}
      <span className="text-xs font-semibold">{actor.name}</span>
      <span className="text-[10px] text-muted-foreground capitalize">
        {actor.role}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Beat action buttons
// ═══════════════════════════════════════════════════════════

// Risk color — maps |base| to a green→red hue. DC scales with `base` (see
// App.tsx handleBeatSelect), so this gives players a qualitative sense of
// how risky a beat is without revealing the exact DC. Range: |base| 0 → 10
// maps to hue 120 (green) → 0 (red). Beats without an explicit `base` use
// the server-side default of 1.
function riskColor(base: number): string {
  const risk = Math.min(1, Math.abs(base) / 10);
  const hue = 120 * (1 - risk);
  return `hsl(${hue.toFixed(0)}, 60%, 50%)`;
}

function BeatActions({ beats, onBeatSelect }: { beats: BeatOption[]; onBeatSelect?: (beatId: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {beats.map((beat) => {
        // Match the narration renderer's "Ram (Grip)" format rather than
        // concatenating label + stat_check in the a11y text stream.
        // Risk text was previously inlined into the label (three fields crammed
        // into one button); move it to a native tooltip so the button stays
        // scannable and the consequence is still surfaced on hover/long-press.
        const tooltip = beat.risk
          ? `${beat.label} (${beat.stat_check}) — ${beat.risk}`
          : `${beat.label} (${beat.stat_check})`;
        const base = beat.base ?? 1;
        const color = riskColor(base);
        return (
          <button
            key={beat.id}
            type="button"
            title={tooltip}
            aria-label={tooltip}
            data-resolution={beat.resolution ? 'true' : undefined}
            data-risk={Math.min(1, Math.abs(base) / 10).toFixed(2)}
            onClick={() => onBeatSelect?.(beat.id)}
            style={{ borderColor: color, color }}
            className={[
              'px-3 py-1.5 rounded text-xs border transition-colors hover:bg-muted',
              beat.resolution ? 'font-bold' : '',
            ].join(' ')}
          >
            <span>{beat.label}</span>
            {' '}
            <span className="text-muted-foreground text-[10px]">
              ({beat.stat_check})
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Secondary stats panel (chase rig stats)
// ═══════════════════════════════════════════════════════════

function SecondaryStatsPanel({ stats }: { stats: SecondaryStats }) {
  const entries = Object.entries(stats.stats ?? {});
  if (entries.length === 0) return null;
  return (
    <div data-testid="secondary-stats" className="mt-3 p-2 bg-muted/50 rounded text-xs space-y-1">
      {stats.damage_tier && (
        <div className="text-center font-semibold text-muted-foreground/70 mb-1">{stats.damage_tier}</div>
      )}
      {entries.map(([name, val]) => (
        <div key={name} className="flex justify-between">
          <span className="capitalize">{name.replace(/_/g, " ")}</span>
          <span>{val.current} / {val.max}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════

/**
 * Humanize a mandatory_output id ("sanity_decrement" → "Sanity drops")
 * for the reveal panel. Falls back to the raw id when no mapping exists
 * — better to surface an unstyled token than to silently swallow it.
 */
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

function ConfrontationOutcomeReveal({
  outcome,
}: {
  outcome: ConfrontationOutcome;
}) {
  return (
    <div
      data-testid="confrontation-outcome-reveal"
      data-branch={outcome.branch}
      className={`confrontation-outcome-reveal mt-3 p-2 rounded border outcome-${outcome.branch}`}
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

export function ConfrontationOverlay({
  data,
  onBeatSelect,
  inline,
  diceRequest,
  diceResult,
  playerId,
  onDiceThrow,
  onYield,
  outcome,
}: ConfrontationOverlayProps) {
  if (!data) return null;

  const isStandoff = data.type === 'standoff';

  const overlayClasses = [
    inline
      ? 'bg-card p-4'
      : 'fixed inset-x-0 bottom-0 z-30 bg-card border-t border-border shadow-lg p-4',
    isStandoff ? 'letterbox' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      data-testid="confrontation-overlay"
      data-type={data.type}
      data-genre={data.genre_slug}
      className={overlayClasses}
    >
      <h3 className="text-sm font-bold mb-2">{data.label}</h3>

      {/* Phase 5 (Story 47-3): branch-explicit outcome reveal. Renders
          when the server has dispatched a CONFRONTATION_OUTCOME for
          this confrontation. Per design Decision #9: explicit panel
          callout at outcome time, always shown — players never have to
          infer what mandatory_outputs fired. */}
      {outcome && <ConfrontationOutcomeReveal outcome={outcome} />}

      {/* Actor portraits */}
      <div className="flex justify-around mb-3">
        {data.actors.map((actor) => (
          <ActorPortrait
            key={actor.name}
            actor={actor}
            isStandoff={isStandoff}
          />
        ))}
      </div>

      {/* Dual-dial momentum — player edge above, opponent below. Either side
          hitting its threshold triggers resolution (ADR-024). */}
      <div data-testid="dual-dial-bars">
        <MetricBar metric={data.player_metric} side="player" />
        <MetricBar metric={data.opponent_metric} side="opponent" />
      </div>

      {/* Beat action buttons */}
      <BeatActions beats={data.beats} onBeatSelect={onBeatSelect} />

      {/* Yield button — only rendered when the player has spent at least one
          edge of momentum (player_metric advanced past starting). The YIELD
          handler refunds an edge, so the affordance is only meaningful once
          there's an edge to refund. */}
      {onYield !== undefined && data.player_metric.current > data.player_metric.starting && (
        <div className="mt-2">
          <YieldButton onYield={onYield} disabled={false} />
        </div>
      )}

      {/* Inline dice tray — rolls right here when a beat is selected */}
      {onDiceThrow && playerId && (
        <InlineDiceTray
          diceRequest={diceRequest ?? null}
          diceResult={diceResult ?? null}
          playerId={playerId}
          onThrow={onDiceThrow}
          genreSlug={data.genre_slug}
        />
      )}

      {/* Secondary stats (chase rigs, etc.) */}
      {data.secondary_stats && (
        <SecondaryStatsPanel stats={data.secondary_stats} />
      )}
    </div>
  );
}
