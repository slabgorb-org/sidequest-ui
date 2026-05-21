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
   * panel, 2026-05-13). Takes precedence over the per-beat-id fallback
   * library below; when both are absent the flavor row collapses.
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

// Flavor copy per beat id — one sentence of italic character for the tile.
// Keyed by beat.id so genre packs can opt-in; falls back silently when
// missing (tile still renders, just without the flavor line). Library
// content lives here rather than on the wire so we don't bloat every
// CONFRONTATION message with cosmetic strings.
const BEAT_FLAVOR: Record<string, string> = {
  attack: "A clean swing, no theatrics.",
  defend: "Plant your feet. Read the next move.",
  grapple: "Get inside the reach. Hold on.",
  feint: "Sell the wrong angle.",
  shove: "Push them into furniture.",
  flee: "Choose the door, not the window.",
  finish: "End it before they get back up.",
  stare_down: "Make them look away first.",
  taunt: "Bait the draw.",
  draw: "Clear leather. Trust your hand.",
  pressure: "Lean in until the room tilts.",
  concede: "Give a little. Keep the rest.",
  bluff: "Say it like you mean it.",
  floor_it: "Pedal down. Pray the rod holds.",
  swerve: "Choose your scratch.",
};

// Sort: defenders first, then by risk ascending, finishers pinned right.
function sortedBeats(beats: BeatOption[]): BeatOption[] {
  return [...beats].sort((a, b) => {
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
  return (
    <div
      data-testid="actor-portrait"
      title={`${actor.name} — ${actor.role}`}
      className="w-5 h-5 rounded-full bg-muted border border-border grid place-items-center text-[10px] font-semibold text-foreground flex-shrink-0"
    >
      {actor.name.charAt(0).toUpperCase()}
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
  const color = riskColor(base);
  const finisher = !!beat.resolution;
  // Pack-authored flavor wins; fall back to the local id-keyed library so
  // beats that ship without a wire-side flavor still render with character.
  const flavor = beat.flavor ?? BEAT_FLAVOR[beat.id];
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
      className="relative text-left cursor-pointer rounded-md transition-colors grid gap-1 min-h-[84px] px-2.5 pl-3.5 py-2 border"
      style={{
        gridTemplateRows: "auto auto 1fr auto",
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

      {/* Row 1 — label + finisher star */}
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

      {/* Row 2 — stat in caps */}
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
        {beat.stat_check}
      </div>

      {/* Row 3 — flavor (D2) */}
      <div
        className="font-serif italic text-[12px] leading-snug text-muted-foreground/90 line-clamp-2"
        aria-hidden={flavor ? undefined : "true"}
      >
        {flavor ?? ""}
      </div>

      {/* Row 4 — kind · +base / risk · ▾ */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {KIND_LABEL[beat.kind ?? ""] ?? beat.kind ?? ""}
          {beat.kind && <span className="opacity-50"> · </span>}
          <span className="text-foreground/70">+{base}</span>
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          {beat.risk && (
            <span
              className="inline-flex items-center gap-1 text-[10.5px] italic truncate min-w-0"
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
          <span
            aria-hidden="true"
            title="Details (coming soon)"
            className="text-foreground/40 text-[11px] leading-none flex-shrink-0"
          >
            ▾
          </span>
        </div>
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
      className="grid gap-1.5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
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

      <BeatGrid beats={data.beats} onSelect={onBeatSelect} />

      {/* Yield — only when the player has spent edge to refund. */}
      {onYield !== undefined &&
        data.player_metric.current > data.player_metric.starting && (
          <div className="mt-2">
            <YieldButton onYield={onYield} disabled={false} />
          </div>
        )}

      {/* Inline dice tray — rolls right here when a beat is selected. */}
      {onDiceThrow && playerId && (
        <InlineDiceTray
          diceRequest={diceRequest ?? null}
          diceResult={diceResult ?? null}
          playerId={playerId}
          onThrow={onDiceThrow}
          genreSlug={data.genre_slug}
        />
      )}

      {/* Secondary stats — chase rigs, ship pools, etc. */}
      {data.secondary_stats && <SecondaryStatsPanel stats={data.secondary_stats} />}
    </div>
  );
}
