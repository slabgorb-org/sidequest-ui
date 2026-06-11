import { useCallback, useState } from "react";
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
  /**
   * Server seat (mirrors `EncounterActor.side` on the wire): `"player"` allies,
   * `"opponent"` adversaries, `"neutral"` bystanders. Story 85-3 uses it to pick
   * the THEM-side actor for the dedicated opponent panel — the dial "has a face"
   * (ADR-116). Optional/absent on legacy payloads; the THEM panel then renders
   * nothing rather than guessing.
   */
  side?: "player" | "opponent" | "neutral";
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
 * magnitude that drives risk color and dial impact (replaces the legacy
 * `metric_delta`); the DC is server-authored via `difficulty` (Story 97-3).
 */
export interface BeatOption {
  id: string;
  label: string;
  /** Beat kind: closed enum from BeatKind (drives per-tier delta defaults). */
  kind?: string;
  /** Scalar magnitude — drives risk color. Defaults to 1 server-side. */
  base?: number;
  /**
   * Server-authored pre-roll target number (Story 97-3). The server is the
   * ONLY DC author: native packs send the beat DC, SWN/hp_depletion packs
   * send the target's armor class. The TARGET banner renders this value;
   * the client computes nothing. A beat offer without it is malformed and
   * the commit is refused loudly (No Silent Fallbacks).
   */
  difficulty?: number;
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

/**
 * Story 73-4: player-facing beat-kind impact descriptor, server-derived in
 * `sidequest/game/beat_kinds.py::describe_beat_impact` (single source of truth).
 * Surfaced on the CONFRONTATION payload's `last_beat_impact` so the overlay can
 * explain a no-dial-move CritSuccess ("Clean Exit — resolves the confrontation,
 * no dial change by design") instead of a bare 0 that reads as a broken roll.
 *
 * `effect` is the categorical readout the UI styles on:
 *   `advance`  — a dial moved in your favor
 *   `setback`  — a dial moved against you
 *   `resolution` — the beat ends the confrontation (no dial change by design)
 *   `tag`      — a scene tag was granted (no dial change by design)
 *   `backfire` — an angle rebounded
 *   `inert`    — the beat landed but nothing happened (a genuine miss)
 */
/**
 * Closed set of beat-impact categories — mirrors the server's
 * `describe_beat_impact` (`sidequest/game/beat_kinds.py`). Typed as a union (not
 * bare `string`) so consumers get exhaustiveness checking and a typo'd/renamed
 * effect can't silently produce a dead `beat-impact-${effect}` CSS class.
 */
export type BeatEffect =
  | "advance"
  | "setback"
  | "resolution"
  | "tag"
  | "backfire"
  | "inert";

export interface BeatImpactView {
  effect: BeatEffect;
  dial_moved: boolean;
  summary: string;
  own?: number;
  opponent?: number;
  resolution?: boolean;
  tag?: string | null;
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
  /**
   * Resolution model. `"hp_depletion"` (SWN combat — win on a side reaching
   * 0 HP) or `"dial_threshold"` (native dial packs). Under hp_depletion the
   * dial metrics are inert 1e6 placeholders, so the overlay renders the HP
   * track below instead of the meaningless dial. Absent on legacy/dial
   * payloads — treated as dial_threshold.
   */
  win_condition?: string;
  /**
   * Primary combatants' HP under hp_depletion, `{current, max}`. The server
   * already emits these (sidequest-server confrontation.py:244-262, threaded
   * with the live find_creature_core resolver); this overlay is the UI mirror
   * the server NOTE flagged as deferred. Absent for dial packs / when no
   * backing CreatureCore resolves.
   */
  player_hp?: StatValue;
  opponent_hp?: StatValue;
  beats: BeatOption[];
  secondary_stats: SecondaryStats | null;
  genre_slug: string;
  mood: string;
  /**
   * Story 85-3 (Tier B): the session's active stakes (set_stakes), surfaced on
   * the CONFRONTATION channel so the promoted dockview panel renders a stakes
   * banner up top (Cost Scales with Drama). Always present on the wire (None /
   * absent when the session has no active stakes); the banner collapses on any
   * falsy value.
   */
  stakes?: string;
  /**
   * Server-side clear signal: when `false`, the confrontation has ended and
   * the overlay should unmount. Absent or `true` means active. Handled at
   * dispatch in App.tsx (search: `payload.active !== false`).
   */
  active?: boolean;
  /**
   * Story 73-4: server-derived readout of the last beat the PLAYER resolved.
   * Absent on legacy payloads / before any beat — the overlay renders nothing
   * for it then.
   */
  last_beat_impact?: BeatImpactView | null;
  /**
   * Story 73-7: opponent-side sibling of last_beat_impact. Absent/null when the
   * opponent hasn't acted — the overlay then renders only the player readout.
   */
  opponent_last_beat_impact?: BeatImpactView | null;
  /**
   * Story 102-2: the recipient's WN cast economy, projected by the server
   * (build_confrontation_payload). Drives the "Work a Spell" prepared-spell
   * picker: `prepared` is the spell-id list the picker offers,
   * `casts_remaining` the player-visible spend math (the Sebastien/Jade
   * lane). `null` for non-casters / non-WN packs — the server never
   * fabricates an empty economy, and the picker gates on the value.
   */
  spellcasting?: ConfrontationSpellcasting | null;
  /**
   * Story 102-4: the WN sealed-round commit ledger — player-side actor
   * names whose Main Action is sealed this round (wire mirror of
   * build_confrontation_payload()["committed_actors"]). Drives the
   * committed-vs-waiting indicators so the table can see who the round is
   * waiting on (ADR-036 submit-and-wait; collaborative visibility, never a
   * rush cue). Absent on legacy/dial payloads and between WN rounds — the
   * overlay renders no indicators then.
   */
  committed_actors?: string[] | null;
}

/** Story 102-2: WN cast economy block on the CONFRONTATION payload. */
export interface ConfrontationSpellcasting {
  casts_remaining: number;
  casts_per_day?: number;
  /** Prepared spell IDs (e.g. "wracking_bolt") — labels humanized client-side. */
  prepared: string[];
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

/**
 * Story 85-3 (The Guitar Solo): one non-soloing player's concurrent verb,
 * surfaced in the "meanwhile at the table" strip so a confrontation spotlight
 * never leaves the rest of the band as a silent audience. Sourced from existing
 * MP peer-action state (ADR-036 2026-05-03 amendment — peer action text is
 * visible during the wait phase); collapses to nothing in solo play.
 */
export interface MeanwhileAction {
  /** Character (or player) name — "Spark". */
  actor: string;
  /** Optional role tag — "gunner". */
  role?: string;
  /** The concurrent action text — "lay down covering fire". */
  verb: string;
}

interface ConfrontationOverlayProps {
  data: ConfrontationData | null;
  /**
   * Story 85-3: the table's concurrent verbs while one player is in the
   * confrontation. Empty/undefined in solo play → the strip collapses.
   */
  meanwhileActions?: MeanwhileAction[];
  /**
   * Beat commit. `spellId` is present only when the committed beat is the
   * cast beat and the player chose a prepared spell in the picker (102-2);
   * undefined on every other beat.
   */
  onBeatSelect?: (beatId: string, spellId?: string) => void;
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
      title={`${humanizeActorName(actor.name)} — ${actor.role}`}
      className="w-5 h-5 rounded-full bg-muted border border-border grid place-items-center text-[10px] font-semibold text-foreground flex-shrink-0 overflow-hidden"
    >
      {hasPortrait ? (
        <img
          src={actor.portrait_url}
          alt={humanizeActorName(actor.name)}
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

// Story 73-14: a dial delta as a signed, human-legible string — positives gain a
// leading "+", negatives keep their natural ASCII "-", and zero stays a bare "0"
// (the guard is `> 0`, NOT `>= 0`, so a no-move reads as "0", not a phantom "+0"
// gain). Shared by the BeatImpactPanel readouts and the LedgerRow Δ column so the
// two surfaces can never drift in how they render the sign of a delta.
const formatSignedDelta = (delta: number): string => (delta > 0 ? `+${delta}` : `${delta}`);

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
          className={`h-full transition-all duration-300 motion-reduce:transition-none ${atThreshold ? "animate-pulse motion-reduce:animate-none" : ""}`}
          style={{
            width: `${fillPct}%`,
            background: SIDE_COLOR_VAR[side],
            boxShadow: atThreshold ? `0 0 8px ${SIDE_COLOR_VAR[side]}` : undefined,
          }}
        />
      </div>
      <span className="text-sm font-semibold text-foreground tabular-nums flex-shrink-0">
        {metric.current}/{metric.threshold}
        <span className="sr-only"> {metric.name}</span>
      </span>
    </div>
  );
}

// HP track for hp_depletion (SWN) combat. Unlike EdgeBar (an edge that fills
// UP toward a resolution threshold), HP DEPLETES: the bar starts full at max
// and drains toward 0, which is the loss condition. Reuses the per-side
// blue/amber palette so the player can read "my HP" vs "their HP" at a glance
// (Sebastien/Jade player-facing-math goal). Renders the literal current/max so
// the math is legible.
function HpBar({ hp, side }: { hp: StatValue; side: MetricSide }) {
  const max = hp.max > 0 ? hp.max : 1;
  const fillPct = Math.max(0, Math.min(100, (hp.current / max) * 100));
  const downed = hp.current <= 0;
  return (
    <div
      data-testid="hp-bar"
      data-hp-side={side}
      data-hp-downed={downed ? "true" : undefined}
      className="flex-1 flex items-center gap-1.5 min-w-0"
    >
      <span
        className="text-[9px] uppercase tracking-wider font-semibold flex-shrink-0"
        style={{ color: SIDE_COLOR_VAR[side] }}
        aria-label={`${side === "player" ? "Player" : "Opponent"} HP`}
      >
        {SIDE_LABEL[side]}
      </span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden min-w-[24px]">
        <div
          data-testid="hp-bar-fill"
          className={`h-full transition-all duration-300 ${downed ? "animate-pulse" : ""}`}
          style={{
            width: `${fillPct}%`,
            background: SIDE_COLOR_VAR[side],
            boxShadow: downed ? `0 0 8px ${SIDE_COLOR_VAR[side]}` : undefined,
          }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
        {hp.current}/{hp.max}
        <span className="sr-only"> HP</span>
      </span>
    </div>
  );
}

function StatusLine({ data }: { data: ConfrontationData }) {
  // hp_depletion combat carries inert 1e6 placeholder dials; render the real
  // HP track instead so the bars don't read "0/1000000". Fall back to the dial
  // EdgeBar per-side when a side's HP is absent (no backing CreatureCore) or
  // for any non-hp_depletion (dial) confrontation — keeps dial packs unchanged.
  const isHpDepletion = data.win_condition === "hp_depletion";
  // Story 102-4: WN sealed-round commitment state. Indicators render only
  // when the server sent the ledger (WN round in progress) and only for
  // PLAYER-side actors — the opponent doesn't submit, and implying a closed
  // "enemy is waiting" state would be a lie. Legacy payloads (key absent)
  // render no indicators, keeping native packs byte-for-byte.
  const committedActors = Array.isArray(data.committed_actors)
    ? new Set(data.committed_actors)
    : null;
  return (
    <div
      data-testid="dial-scoreboard"
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
            {committedActors !== null && a.side === "player" && (
              <span
                data-testid={`commitment-${a.name}`}
                data-committed={committedActors.has(a.name) ? "true" : "false"}
                className="text-[9px] uppercase tracking-wide flex-shrink-0"
                style={{
                  color: committedActors.has(a.name)
                    ? "var(--encounter-player)"
                    : "var(--muted-foreground)",
                }}
              >
                {committedActors.has(a.name) ? "Committed" : "Waiting"}
              </span>
            )}
          </span>
        ))}
      </div>
      <span className="font-serif italic text-[13px] text-foreground flex-shrink-0">
        {data.label}
      </span>
      <div
        data-testid="dual-dial-bars"
        data-resolution-model={isHpDepletion ? "hp_depletion" : "dial_threshold"}
        className="flex-1 flex items-center gap-3 min-w-0"
      >
        {isHpDepletion && data.player_hp ? (
          <HpBar hp={data.player_hp} side="player" />
        ) : (
          <EdgeBar metric={data.player_metric} side="player" />
        )}
        {isHpDepletion && data.opponent_hp ? (
          <HpBar hp={data.opponent_hp} side="opponent" />
        ) : (
          <EdgeBar metric={data.opponent_metric} side="opponent" />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Story 102-2 — prepared-spell picker for the cast beat
// ═══════════════════════════════════════════════════════════

/**
 * The WN-family cast beat id. A literal contract shared with the server:
 * dispatch routes `beat_id === "cast_spell"` + `spell_id` into the WN cast
 * spine, and the overlay defers this tile's commit behind the picker.
 */
const CAST_SPELL_BEAT_ID = "cast_spell";

/** "wracking_bolt" → "Wracking Bolt". Picker labels are humanized spell ids —
 * the CONFRONTATION projection carries ids only (catalog names are a
 * server-side follow-up; see story 102-2 delivery findings). */
function humanizeSpellId(id: string): string {
  return id
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** "unknown_dark_contact" → "Unknown Dark Contact" (sq-playtest 2026-06-10 UX).
 * A runtime-seated opponent with no known name carries a slug as its
 * `actor.name`, and that field is a load-bearing entity id (tag targets /
 * last_beat_impacts keys reference it) — so we humanize for DISPLAY only and
 * never rewrite the id. De-underscore + capitalize the first letter of each
 * segment; the rest of each segment is left untouched, so an already-humanized
 * real name ("Kanga Moana-Teru") passes through unchanged rather than being
 * lower-cased and mangled. Same transform the spell-id picker uses. */
function humanizeActorName(name: string): string {
  return name
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function SpellPicker({
  spellcasting,
  onChoose,
  onCancel,
}: {
  spellcasting: ConfrontationSpellcasting;
  onChoose: (spellId: string) => void;
  onCancel: () => void;
}) {
  const { casts_remaining, casts_per_day, prepared } = spellcasting;
  // Player-visible spend math (Sebastien/Jade lane): "2/2" when the day
  // ceiling is known, bare count otherwise.
  const castsLabel =
    typeof casts_per_day === "number"
      ? `${casts_remaining}/${casts_per_day}`
      : String(casts_remaining);
  return (
    <div
      data-testid="spell-picker"
      data-casts-remaining={String(casts_remaining)}
      role="group"
      aria-label="Choose a prepared spell"
      className="mt-2 rounded-md border border-border/60 bg-card/80 p-2"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-xs uppercase tracking-wide"
          style={{ color: "var(--muted-foreground)" }}
        >
          Work a Spell — casts {castsLabel}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel spell selection"
          className="text-xs px-1.5 py-0.5 rounded cursor-pointer hover:bg-muted/40"
          style={{ color: "var(--muted-foreground)" }}
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {prepared.map((spellId) => (
          <button
            key={spellId}
            type="button"
            data-spell-id={spellId}
            onClick={() => onChoose(spellId)}
            className="text-left text-sm rounded px-2 py-1 cursor-pointer border border-border/40 hover:border-[var(--accent-finisher)] transition-colors motion-reduce:transition-none"
            style={{ color: "var(--card-foreground)" }}
          >
            {humanizeSpellId(spellId)}
          </button>
        ))}
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
  // is the dial-IMPACT magnitude (how far the dial moves on a success) — it
  // is NOT a roll bonus. Showing "+{base}" next to the stat name read as
  // "Cunning +3" while the actual roll modifier was the ability mod (+1) — a
  // self-contradicting player-facing number (playtest 59-8, Sebastien/Jade
  // lane). Show the DC instead: it matches what the dice panel displays on
  // commit ("need 16 on d20") and is the honest difficulty signal.
  // Story 97-3 (rework): the DC is SERVER-AUTHORED — `beat.difficulty` on the
  // offer is the number resolution will use (native: beat-DC formula; SWN
  // family: target armor class; opposed_check: per-side formula DC; cwn
  // hacking: security DC). The old client formula here diverged from all of
  // those except native and made the tile lie. A beat without a server DC
  // renders NO chip — inventing a number would resurrect the exact silent
  // fallback this story killed (App.tsx refuses the commit for such beats).
  const dc = typeof beat.difficulty === "number" ? beat.difficulty : null;
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
  // Text color must match the SURFACE, not the theme. Non-finisher tiles use a
  // hard-coded dark surface (normalBg) that does NOT flip with the genre theme,
  // so their text must be a fixed light tone — otherwise a light theme (e.g.
  // Tea & Murder / Glenross, whose --foreground is dark) inherits dark-on-dark
  // and the label/kind/stat/DC vanish (playtest 67-10). The finisher tile's
  // surface IS theme-derived (--card), so its text correctly tracks
  // --card-foreground and stays legible in both light and dark themes.
  const tileText = finisher ? "var(--card-foreground)" : "oklch(0.92 0.012 80)";
  const tileTextMuted = finisher ? "var(--muted-foreground)" : "oklch(0.72 0.01 80)";
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={finisher ? `${tooltip} — resolution beat` : tooltip}
      data-resolution={finisher ? "true" : undefined}
      data-risk={Math.min(1, Math.abs(base) / 10).toFixed(2)}
      onClick={() => onSelect?.(beat.id)}
      className="relative text-left cursor-pointer rounded-md transition-colors motion-reduce:transition-none flex flex-col justify-center gap-0.5 min-h-[40px] px-2.5 pl-3.5 py-1.5 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-finisher)]"
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        background: finisher ? finisherBg : normalBg,
        borderColor: finisher ? "var(--accent-finisher)" : "var(--border)",
        color: tileText,
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
            "text-[13px] min-w-0 break-words",
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
        <span
          className="text-[9.5px] uppercase tracking-[0.14em] font-semibold truncate min-w-0"
          style={{ color: tileTextMuted }}
        >
          {KIND_LABEL[beat.kind ?? ""] ?? beat.kind ?? ""}
          {beat.kind && <span className="opacity-50"> · </span>}
          {beat.stat_check}
          {dc !== null && (
            <>
              <span className="opacity-50"> · </span>
              <span className="tracking-normal normal-case" style={{ color: tileText }}>
                DC {dc}
              </span>
            </>
          )}
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
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
    >
      {sortedBeats(beats).map((beat) => (
        <BeatTile key={beat.id} beat={beat} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Beat-history ledger (Story 85-1, A5) — visible mechanical provenance for the
// dial. The crunch players (Sebastien/Jade) want to SEE the engine moved the
// dial, not just trust the prose. The current CONFRONTATION payload carries
// only the most-recent impact (BeatImpactView has no roll/DC/actor and no
// history array), so this renders the latest beat's provenance per side; the
// full multi-row "actor · beat · roll vs DC · dial Δ" ledger needs a payload
// history field and is deferred — see session deviation D1 / Story 85-3.
// ═══════════════════════════════════════════════════════════

function LedgerRow({ impact, side }: { impact: BeatImpactView; side: "You" | "Them" }) {
  // `impact` is already the acting entity's own BeatImpactView (player vs
  // opponent), so the dial delta to show is always `.own` — the same field
  // BeatImpactPanel reads for each side, pinned by Story 73-7. (Review fix: the
  // Them row previously read `.opponent`, the cross-effect on the OTHER dial,
  // and so reported the opponent's progress as ~0.) `side` is the label only.
  const delta = impact.own ?? 0;
  const signed = formatSignedDelta(delta);
  return (
    <div className="flex items-center gap-2 text-[11px] tabular-nums">
      <span className="w-10 flex-shrink-0 font-semibold uppercase tracking-wider text-muted-foreground">
        {side}
      </span>
      <span className="min-w-0 flex-1 break-words text-foreground/90">{impact.summary}</span>
      <span
        className="flex-shrink-0 font-semibold"
        style={{ color: delta >= 0 ? "var(--accent-finisher, #d8a657)" : "var(--destructive, #e06c75)" }}
        aria-label={`dial delta ${signed}`}
      >
        Δ{signed}
      </span>
    </div>
  );
}

function BeatHistoryLedger({
  impact,
  opponent,
}: {
  impact?: BeatImpactView | null;
  opponent?: BeatImpactView | null;
}) {
  // Story 73-13: the ledger shares the impact panel's gate, so the
  // opponent-acts-first window must not suppress it either. Render the "You" row
  // only when the player has acted; the "Them" row carries the window on its own.
  if (!impact && !opponent) return null;
  return (
    <div
      data-testid="beat-history-ledger"
      className="mb-2 flex flex-col gap-0.5 rounded-md border border-border/40 px-2 py-1"
    >
      {impact && <LedgerRow impact={impact} side="You" />}
      {opponent && <LedgerRow impact={opponent} side="Them" />}
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
// Beat-kind impact reveal — Story 73-4
//
// Explains what the player's last beat actually did, so a no-dial-move
// CritSuccess (push "Clean Exit" / angle tag-grant) reads as intended instead
// of a bare 0 that looks like a broken roll. `data-effect` lets genre CSS render
// a "resolution"/"tag" by-design outcome as GOOD, distinct from an inert miss or
// a setback. It is an adjunct to the dial bars, never a replacement.
// ═══════════════════════════════════════════════════════════

function BeatImpactPanel({
  impact,
  opponent,
}: {
  impact?: BeatImpactView | null;
  opponent?: BeatImpactView | null;
}) {
  // Story 73-13: in the opponent-acts-first window (legacy beat_selection path /
  // surprise round / player took a non-combat action) the opponent has an impact
  // but the player has not acted yet. Drive the panel container from whichever
  // side is present so the opponent "hit you" readout still renders. The
  // player-own readout is omitted — not shown as a misleading 0 — when the
  // player half is absent (symmetric to how the opponent half is omitted).
  const head = impact ?? opponent;
  if (!head) return null;
  // Story 73-13 follow-up: the effect taxonomy (advance/setback/backfire…) is
  // PLAYER-relative — `beat-impact-advance` maps to --encounter-player. So when the
  // container is driven by the OPPONENT's beat (opponent-acts-first window), its
  // effect must NOT borrow the player's coloring: an opponent 'advance' would read
  // as a player win. `data-actor` lets the CSS re-key the opponent-only state to
  // --encounter-opponent (see beat-impact.css) so it reads as "the enemy acted".
  const actor = impact == null && opponent != null ? "opponent" : "player";
  return (
    <div
      data-testid="beat-impact"
      data-effect={head.effect}
      data-actor={actor}
      data-dial-moved={head.dial_moved ? "true" : "false"}
      className={`beat-impact mt-2 p-2 rounded border beat-impact-${head.effect}`}
    >
      <span className="text-xs">{head.summary}</span>
      {/*
       * Story 73-7: numeric delta readouts so mechanics-first players see what
       * happened to the numbers on BOTH sides — the player's own dial delta and
       * (when the server sent one) the opponent's. 73-10 owns labels/styling.
       */}
      {/*
       * Story 73-14: each readout carries a "You"/"Them" label and a signed
       * delta so two adjacent bare integers ("3" "2") are disambiguated for a
       * human (mechanics-first players, Sebastien / Jade) — today only the DOM
       * testid told them apart. Labels reuse SIDE_LABEL; the sign reuses the
       * shared formatSignedDelta so this panel and the LedgerRow Δ never drift.
       */}
      {impact != null && (
        <span data-testid="beat-impact-own" className="text-xs">
          {SIDE_LABEL.player} {formatSignedDelta(impact.own ?? 0)}
        </span>
      )}
      {opponent != null && (
        <span data-testid="beat-impact-opponent" className="text-xs">
          {SIDE_LABEL.opponent} {formatSignedDelta(opponent.own ?? 0)}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Story 85-3 (Tier B) — promoted-panel surfaces
// ═══════════════════════════════════════════════════════════

/**
 * Stakes banner (Cost Scales with Drama). Renders the session's active stakes
 * prominently at the top of confrontation mode; collapses on any falsy value
 * (no stakes set, or empty string normalized to None server-side).
 */
function StakesBanner({ stakes }: { stakes?: string }) {
  if (!stakes) return null;
  return (
    <div
      data-testid="confrontation-stakes-banner"
      className="mb-2 px-3 py-1.5 rounded-md border flex items-baseline gap-2"
      style={{ background: "oklch(0.21 0.008 80)", borderColor: "var(--accent-finisher)" }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-finisher)] flex-shrink-0">
        Stakes
      </span>
      <span className="font-serif italic text-[13px] text-foreground">{stakes}</span>
    </div>
  );
}

/**
 * THEM panel (ADR-116 — the dial has a face). Surfaces the opponent's portrait
 * + name + their last beat so the confrontation reads as *against someone*.
 * Picks the first `side === "opponent"` actor; renders nothing when there is no
 * opponent on the wire (legacy payload / pure-PvE dial with no seated Other).
 * Degrades cleanly when the opponent has no portrait (ActorChip falls back to
 * the name initial).
 */
function ThemPanel({ data }: { data: ConfrontationData }) {
  const opponent = data.actors.find((a) => a.side === "opponent");
  if (!opponent) return null;
  const lastBeat = data.opponent_last_beat_impact;
  return (
    <div
      data-testid="confrontation-them-panel"
      className="mb-2 px-3 py-1.5 rounded-md border flex items-center gap-2"
      style={{
        background: "oklch(0.21 0.008 80)",
        borderColor: "var(--encounter-opponent)",
      }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--encounter-opponent)] flex-shrink-0">
        Them
      </span>
      <ActorChip actor={opponent} />
      <span className="font-semibold text-[13px] text-foreground">
        {humanizeActorName(opponent.name)}
      </span>
      {opponent.role && (
        <span className="text-[11px] text-muted-foreground">{opponent.role}</span>
      )}
      {lastBeat && (
        <span
          data-testid="them-last-beat"
          className="text-[11px] italic text-muted-foreground ml-auto truncate"
        >
          {lastBeat.summary}
        </span>
      )}
    </div>
  );
}

/**
 * "Meanwhile at the table" strip (The Guitar Solo). Surfaces the non-soloing
 * players' concurrent verbs in the reclaimed space so a solo never becomes
 * silence. Collapses to nothing in solo play (no concurrent actions).
 */
function MeanwhileStrip({ actions }: { actions?: MeanwhileAction[] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div
      data-testid="confrontation-meanwhile-strip"
      className="mt-2 px-3 py-1.5 rounded-md border border-border/40 flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex-shrink-0">
        Meanwhile at the table
      </span>
      {actions.map((a, i) => (
        <span key={`${a.actor}-${i}`} className="text-[11px] text-foreground">
          <span className="font-semibold">{a.actor}</span>
          {a.role && <span className="text-muted-foreground"> ({a.role})</span>}
          {": "}
          <span className="italic">“{a.verb}”</span>
        </span>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════

/**
 * Confrontation panel — D2 tile-grid design.
 *
 * Story 85-3 (Tier B): renders inside the auto-focused `confrontation` dockview
 * panel (SPLIT layout alongside `narrative` — see GameBoard.tsx
 * renderWidgetContent). It was a bottom strip between the workspace and the
 * InputBar under the D2 mock; it is now a first-class panel. The InputBar stays
 * live alongside this panel (SPLIT, not takeover), so the player can still type
 * a free creative action (the chandelier swing). Beat tiles are the commit verbs
 * for the typed action: plain Enter is locked during an active confrontation
 * (InputBar `confrontationActive`), so a tile click commits the turn and carries
 * the InputBar draft with it. The ▾ chevron on each tile reserves the slot for
 * the upcoming expand-for-details feature.
 */
export function ConfrontationOverlay({
  data,
  meanwhileActions,
  onBeatSelect,
  diceRequest,
  diceResult,
  playerId,
  onDiceThrow,
  onYield,
  outcome,
}: ConfrontationOverlayProps) {
  // Track the committed beat so the anchored die (A3) reads as belonging to it
  // — beat → roll → result is one spatial unit. Declared before the early
  // return to keep hook order stable (rules of hooks).
  const [committedBeatId, setCommittedBeatId] = useState<string | null>(null);
  // Story 102-2: the "Work a Spell" tile defers its commit behind the
  // prepared-spell picker — a cast must name WHICH spell so the server can
  // route the WN cast spine instead of a generic stat throw.
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);
  const spellcasting = data?.spellcasting ?? null;
  // useCallback: ConfrontationOverlay re-renders on every WebSocket frame, and
  // this handler is handed to every beat button; a stable identity avoids
  // re-rendering the whole grid each frame (matches GameBoard's own wrapping).
  // Declared with useState above the early return to keep hook order stable.
  const handleBeatSelect = useCallback(
    (id: string) => {
      if (id === CAST_SPELL_BEAT_ID) {
        // 102-2: never commit a bare cast. Without the economy block there is
        // nothing to pick from — committing anyway would resurrect the exact
        // generic-INT-throw bug this story kills (No Silent Fallbacks). The
        // server's class_filter should never offer the tile to a non-caster,
        // so landing here means a stale/missing projection — refuse loudly.
        if (!spellcasting || spellcasting.prepared.length === 0) {
          console.warn(
            "[cast-spell] commit refused: no spellcasting projection on the " +
              "CONFRONTATION payload (or no prepared spells) — the picker has " +
              "nothing to offer, and a bare cast_spell commit is the pre-102-2 bug",
          );
          return;
        }
        setSpellPickerOpen(true);
        return;
      }
      setSpellPickerOpen(false);
      setCommittedBeatId(id);
      onBeatSelect?.(id);
    },
    [onBeatSelect, spellcasting],
  );
  // 102-2: picker selection — the only path that commits the cast beat.
  const handleSpellChoose = useCallback(
    (spellId: string) => {
      setSpellPickerOpen(false);
      setCommittedBeatId(CAST_SPELL_BEAT_ID);
      onBeatSelect?.(CAST_SPELL_BEAT_ID, spellId);
    },
    [onBeatSelect],
  );
  if (!data) return null;

  // Keep the optional chain: although `beats` is typed required, the server can
  // broadcast a confrontation before its beats materialize (wire payload with
  // `beats` undefined) — pinned by the "beatless confrontation" regression test.
  // Dropping `?.` here crashes that real production path.
  const committedBeat = data.beats?.find((b) => b.id === committedBeatId) ?? null;

  // Story 85-3: the root keeps the legacy bottom-strip tokens (`border-t`, tight
  // `pt-2 pb-1`) — they read acceptably inside the dockview panel; a full
  // panel-layout pass (fill height, scroll) is deferred follow-up.
  return (
    <div
      data-testid="confrontation-overlay"
      data-type={data.type}
      data-genre={data.genre_slug}
      className="confrontation-panel bg-card/60 border-t border-border/40 px-3 pt-2 pb-1"
    >
      {/* Story 85-3 (Tier B): stakes banner up top — the drama is legible, not
          implied (Cost Scales with Drama). Collapses when no stakes. */}
      <StakesBanner stakes={data.stakes} />

      <StatusLine data={data} />

      {/* Story 85-3 (Tier B): dedicated THEM panel — opponent portrait + name +
          their last beat, so the dial reads as *against someone* (ADR-116). */}
      <ThemPanel data={data} />

      {/*
       * Phase 5 (Story 47-3): branch-explicit outcome reveal.
       * D2 handoff (2026-05-13) re-anchors the reveal between the status
       * line and the beat grid so it reads as "what just resolved" sitting
       * above the next move-set rather than detached above the dial row.
       */}
      {outcome && <ConfrontationOutcomeReveal outcome={outcome} />}

      {/*
       * Story 73-4: beat-kind impact reveal in the same "what just resolved"
       * zone — explains a no-dial-move CritSuccess so it reads as intended.
       * Adjunct to the dial bars (which still render below), never a replacement.
       */}
      {/* Story 73-13: gate on EITHER side — the opponent-acts-first window has an
          opponent impact but no player impact yet, and must still surface the
          opponent "hit you" readout instead of suppressing the whole panel. */}
      {(data.last_beat_impact || data.opponent_last_beat_impact) && (
        <BeatImpactPanel
          impact={data.last_beat_impact}
          opponent={data.opponent_last_beat_impact}
        />
      )}

      {/* Story 85-1 (A5): beat-history ledger — the dial movement gets a legible
          cause (Δ per side) so the scoreboard isn't an unexplained jump.
          Story 73-13: same either-side gate as the impact panel above. */}
      {(data.last_beat_impact || data.opponent_last_beat_impact) && (
        <BeatHistoryLedger
          impact={data.last_beat_impact}
          opponent={data.opponent_last_beat_impact}
        />
      )}

      {/*
       * Commit row (Story 85-1) — STACKED: the beat grid on top, the die tray
       * anchored directly below the committed beat. This retired the old
       * side-by-side fixed 200px "persistent die lane" (Klinger design,
       * 2026-05-26) so beat → roll → result reads as one spatial unit. When the
       * dice tray isn't wired (no onDiceThrow/playerId, e.g. in isolation tests)
       * the beats reclaim the full width.
       */}
      <div className="flex flex-col gap-2">
        <div className="min-w-0">
          {/* a11y (Story 85-1): beats are the ONLY commit path — plain Enter is
              locked during an active confrontation. Announce that politely so a
              screen-reader user doesn't hit a silent dead-end on Enter. */}
          {(data.beats?.length ?? 0) > 0 && (
            <div aria-live="polite" className="sr-only">
              Pick a beat to commit.
            </div>
          )}

          <BeatGrid beats={data.beats ?? []} onSelect={handleBeatSelect} />

          {/* Story 102-2: prepared-spell picker — opened by the cast tile,
              commits onBeatSelect(cast_spell, spellId) on choice. Renders
              directly under the grid so beat → spell → roll reads as one
              spatial unit (same logic as the stacked die tray below). */}
          {spellPickerOpen && spellcasting && (
            <SpellPicker
              spellcasting={spellcasting}
              onChoose={handleSpellChoose}
              onCancel={() => setSpellPickerOpen(false)}
            />
          )}

          {/* Yield — only when the player has spent edge to refund. */}
          {onYield !== undefined &&
            data.player_metric.current > data.player_metric.starting && (
              <div className="mt-2">
                <YieldButton onYield={onYield} disabled={false} />
              </div>
            )}
        </div>

        {/* Story 85-1 (A3): die anchored to the committed beat. The roll lives
            in the beats' own column flow — beat → roll → result is one spatial
            unit — instead of floating in a detached fixed-width side lane (the
            old 200px void is retired). */}
        {onDiceThrow && playerId && (
          <div data-testid="beat-roll-anchor" className="min-w-0">
            {committedBeat && (
              <div className="mb-1 text-[11px] text-muted-foreground">
                ▸ {committedBeat.label}
              </div>
            )}
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

      {/* Story 85-3 (Tier B): "meanwhile at the table" — the non-soloing players'
          concurrent verbs live in the reclaimed space (The Guitar Solo). The
          reclaimed space is exactly why this panel earns the canvas; collapses
          in solo play. */}
      <MeanwhileStrip actions={meanwhileActions} />
    </div>
  );
}
