import { useRef, useState } from "react";
import type {
  FateCharacterEntry,
  FateDefendRequestPayload,
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
      <h2 style={{ fontFamily: FONT_DISPLAY }} className="text-lg">
        Conflict
      </h2>

      {/* Participants by side, in seating (turn) order. */}
      <ol data-testid="fate-conflict-order" className="flex flex-col gap-1">
        {conflict.participants.map((p) => (
          <li
            key={p.name}
            data-testid={`fate-conflict-participant-${p.name}`}
            data-side={p.side}
            className="flex items-baseline gap-2"
          >
            <span>{p.name}</span>
            <span style={{ color: FOLIO.inkSoft }}>({p.side})</span>
          </li>
        ))}
      </ol>

      {/* Story 126-17 (ADR-148/149): the DEFEND barrier. When the server parks the
          round on this PC's defense it broadcasts the committed attack; the player
          sees it (attacker / skill / total READ FROM THE PAYLOAD — 118-5 anti-drift,
          mechanics-first legibility) then throws their 4dF defense (reuse of the
          FateDiceTray thrower) or concedes (folds without rolling, Story 126-14).
          The tray is consumed once answered. */}
      {pendingDefend && (
        <div
          data-testid="fate-defend-tray"
          className="flex flex-col gap-2 p-2"
          style={{ borderLeft: `3px solid ${FOLIO.accent}`, paddingLeft: 10 }}
        >
          <span style={{ fontFamily: FONT_DISPLAY }} className="text-base">
            Defend! <strong>{pendingDefend.attacker}</strong> attacks with{" "}
            <strong>{pendingDefend.attack_skill}</strong> at total{" "}
            <strong>{pendingDefend.attack_total}</strong>
            {pendingDefend.mental ? " (mental)" : ""}
          </span>
          {/* The defense skill (free-pick): which skill the defender rolls to fend
              off the attack. Defaults to the first skill; the player can switch
              (e.g. Athletics to dodge vs Fight to parry). The chosen skill rides the
              FATE_THROW so the server resolves the defense at its rating — never the
              skill="" / rating-0 default that silently lost the bonus (playtest 150-2). */}
          {skills.length > 0 && (
            <select
              data-testid="fate-defend-skill-select"
              value={activeDefendSkill}
              disabled={sealedWaiting}
              onChange={(e) => setDefendSkill(e.target.value)}
            >
              {skills.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.ladder})
                </option>
              ))}
            </select>
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
          >
            Concede
          </button>
        </div>
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
        <div data-testid="fate-compel-rack" className="flex flex-col gap-2">
          {compels.map((c) => (
            <div
              key={c.aspect}
              className="flex flex-col gap-1"
              style={{ borderLeft: `2px solid ${FOLIO.accent}`, paddingLeft: 8 }}
            >
              <span>
                <strong>Compel — {c.aspect}:</strong> {c.reason}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid={`fate-compel-accept-${c.aspect}`}
                  disabled={sealedWaiting}
                  onClick={() => resolveCompel(c.aspect, "compel_accept")}
                >
                  Accept (+{c.offered_delta} FP)
                </button>
                <button
                  type="button"
                  data-testid={`fate-compel-refuse-${c.aspect}`}
                  disabled={sealedWaiting}
                  onClick={() => resolveCompel(c.aspect, "compel_refuse")}
                >
                  Refuse (−1 FP)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The local PC's invokable aspects — each Invoke gated on the economy. */}
      {me && (
        <div data-testid="fate-invoke-rack" className="flex flex-col gap-1">
          {me.aspects.map((a) => {
            const armed = pending?.aspect === a.text;
            return (
              <div key={a.text} className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`fate-invoke-${a.text}`}
                  data-armed={armed ? "true" : "false"}
                  disabled={sealedWaiting || !canInvoke(me, a.free_invokes)}
                  onClick={() => toggleInvoke(a.text)}
                >
                  Invoke
                </button>
                <span>{a.text}</span>
                {a.free_invokes > 0 && (
                  <span style={{ color: FOLIO.accent }}>({a.free_invokes} free)</span>
                )}
                {armed && (
                  <span data-testid="fate-invoke-mode" className="flex gap-1">
                    <button
                      type="button"
                      data-testid="fate-invoke-mode-bonus"
                      data-selected={pending?.mode === "bonus" ? "true" : "false"}
                      disabled={sealedWaiting}
                      onClick={() => setMode("bonus")}
                    >
                      +2
                    </button>
                    <button
                      type="button"
                      data-testid="fate-invoke-mode-reroll"
                      data-selected={pending?.mode === "reroll" ? "true" : "false"}
                      disabled={sealedWaiting}
                      onClick={() => setMode("reroll")}
                    >
                      Reroll
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Freeform flourish that rides the next tile as narrator color. */}
      <input
        data-testid="fate-freeform-input"
        value={freeform}
        placeholder="Describe your move (e.g. 'I swing from the chandelier and fire')"
        disabled={sealedWaiting}
        onChange={(e) => setFreeform(e.target.value)}
      />

      {/* Skill the action resolves on (server validates; client mirrors). */}
      {skills.length > 0 && (
        <select
          data-testid="fate-skill-select"
          value={activeSkill}
          disabled={sealedWaiting}
          onChange={(e) => setSkill(e.target.value)}
        >
          {skills.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.ladder})
            </option>
          ))}
        </select>
      )}

      {/* The Other an attack targets — opponent-side participants. Always present
          in a conflict (ADR-116: a confrontation requires an Other). */}
      {opponents.length > 0 && (
        <select
          data-testid="fate-target-select"
          value={activeTarget}
          disabled={sealedWaiting}
          onChange={(e) => setTarget(e.target.value)}
        >
          {opponents.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      {/* Proactive-action tiles + the Concede control. A roll verb ARMS the dF
          thrower (ADR-148) rather than dispatching synchronously; Concede stays a
          pre-roll FATE_ACTION. Disabled while a sealed round resolves OR while a
          throw is already armed (the player is mid-throw). */}
      <div className="flex gap-2">
        {PROACTIVE.map(({ verb, label }) => (
          <button
            key={verb}
            type="button"
            data-testid={`fate-action-${verb}`}
            disabled={sealedWaiting || armed !== null}
            onClick={() => armThrow(verb)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          data-testid="fate-action-concede"
          disabled={sealedWaiting || armed !== null}
          onClick={concede}
        >
          Concede
        </button>
      </div>

      {/* ADR-148 / Story 126-7: the dF thrower for an armed proactive roll. The
          player throws four Fudge dice; on settle the tray submits the FATE_THROW
          (the settled faces ARE the roll). Mounted only while armed. */}
      {armed && (
        <div data-testid="fate-throw-armed" className="flex flex-col gap-2">
          <FateDiceTray
            mode="thrower"
            action={armed.verb}
            skill={armed.skill}
            requestId={armed.request_id}
            target={armed.target ?? null}
            ruleset={ruleset}
            onThrow={onTrayThrow}
          />
          <button type="button" data-testid="fate-throw-cancel" onClick={cancelThrow}>
            Cancel
          </button>
        </div>
      )}

      {sealedWaiting && (
        <p data-testid="fate-sealed-hint" style={{ color: FOLIO.inkSoft }}>
          Committed — waiting for the round to resolve…
        </p>
      )}
    </div>
  );
}

export default FateConflictSurface;
