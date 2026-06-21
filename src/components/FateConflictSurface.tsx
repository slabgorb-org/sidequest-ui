import { useRef, useState } from "react";
import type {
  FateCharacterEntry,
  FateConflictParticipant,
  FateDefendRequestPayload,
  FateExchangeLine,
  FateRollPayload,
  FateStatePayload,
  FateThrowPayload,
} from "@/types/payloads";
import { FateDiceTray } from "@/dice/FateDiceTray";

/**
 * FateConflictSurface — the player-facing Fate conflict surface (ADR-144 F3f,
 * Story 118-6). The Fate ANALOG of ConfrontationOverlay: during an active Fate
 * Conflict it shows the live exchange (participants by side, in seating/turn
 * order, each PC's stress/consequence absorption) and hosts the player's
 * controls — the three proactive-action tiles (overcome / create_advantage /
 * attack), a pre-roll Concede, and the per-aspect Invoke affordance (F3d).
 *
 * It reuses the MOUNT PATTERN of ConfrontationOverlay, NOT its dial/beat
 * internals — Fate replaces those (ADR-143). The surface is ruleset=='fate'-gated
 * AND conflict-gated so it never co-renders with the WN/native overlay, mirroring
 * the FateDiceTray gate it composes.
 *
 * The economy is SERVER-AUTHORITATIVE (CLAUDE.md): the panel reflects FATE_STATE
 * and never optimistically decrements. An Invoke the player cannot pay for (no
 * free invocation AND zero fate points) is disabled, not offered-then-rejected.
 */

export type FateActionVerb =
  | "overcome"
  | "create_advantage"
  | "attack"
  | "concede"
  // ADR-144 F3e: the compel accept/refuse round-trip. Pre-roll, non-committing —
  // they resolve the narrator's offered compel, never seal onto the exchange.
  | "compel_accept"
  | "compel_refuse";

/** What a clicked tile dispatches — the client mirror of FateActionPayload. The
 *  server remains the validation + economy authority (No Silent Fallbacks). */
export interface FateActionInput {
  action: FateActionVerb;
  skill?: string;
  invoke_aspect?: string;
  invoke_mode?: "bonus" | "reroll";
  aspect_text?: string;
  player_action?: string;
  /** The opponent an `attack` targets. REQUIRED for attack — the server's
   *  `_resolve_attack` fails loud ("an attack must name a target") when it is
   *  absent. Omitted for overcome/create_advantage (passive opposition). */
  target?: string;
}

export interface FateConflictSurfaceProps {
  fateState: FateStatePayload | null;
  /** The latest resolved 4dF roll, surfaced via the composed FateDiceTray. */
  fateRoll: FateRollPayload | null;
  /** The active pack's ruleset — the surface renders only when this is "fate". */
  ruleset: string;
  /** The local PC's character name — drives whose sheet powers the Invoke economy. */
  actorName: string;
  /** True while a sealed round resolves: every action control is inert (the
   *  submit-and-wait barrier — never act mid-resolution). */
  sealedWaiting?: boolean;
  onFateAction?: (action: FateActionInput) => void;
  /** ADR-148 / Story 126-7: a proactive roll verb (overcome / create_advantage /
   *  attack) is physics-is-the-roll — clicking it mounts the dF thrower and defers
   *  the send until the dice settle, then submits a FATE_THROW carrying the four
   *  settled faces. The non-roll verbs (concede / compel_*) stay on onFateAction. */
  onFateThrow?: (payload: FateThrowPayload) => void;
  /** ADR-148/149 / Story 126-8/126-17: the latest DEFEND barrier request (mirror
   *  slice latestFateDefendRequest). When it targets the local PC (defender ===
   *  actorName) and is unanswered, a defend tray mounts: the player throws their
   *  4dF defense (a FATE_THROW(action='defend') via onFateThrow) or concedes
   *  (concede=true, no dice). Null when no defense is pending. */
  defendRequest?: FateDefendRequestPayload | null;
}

const FOLIO = {
  ink: "var(--card-foreground)",
  inkSoft: "var(--muted-foreground)",
  paper: "var(--card)",
  accent: "var(--accent)",
  rule: "var(--border)",
} as const;

const FONT_DISPLAY = "'Pirata One', serif";
const FONT_BODY = "'EB Garamond', serif";

// Control styling — native elements + design tokens, matching the sibling
// ConfrontationOverlay tile pattern (sq-playtest 2026-06-19: this surface shipped
// with bare unstyled controls — every button/select/input read as flat text, and
// Attack was visually identical to the give-up Concede). Native <button>/<select>/
// <input> keep their accessibility + the data-testids the tests key on; only
// presentation changes.
const SECTION_LABEL = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground";
const FIELD_CLS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:pointer-events-none";
const TILE_BASE =
  "inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
const TILE_PRIMARY = "border-transparent bg-primary text-primary-foreground hover:bg-primary/85";
const TILE_OUTLINE = "border-border bg-background hover:bg-muted hover:text-foreground";
const TILE_QUIET = "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground";
// Per-verb weight: Attack is the primary/destructive action, the two setup verbs
// are equal-weight outlines, and Concede (give up) is deliberately quiet so it can
// never be mistaken for the primary action (DRIVER: "Attack identical to Concede").
const VERB_WEIGHT: Record<RollVerb, string> = {
  overcome: TILE_OUTLINE,
  create_advantage: TILE_OUTLINE,
  attack: TILE_PRIMARY,
};
const CHIP =
  "text-xs px-2 py-0.5 rounded border transition-colors outline-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

/** A concede defend throw folds WITHOUT rolling, so it carries no dice — but the
 *  server's FateThrowPayload requires `throw_params` (no default) even on the
 *  concede path (which ignores it). Send a neutral zero-gesture to satisfy the
 *  required field (Story 126-14 / TEA delivery finding). */
const NEUTRAL_THROW_PARAMS = {
  velocity: [0, 0, 0],
  angular: [0, 0, 0],
  position: [0.5, 0.5],
} as const;

/** The three proactive ROLL verbs — physics-is-the-roll under ADR-148 (these mount
 *  the dF thrower); distinct from the non-roll FateActionVerb members. */
type RollVerb = "overcome" | "create_advantage" | "attack";

const PROACTIVE: { verb: RollVerb; label: string }[] = [
  { verb: "overcome", label: "Overcome" },
  { verb: "create_advantage", label: "Create Advantage" },
  { verb: "attack", label: "Attack" },
];

/** The armed throw context captured when a roll verb is clicked — held while the
 *  player throws the dF, then merged into the FATE_THROW on settle. */
interface ArmedThrow {
  verb: RollVerb;
  skill: string;
  target?: string;
  invoke_aspect?: string;
  invoke_mode?: "bonus" | "reroll";
  aspect_text?: string;
  player_action?: string;
  request_id: string;
}

/** Can this PC pay for an invocation of `aspect`? A free invocation on the aspect,
 *  or at least one fate point. Server-authoritative — the panel only reflects it. */
function canInvoke(me: FateCharacterEntry | null, freeInvokes: number): boolean {
  if (me === null) return false;
  return freeInvokes > 0 || me.fate_points > 0;
}

/** The ADR-143 win signal for an OPPONENT-side participant: USED absorption (checked
 *  stress boxes + filled consequences) over TOTAL capacity, reproducing the server's
 *  `fate_projection.conflict_opponent_progress` — read from the projected track, never
 *  the vestigial native tension dial. `pct` fills toward 100 as the Other takes harm;
 *  `atThreshold` means the next overflowing hit takes them out. Returns null when there
 *  is no meter to draw: a player-side actor (its full sheet rides in `characters`), or a
 *  sheetless opponent (capacity 0 — the #966 seated-without-a-sheet honest empty state).
 *  Reads `stress`/`consequences` as `?? {}`/`?? []` for pre-projection back-compat. */
function opponentProgress(
  p: FateConflictParticipant,
): { used: number; capacity: number; pct: number; atThreshold: boolean } | null {
  if (p.side !== "opponent") return null;
  let capacity = 0;
  let used = 0;
  for (const boxes of Object.values(p.stress ?? {})) {
    for (const b of boxes) {
      capacity += b.value;
      if (b.checked) used += b.value;
    }
  }
  for (const c of p.consequences ?? []) {
    capacity += c.value;
    if (c.filled) used += c.value;
  }
  if (capacity <= 0) return null;
  const pct = Math.max(0, Math.min(100, (used / capacity) * 100));
  return { used, capacity, pct, atThreshold: used >= capacity };
}

/** FATE-CONFLICT-SEQUENCE-OPAQUE (sq-playtest 2026-06-20): the resolution-ledger
 *  clause for one exchange line — everything UP TO the outcome, which the caller
 *  renders as a colored badge. Localizes "You"/"you" when an actor is the local PC,
 *  and conjugates the verb (2nd vs 3rd person) so "You attack" / "Queen attacks" both
 *  read naturally. NPC dice stay hidden (ADR-148); the derived TOTALS are shown. */
function exchangeClause(line: FateExchangeLine, me: string): string {
  const subjectIsMe = line.actor === me;
  const subject = subjectIsMe ? "You" : line.actor;
  const verb =
    line.action === "attack"
      ? subjectIsMe
        ? "attack"
        : "attacks"
      : line.action === "create_advantage"
        ? subjectIsMe
          ? "create an advantage"
          : "creates an advantage"
        : subjectIsMe
          ? "overcome"
          : "overcomes";
  const total = typeof line.actor_total === "number" ? ` ${line.actor_total}` : "";
  const skillClause = line.skill ? ` ${line.skill}${total}` : total;
  let clause = `${subject} ${verb}${skillClause}`;
  if (line.action === "attack" && line.target) {
    const defenderIsMe = line.target === me;
    const dtotal = typeof line.opposition_total === "number" ? ` ${line.opposition_total}` : "";
    const dskill = line.defense_skill ? ` ${line.defense_skill}` : "";
    clause += defenderIsMe
      ? ` → you defend${dskill}${dtotal}`
      : ` → ${line.target} defends${dskill}${dtotal}`;
  }
  return `${clause} →`;
}

/** A landed/landing hit reads in the destructive tint; a no-harm or positive result
 *  reads in the default ink. Keeps the outcome legible at a glance (mechanics-first). */
function outcomeTint(outcome: string | undefined): string | undefined {
  return outcome === "absorbed" || outcome === "taken_out"
    ? "var(--destructive)"
    : undefined;
}

export function FateConflictSurface({
  fateState,
  fateRoll,
  ruleset,
  actorName,
  sealedWaiting = false,
  onFateAction,
  onFateThrow,
  defendRequest = null,
}: FateConflictSurfaceProps) {
  const [freeform, setFreeform] = useState("");
  const [skill, setSkill] = useState("");
  // The defender's free-pick defense skill (server `dispatch_fate_defense` resolves
  // the defense at this skill's rating). Kept separate from the proactive `skill` so
  // a defense never inherits the last proactive selection. Empty → first-skill default.
  const [defendSkill, setDefendSkill] = useState("");
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState<{ aspect: string; mode: "bonus" | "reroll" } | null>(null);
  // ADR-148: the throw armed by a roll-verb click, mounting the dF thrower below.
  const [armed, setArmed] = useState<ArmedThrow | null>(null);
  // Story 126-17: the request_id of the defense the player has already answered.
  // The mirror slice keeps re-supplying the last request (it never clears), so we
  // dismiss the tray once answered and re-mount only when a NEW request arrives.
  const [answeredDefendId, setAnsweredDefendId] = useState<string | null>(null);
  const throwSeq = useRef(0);

  // The ruleset + conflict gates: never co-render with the WN/native overlay, and
  // show nothing outside an active conflict (the surface is conflict-scoped; the
  // always-on Fate SHEET is FatePanel's job).
  if (ruleset !== "fate") return null;
  const conflict = fateState?.conflict;
  if (!conflict?.active) return null;

  const me = fateState?.characters.find((c) => c.name === actorName) ?? null;
  const skills = me?.skills ?? [];
  // Story 126-29: the local PC's server-authoritative committed-this-exchange flag,
  // read straight off the conflict participant (FATE_STATE). Resume-safe — unlike the
  // transient `sealedWaiting` prop it survives a reconnect — so a resumed mid-exchange
  // conflict pre-disables the proactive tiles instead of offering an action the
  // server's sealed-commit guard (ADR-129/151) would reject. `?? false` because the
  // local PC may not be among the participants (e.g. a spectator) — never disable then.
  const committed = conflict.participants.find((p) => p.name === actorName)?.committed ?? false;
  const activeSkill = skill || skills[0]?.name || "";
  // Defense is free-pick (Athletics to dodge, Fight to parry, Will to resist, …);
  // default to the PC's first skill (same convention as the proactive selector) so
  // the throw never sends skill="" — which the server resolved at rating 0, silently
  // dropping the defender's skill bonus (playtest 150-2).
  const activeDefendSkill = defendSkill || skills[0]?.name || "";
  // The Other an attack must name (ADR-116 / server _resolve_attack fails loud on a
  // null target). Default to the sole/first opponent-side participant; a picker is
  // offered when there are several. Overcome/create_advantage are passive — no target.
  const opponents = conflict.participants.filter((p) => p.side === "opponent");
  const activeTarget = target || opponents[0]?.name || "";
  // ADR-144 F3e: the narrator's offered compels awaiting accept/refuse. The
  // server is the economy authority; the panel only reflects FATE_STATE.
  const compels = conflict.pending_compels ?? [];
  // FATE-CONFLICT-SEQUENCE-OPAQUE (sq-playtest 2026-06-20): the most recent exchange's
  // per-action resolution ledger — the legible attack/defend math, server-authored
  // (never narrator-improvised). `?? []` for back-compat (ProtocolBase drops empty
  // lists from the wire). Most-recent action first.
  const lastExchange = conflict.last_exchange ?? [];

  // spec 2026-06-17 §2: Attack is a Conflict-only action. A Contest has no stress/
  // consequences, and the server rejects an attack in one loudly (fate_dispatch_error).
  // Gate the rack by encounter kind so a Contest exposes only Overcome + Create
  // Advantage (Concede sits apart, always available) — never a verb the engine will
  // always reject and waste the player's 4dF throw on.
  const proactiveVerbs = conflict.is_contest
    ? PROACTIVE.filter(({ verb }) => verb !== "attack")
    : PROACTIVE;

  // Story 126-17 (ADR-148/149): the pending DEFEND barrier for THIS PC. The
  // server broadcasts one request per attacked PC and the client filters by
  // defender (the request can name any seated PC). Suppressed once answered.
  const pendingDefend =
    defendRequest &&
    defendRequest.defender === actorName &&
    defendRequest.request_id !== answeredDefendId
      ? defendRequest
      : null;

  // ADR-148 / Story 126-7: a roll verb no longer dispatches synchronously — it ARMS
  // a throw and mounts the dF tray. The four faces the player settles ARE the roll;
  // the send is deferred to ``onTrayThrow`` (below). The invoke/freeform context is
  // captured here so it survives the throw and rides the FATE_THROW.
  function armThrow(verb: RollVerb) {
    const rider = freeform.trim();
    setArmed({
      verb,
      skill: activeSkill,
      // An attack MUST name its target (the server's _resolve_attack rejects a null
      // target loudly); overcome/create_advantage resolve against passive opposition.
      target: verb === "attack" ? activeTarget : undefined,
      // The armed invoke (if any) rides the throw — the F3d affordance. mode is
      // 'bonus' (+2) or 'reroll'; under determinism a reroll means the client re-throws
      // (the server does the fate-point accounting only — ADR-148 §5).
      invoke_aspect: pending?.aspect,
      invoke_mode: pending ? pending.mode : undefined,
      aspect_text: verb === "create_advantage" && rider ? rider : undefined,
      player_action: rider || undefined,
      request_id: `fate-throw-${throwSeq.current++}`,
    });
  }

  // Called by the dF thrower on settle: the tray supplies action / skill / target /
  // request_id / throw_params / face; merge the armed invoke + freeform (which the
  // tray does not carry) and emit the FATE_THROW.
  function onTrayThrow(thrown: FateThrowPayload) {
    onFateThrow?.({
      ...thrown,
      ...(armed?.invoke_aspect
        ? { invoke_aspect: armed.invoke_aspect, invoke_mode: armed.invoke_mode }
        : {}),
      ...(armed?.aspect_text ? { aspect_text: armed.aspect_text } : {}),
      ...(armed?.player_action ? { player_action: armed.player_action } : {}),
    });
    setArmed(null);
    setFreeform("");
    setPending(null);
  }

  function cancelThrow() {
    setArmed(null);
  }

  // Story 126-17: the player threw their defense. The tray already built a
  // FateThrowPayload with action='defend', the echoed request_id, throw_params,
  // and the four settled faces (physics-is-the-roll) — forward it untouched and
  // consume by the THROWN request_id (the authoritative echoed id the tray was
  // mounted for), not by a re-read of pendingDefend. Equivalent today (requestId
  // is wired to pendingDefend.request_id), but robust if a future change ever
  // decouples them — and it consumes unconditionally (Reviewer rework #2).
  function onDefendThrow(thrown: FateThrowPayload) {
    onFateThrow?.(thrown);
    setAnsweredDefendId(thrown.request_id);
  }

  // Story 126-14: the player CONCEDES this attack — fold without rolling. Send a
  // defend throw carrying concede=true and NO dice (a neutral throw_params only,
  // which the server requires but ignores on the concede path), then consume.
  function concedeDefend() {
    if (!pendingDefend) return;
    onFateThrow?.({
      request_id: pendingDefend.request_id,
      action: "defend",
      concede: true,
      throw_params: {
        velocity: [...NEUTRAL_THROW_PARAMS.velocity] as [number, number, number],
        angular: [...NEUTRAL_THROW_PARAMS.angular] as [number, number, number],
        position: [...NEUTRAL_THROW_PARAMS.position] as [number, number],
      },
    });
    setAnsweredDefendId(pendingDefend.request_id);
  }

  function concede() {
    // Concede is pre-roll and rider-less (Story 118-6 AC#3): it carries no freeform
    // flavor (the server ignores player_action on a concession; keeping it off the
    // wire keeps the surface honest to that decision).
    onFateAction?.({ action: "concede" });
    setFreeform("");
    setPending(null);
  }

  function resolveCompel(aspect: string, verb: "compel_accept" | "compel_refuse") {
    // Pre-roll, non-committing: name the compelled aspect so the server resolves
    // the right pending compel. The economy (+1 accept / -1 refuse) is server-side.
    onFateAction?.({ action: verb, aspect_text: aspect });
  }

  function toggleInvoke(aspect: string) {
    setPending((cur) => (cur?.aspect === aspect ? null : { aspect, mode: "bonus" }));
  }

  function setMode(mode: "bonus" | "reroll") {
    setPending((cur) => (cur ? { ...cur, mode } : cur));
  }

  return (
    <div
      data-testid="fate-conflict-surface"
      style={{ color: FOLIO.ink, background: FOLIO.paper, fontFamily: FONT_BODY }}
      className="flex flex-col gap-3 p-3"
    >
      {/* Header — title + the live Fate-point economy. Mechanics-first legibility
          (Sebastien/Jade): the player can always see what they have to spend on an
          Invoke, so a disabled Invoke reads as "you're out", not "it's broken". */}
      <div className="flex items-baseline justify-between gap-2">
        <h2 style={{ fontFamily: FONT_DISPLAY }} className="text-lg">
          Conflict
        </h2>
        {me && (
          <span
            data-testid="fate-conflict-fate-points"
            className="rounded-md border border-border px-2 py-0.5 text-sm whitespace-nowrap"
            title="Fate points available to spend on Invoke"
          >
            Fate Points <strong className="tabular-nums">{me.fate_points}</strong>
            <span className="text-muted-foreground"> · Refresh {me.refresh}</span>
          </span>
        )}
      </div>

      {/* Participants by side, in seating (turn) order. A side dot + badge so the
          player can tell their crew from the Other at a glance. */}
      <section className="flex flex-col gap-1">
        <div className={SECTION_LABEL}>Participants</div>
        <ol data-testid="fate-conflict-order" className="flex flex-col gap-1">
          {conflict.participants.map((p) => (
            <li
              key={p.name}
              data-testid={`fate-conflict-participant-${p.name}`}
              data-side={p.side}
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden
                className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  p.side === "opponent" ? "bg-destructive" : "bg-primary"
                }`}
              />
              <span className="flex-1">{p.name}</span>
              <span
                className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${
                  p.side === "opponent"
                    ? "border-destructive/40 text-destructive"
                    : "border-border text-muted-foreground"
                }`}
              >
                {p.side}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* You — the local PC's stress + consequences, the same server-authoritative
          data FatePanel renders (the player sees their own absorption mid-exchange).
          The OPPONENT's track + the taken-out win-meter follow in their own section
          below, now that the server projects them onto conflict.participants[opponent]
          (Story 126-31). */}
      {me &&
        (Object.values(me.stress ?? {}).some((boxes) => boxes.length > 0) ||
          (me.consequences ?? []).length > 0) && (
          <section data-testid="fate-conflict-self-track" className="flex flex-col gap-1">
            <div className={SECTION_LABEL}>You — {me.name}</div>
            {Object.entries(me.stress ?? {})
              .filter(([, boxes]) => boxes.length > 0)
              .map(([track, boxes]) => (
                <div key={track} className="flex items-center gap-1.5">
                  <span className="text-xs capitalize text-muted-foreground w-16 flex-shrink-0">
                    {track}
                  </span>
                  {boxes.map((b, i) => (
                    <span
                      key={`${track}-${i}`}
                      data-testid="fate-conflict-stress-box"
                      data-checked={b.checked ? "true" : "false"}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded border text-xs tabular-nums ${
                        b.checked
                          ? "bg-primary text-primary-foreground border-transparent"
                          : "border-border text-foreground"
                      }`}
                    >
                      {b.value}
                    </span>
                  ))}
                </div>
              ))}
            {(me.consequences ?? []).map((c) => (
              <div
                key={c.level}
                data-testid="fate-conflict-consequence"
                data-filled={c.filled ? "true" : "false"}
                className={`text-xs ${c.filled ? "text-foreground" : "text-muted-foreground"}`}
              >
                <span className="capitalize">{c.level}</span> ({c.value})
                {c.filled ? `: ${c.text}` : " — open"}
              </div>
            ))}
          </section>
        )}

      {/* The Other(s) — each opponent-side participant's projected stress/consequence
          track + a taken-out win-meter. Per ADR-143 the win signal is the opponent's
          stress+consequence fill toward taken-out (read from FATE_STATE.conflict, NOT
          the vestigial native tension dial). The meter MIRRORS ConfrontationOverlay's
          EdgeBar — fill % + at-threshold flash + the legible used/capacity numerator
          (Sebastien/Jade mechanics-first legibility). A sheetless opponent (capacity 0)
          draws nothing — the honest empty state, not a 0/0 bar implying false engagement. */}
      {opponents.map((o) => {
        const progress = opponentProgress(o);
        if (progress === null) return null;
        return (
          <section
            key={o.name}
            data-testid="fate-conflict-opponent-track"
            data-opponent={o.name}
            className="flex flex-col gap-1"
          >
            <div className={SECTION_LABEL}>{o.name}</div>
            {/* Taken-out win-meter (mirrors EdgeBar): fills toward 100% as the Other
                absorbs harm; flashes at threshold (next overflow takes them out). */}
            <div
              data-testid="fate-conflict-win-meter"
              data-opponent={o.name}
              data-at-threshold={progress.atThreshold ? "true" : undefined}
              className="flex items-center gap-1.5"
            >
              <span
                className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground flex-shrink-0"
                aria-label={`${o.name} taken-out progress`}
              >
                Taken out
              </span>
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden min-w-[24px]">
                <div
                  data-testid="fate-conflict-win-meter-fill"
                  className={`h-full transition-all duration-300 motion-reduce:transition-none ${
                    progress.atThreshold ? "animate-pulse motion-reduce:animate-none" : ""
                  }`}
                  style={{
                    width: `${progress.pct}%`,
                    background: "var(--destructive)",
                    boxShadow: progress.atThreshold ? "0 0 8px var(--destructive)" : undefined,
                  }}
                />
              </div>
              <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                {progress.used}/{progress.capacity}
                <span className="sr-only"> absorption used</span>
              </span>
            </div>
            {/* The Other's stress boxes per track (filled = absorbed harm). */}
            {Object.entries(o.stress ?? {})
              .filter(([, boxes]) => boxes.length > 0)
              .map(([track, boxes]) => (
                <div key={track} className="flex items-center gap-1.5">
                  <span className="text-xs capitalize text-muted-foreground w-16 flex-shrink-0">
                    {track}
                  </span>
                  {boxes.map((b, i) => (
                    <span
                      key={`${track}-${i}`}
                      data-testid="fate-conflict-opponent-stress-box"
                      data-checked={b.checked ? "true" : "false"}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded border text-xs tabular-nums ${
                        b.checked
                          ? "bg-destructive text-destructive-foreground border-transparent"
                          : "border-border text-foreground"
                      }`}
                    >
                      {b.value}
                    </span>
                  ))}
                </div>
              ))}
            {/* The Other's consequences (filled ones carry their invokable text). */}
            {(o.consequences ?? []).map((c) => (
              <div
                key={c.level}
                data-testid="fate-conflict-opponent-consequence"
                data-filled={c.filled ? "true" : "false"}
                className={`text-xs ${c.filled ? "text-foreground" : "text-muted-foreground"}`}
              >
                <span className="capitalize">{c.level}</span> ({c.value})
                {c.filled ? `: ${c.text}` : " — open"}
              </div>
            ))}
          </section>
        );
      })}

      {/* FATE-CONFLICT-SEQUENCE-OPAQUE (sq-playtest 2026-06-20, Keith-flagged): the
          per-exchange resolution ledger. Before this, an attack→defend exchange
          "silently returned to my turn" — the only feedback was narrator prose, which
          could omit or improvise the math. Now the server projects the derived
          attacker/defender totals + outcome (NPC dice stay hidden per ADR-148; the
          TOTALS do not), and we render them deterministically. Mechanics-first
          legibility (Sebastien/Jade): the result is engine-sourced, not the lie. */}
      {lastExchange.length > 0 && (
        <section data-testid="fate-last-exchange" className="flex flex-col gap-1">
          <div className={SECTION_LABEL}>Last Exchange</div>
          <ul className="flex flex-col gap-1 text-sm leading-snug">
            {lastExchange.map((line, i) => (
              <li
                key={`${line.actor}-${line.action}-${i}`}
                data-testid="fate-last-exchange-line"
                data-actor={line.actor}
                data-outcome={line.outcome}
                className="flex flex-wrap items-baseline gap-x-1 tabular-nums"
              >
                <span>{exchangeClause(line, actorName)}</span>
                {line.detail && (
                  <span className="font-semibold" style={{ color: outcomeTint(line.outcome) }}>
                    {line.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Story 126-17 (ADR-148/149): the DEFEND barrier. When the server parks the
          round on this PC's defense it broadcasts the committed attack; the player
          sees it (attacker / skill / total READ FROM THE PAYLOAD — 118-5 anti-drift,
          mechanics-first legibility) then throws their 4dF defense (reuse of the
          FateDiceTray thrower) or concedes (folds without rolling, Story 126-14).
          The tray is consumed once answered. */}
      {pendingDefend && (
        <section
          data-testid="fate-defend-tray"
          className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2"
        >
          <span style={{ fontFamily: FONT_DISPLAY }} className="text-base">
            Defend! <strong>{pendingDefend.attacker}</strong> attacks with{" "}
            <strong>{pendingDefend.attack_skill}</strong> at total{" "}
            <strong className="tabular-nums">{pendingDefend.attack_total}</strong>
            {pendingDefend.mental ? " (mental)" : ""}
          </span>
          {/* The defense skill (free-pick): which skill the defender rolls to fend
              off the attack. Defaults to the first skill; the player can switch
              (e.g. Athletics to dodge vs Fight to parry). The chosen skill rides the
              FATE_THROW so the server resolves the defense at its rating — never the
              skill="" / rating-0 default that silently lost the bonus (playtest 150-2). */}
          {skills.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className={SECTION_LABEL}>Defend with</span>
              <select
                data-testid="fate-defend-skill-select"
                value={activeDefendSkill}
                disabled={sealedWaiting}
                onChange={(e) => setDefendSkill(e.target.value)}
                className={FIELD_CLS}
              >
                {skills.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.ladder})
                  </option>
                ))}
              </select>
            </label>
          )}
          <FateDiceTray
            mode="thrower"
            action="defend"
            skill={activeDefendSkill}
            requestId={pendingDefend.request_id}
            ruleset={ruleset}
            onThrow={onDefendThrow}
          />
          <button
            type="button"
            data-testid="fate-defend-concede"
            disabled={sealedWaiting}
            onClick={concedeDefend}
            className={`${TILE_BASE} ${TILE_QUIET} self-start`}
          >
            Concede
          </button>
        </section>
      )}

      {/* The 4dF roll (composed FateDiceTray, fate-gated in its own right). */}
      {fateRoll && <FateDiceTray roll={fateRoll} ruleset={ruleset} />}

      {/* ADR-144 F3e: the narrator's offered compels. Each is a decision gate —
          Accept earns a fate point and takes the complication; Refuse pays one to
          decline (SRD). The Accept delta is the server-sent `offered_delta` (a real
          datum, not a hardcoded literal that could drift from the SRD); the Refuse
          cost is the SRD-fixed −1 constant. Both shown on the control (mechanics-first
          legibility). Disabled while a sealed round resolves. */}
      {compels.length > 0 && (
        <section data-testid="fate-compel-rack" className="flex flex-col gap-2">
          <div className={SECTION_LABEL}>Compels</div>
          {compels.map((c) => (
            <div
              key={c.aspect}
              className="flex flex-col gap-1 rounded-md border border-accent/40 bg-accent/5 p-2"
            >
              <span className="text-sm">
                <strong>Compel — {c.aspect}:</strong> {c.reason}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid={`fate-compel-accept-${c.aspect}`}
                  disabled={sealedWaiting}
                  onClick={() => resolveCompel(c.aspect, "compel_accept")}
                  className={`${TILE_BASE} ${TILE_PRIMARY}`}
                >
                  Accept (+{c.offered_delta} FP)
                </button>
                <button
                  type="button"
                  data-testid={`fate-compel-refuse-${c.aspect}`}
                  disabled={sealedWaiting}
                  onClick={() => resolveCompel(c.aspect, "compel_refuse")}
                  className={`${TILE_BASE} ${TILE_OUTLINE}`}
                >
                  Refuse (−1 FP)
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* The local PC's invokable aspects — each Invoke gated on the economy. */}
      {me && me.aspects.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className={SECTION_LABEL}>Aspects</div>
          <div data-testid="fate-invoke-rack" className="flex flex-col gap-1.5">
            {me.aspects.map((a) => {
              const armed = pending?.aspect === a.text;
              return (
                <div key={a.text} className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    data-testid={`fate-invoke-${a.text}`}
                    data-armed={armed ? "true" : "false"}
                    disabled={sealedWaiting || !canInvoke(me, a.free_invokes)}
                    onClick={() => toggleInvoke(a.text)}
                    title={
                      a.free_invokes > 0
                        ? `${a.free_invokes} free invoke(s)`
                        : "Spends 1 Fate Point"
                    }
                    className={`${CHIP} ${
                      armed
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {a.free_invokes > 0 ? "Invoke (free)" : "Invoke (1 FP)"}
                  </button>
                  <span className="text-sm flex-1">{a.text}</span>
                  {a.free_invokes > 0 && (
                    <span style={{ color: FOLIO.accent }} className="text-xs">
                      ({a.free_invokes} free)
                    </span>
                  )}
                  {armed && (
                    <span data-testid="fate-invoke-mode" className="flex gap-1">
                      <button
                        type="button"
                        data-testid="fate-invoke-mode-bonus"
                        data-selected={pending?.mode === "bonus" ? "true" : "false"}
                        disabled={sealedWaiting}
                        onClick={() => setMode("bonus")}
                        className={`${CHIP} ${
                          pending?.mode === "bonus"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        +2
                      </button>
                      <button
                        type="button"
                        data-testid="fate-invoke-mode-reroll"
                        data-selected={pending?.mode === "reroll" ? "true" : "false"}
                        disabled={sealedWaiting}
                        onClick={() => setMode("reroll")}
                        className={`${CHIP} ${
                          pending?.mode === "reroll"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        Reroll
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Your move — describe (optional flourish) → pick skill → pick the Other →
          act. A roll verb ARMS the dF thrower (ADR-148) rather than dispatching
          synchronously; Concede stays a pre-roll FATE_ACTION. Controls are dead while
          a sealed round resolves OR while a throw is already armed (mid-throw). */}
      <section className="flex flex-col gap-2">
        <div className={SECTION_LABEL}>Your Move</div>

        {/* Freeform flourish that rides the next tile as narrator color. */}
        <input
          data-testid="fate-freeform-input"
          value={freeform}
          placeholder="Describe your move (e.g. 'I swing from the chandelier and fire')"
          disabled={sealedWaiting}
          onChange={(e) => setFreeform(e.target.value)}
          className={FIELD_CLS}
        />

        <div className="flex flex-wrap gap-2">
          {/* Skill the action resolves on (server validates; client mirrors). */}
          {skills.length > 0 && (
            <label className="flex flex-1 flex-col gap-1 min-w-[8rem]">
              <span className={SECTION_LABEL}>Skill</span>
              <select
                data-testid="fate-skill-select"
                value={activeSkill}
                disabled={sealedWaiting}
                onChange={(e) => setSkill(e.target.value)}
                className={FIELD_CLS}
              >
                {skills.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.ladder})
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* The Other an attack targets — opponent-side participants. Always present
              in a conflict (ADR-116: a confrontation requires an Other). */}
          {opponents.length > 0 && (
            <label className="flex flex-1 flex-col gap-1 min-w-[8rem]">
              <span className={SECTION_LABEL}>Target</span>
              <select
                data-testid="fate-target-select"
                value={activeTarget}
                disabled={sealedWaiting}
                onChange={(e) => setTarget(e.target.value)}
                className={FIELD_CLS}
              >
                {opponents.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {proactiveVerbs.map(({ verb, label }) => (
            <button
              key={verb}
              type="button"
              data-testid={`fate-action-${verb}`}
              disabled={sealedWaiting || armed !== null || committed}
              onClick={() => armThrow(verb)}
              className={`${TILE_BASE} ${VERB_WEIGHT[verb]}`}
            >
              {label}
            </button>
          ))}
          {/* Concede sits apart and reads quiet so it can never be mistaken for the
              primary Attack (DRIVER: the two were visually identical). */}
          <button
            type="button"
            data-testid="fate-action-concede"
            disabled={sealedWaiting || armed !== null || committed}
            onClick={concede}
            className={`${TILE_BASE} ${TILE_QUIET} ml-auto`}
          >
            Concede
          </button>
        </div>
      </section>

      {/* ADR-148 / Story 126-7: the dF thrower for an armed proactive roll. The
          player throws four Fudge dice; on settle the tray submits the FATE_THROW
          (the settled faces ARE the roll). Mounted only while armed. */}
      {armed && (
        <div
          data-testid="fate-throw-armed"
          className="flex flex-col gap-2 rounded-md border border-accent/40 p-2"
        >
          <FateDiceTray
            mode="thrower"
            action={armed.verb}
            skill={armed.skill}
            requestId={armed.request_id}
            target={armed.target ?? null}
            ruleset={ruleset}
            onThrow={onTrayThrow}
          />
          <button
            type="button"
            data-testid="fate-throw-cancel"
            onClick={cancelThrow}
            className={`${TILE_BASE} ${TILE_QUIET} self-start`}
          >
            Cancel
          </button>
        </div>
      )}

      {(sealedWaiting || committed) && (
        <p
          data-testid="fate-sealed-hint"
          className="text-sm italic text-muted-foreground"
        >
          Committed — waiting for the round to resolve…
        </p>
      )}
    </div>
  );
}

export default FateConflictSurface;
