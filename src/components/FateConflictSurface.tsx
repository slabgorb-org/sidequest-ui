import { useState } from "react";
import type {
  FateCharacterEntry,
  FateRollPayload,
  FateStatePayload,
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

export type FateActionVerb = "overcome" | "create_advantage" | "attack" | "concede";

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

const PROACTIVE: { verb: Exclude<FateActionVerb, "concede">; label: string }[] = [
  { verb: "overcome", label: "Overcome" },
  { verb: "create_advantage", label: "Create Advantage" },
  { verb: "attack", label: "Attack" },
];

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
}: FateConflictSurfaceProps) {
  const [freeform, setFreeform] = useState("");
  const [skill, setSkill] = useState("");
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState<{ aspect: string; mode: "bonus" | "reroll" } | null>(null);

  // The ruleset + conflict gates: never co-render with the WN/native overlay, and
  // show nothing outside an active conflict (the surface is conflict-scoped; the
  // always-on Fate SHEET is FatePanel's job).
  if (ruleset !== "fate") return null;
  const conflict = fateState?.conflict;
  if (!conflict?.active) return null;

  const me = fateState?.characters.find((c) => c.name === actorName) ?? null;
  const skills = me?.skills ?? [];
  const activeSkill = skill || skills[0]?.name || "";
  // The Other an attack must name (ADR-116 / server _resolve_attack fails loud on a
  // null target). Default to the sole/first opponent-side participant; a picker is
  // offered when there are several. Overcome/create_advantage are passive — no target.
  const opponents = conflict.participants.filter((p) => p.side === "opponent");
  const activeTarget = target || opponents[0]?.name || "";

  function dispatch(verb: Exclude<FateActionVerb, "concede">) {
    onFateAction?.({
      action: verb,
      skill: activeSkill,
      player_action: freeform.trim(),
      // An attack MUST name its target (the server's _resolve_attack rejects a null
      // target loudly); overcome/create_advantage resolve against passive opposition
      // and carry no opponent target.
      ...(verb === "attack" ? { target: activeTarget } : {}),
      // The armed invoke (if any) rides the action — the F3d affordance. mode is
      // 'bonus' (+2) or 'reroll'; both are server-authoritative now (Story 118-6
      // AC#1 made reroll real, so offering it is not Illusionism).
      ...(pending
        ? { invoke_aspect: pending.aspect, invoke_mode: pending.mode }
        : {}),
      ...(verb === "create_advantage" && freeform.trim()
        ? { aspect_text: freeform.trim() }
        : {}),
    });
    setFreeform("");
    setPending(null);
  }

  function concede() {
    // Concede is pre-roll and rider-less (Story 118-6 AC#3): it carries no freeform
    // flavor (the server ignores player_action on a concession; keeping it off the
    // wire keeps the surface honest to that decision).
    onFateAction?.({ action: "concede" });
    setFreeform("");
    setPending(null);
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

      {/* The 4dF roll (composed FateDiceTray, fate-gated in its own right). */}
      {fateRoll && <FateDiceTray roll={fateRoll} ruleset={ruleset} />}

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

      {/* Proactive-action tiles + the Concede control. */}
      <div className="flex gap-2">
        {PROACTIVE.map(({ verb, label }) => (
          <button
            key={verb}
            type="button"
            data-testid={`fate-action-${verb}`}
            disabled={sealedWaiting}
            onClick={() => dispatch(verb)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          data-testid="fate-action-concede"
          disabled={sealedWaiting}
          onClick={concede}
        >
          Concede
        </button>
      </div>

      {sealedWaiting && (
        <p data-testid="fate-sealed-hint" style={{ color: FOLIO.inkSoft }}>
          Committed — waiting for the round to resolve…
        </p>
      )}
    </div>
  );
}

export default FateConflictSurface;
