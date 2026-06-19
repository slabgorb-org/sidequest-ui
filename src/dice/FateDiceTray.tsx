/**
 * FateDiceTray — the player-facing 4dF roll surface (ADR-144 F3c, Story 118-3).
 *
 * Two modes:
 *
 * - **spectator** (default): a real 3D Fudge die replays the server's resolved
 *   FATE_ROLL (Story 125-4 / ADR-144 F3g) — four `dF` dice tumble from the wire
 *   `throw_params + seed` and the legible readout (faces, shift, ladder, tier,
 *   succeed-with-style) sits beneath them (the legibility mandate, Sebastien/Jade).
 *
 * - **thrower** (ADR-148, Story 126-7): the rolling player THROWS the four dF
 *   interactively (physics-is-the-roll). The faces they settle on ARE the roll —
 *   on settle the tray submits them as a FATE_THROW payload. Mirrors the d20
 *   `DiceOverlay.handleSettle → onThrow(wireParams, faces)` capture path.
 *
 * Ruleset-gated: this surface renders ONLY on a Fate pack so it never co-renders
 * with the WN/native ConfrontationOverlay. A non-fate ruleset renders nothing.
 */

import { useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  DiceScene,
  DEFAULT_DICE_THEME,
  replayThrowParams,
  D6_RADIUS,
  type ThrowParams,
} from "@local/dice-lib";
import type { FateRollPayload, FateThrowPayload } from "@/types/payloads";

/** Spectator mode: replay a resolved FATE_ROLL (the 125-4 path, unchanged). */
export interface FateDiceTraySpectatorProps {
  mode?: "spectator";
  roll: FateRollPayload;
  /** The active pack's ruleset — the tray renders only when this is "fate". */
  ruleset: string;
  /** Genre slug, reserved for per-genre dice theming (parity with InlineDiceTray). */
  genreSlug?: string;
}

/** Thrower mode: the player physically throws their proactive Fate roll OR their
 *  DEFENSE (ADR-148/149, Story 126-8/126-17 — a defend throw is physics-is-the-roll
 *  exactly like a proactive verb). */
export interface FateDiceTrayThrowerProps {
  mode: "thrower";
  action: "overcome" | "create_advantage" | "attack" | "defend";
  skill: string;
  requestId: string;
  target?: string | null;
  difficulty?: number;
  ruleset: string;
  genreSlug?: string;
  /** Called on settle with the FATE_THROW payload (the four settled faces ARE
   * the roll). The App send path forwards it as a FATE_THROW message. */
  onThrow: (payload: FateThrowPayload) => void;
}

export type FateDiceTrayProps = FateDiceTraySpectatorProps | FateDiceTrayThrowerProps;

/** The Fudge glyph for a single face value. */
function faceGlyph(value: number): string {
  if (value > 0) return "+";
  if (value < 0) return "−";
  return "0";
}

function formatShift(shifts: number): string {
  return shifts >= 0 ? `+${shifts}` : `${shifts}`;
}

export function FateDiceTray(props: FateDiceTrayProps) {
  // The fate-ruleset gate: never co-render with the WN/native overlay.
  if (props.ruleset !== "fate") return null;
  if (props.mode === "thrower") return <FateThrowerTray {...props} />;
  return <FateSpectatorTray {...props} />;
}

function FateSpectatorTray({ roll }: FateDiceTraySpectatorProps) {
  // Replay the server's roll as a 3D tumble (Story 125-4 / ADR-144 F3g): convert
  // the wire gesture + seed into scene-space ThrowParams exactly as InlineDiceTray
  // does for DICE_RESULT (dF is a d6 cube → D6_RADIUS). The seed both drives the
  // dice' initial rotation AND keys the re-throw, so a new roll re-animates.
  const throwParams = replayThrowParams(roll.throw_params, roll.seed, D6_RADIUS);

  return (
    <div data-testid="fate-dice-tray" className="flex flex-col">
      {/* Four dF dice tumble to replay the roll. throwParams + rollKey come from
          the roll's throw_params/seed (mirroring DICE_RESULT); the legible text
          readout below stays authoritative regardless of the 3D flourish. */}
      <div data-testid="fate-dice-frame" style={{ position: "relative", height: 200 }}>
        <Canvas
          camera={{ position: [0, 2.3, 0], rotation: [-Math.PI / 2, 0, 0], up: [0, 0, -1], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          style={{ pointerEvents: "none", background: "transparent" }}
        >
          <DiceScene
            kind="dF"
            count={4}
            throwParams={throwParams}
            rollKey={roll.seed}
            onThrow={() => {}}
            onAllSettle={() => {}}
            theme={DEFAULT_DICE_THEME}
          />
        </Canvas>
      </div>

      {/* The legible readout — visible regardless of the 3D render. */}
      <div className="flex items-baseline gap-3">
        <span data-testid="fate-roll-faces">
          {roll.dice.map(faceGlyph).join(" ")}
        </span>
        <span data-testid="fate-roll-shift">{formatShift(roll.shifts)} shifts</span>
        <span data-testid="fate-roll-ladder">{roll.ladder_name}</span>
        <span data-testid="fate-roll-tier">{roll.tier}</span>
        {roll.succeeded_with_style && (
          <span data-testid="fate-roll-style">Succeed with Style!</span>
        )}
      </div>
    </div>
  );
}

function FateThrowerTray({
  action,
  skill,
  requestId,
  target,
  difficulty,
  onThrow,
}: FateDiceTrayThrowerProps) {
  // Interactive tray: throwParams starts null so DiceScene renders the pickup row
  // and the player drag-and-flicks (physics-is-the-roll). We capture the gesture
  // on onThrow and read it on settle — the d20 DiceOverlay.handleSettle pattern,
  // where onAllSettle yields only the face values.
  const [throwParams, setThrowParams] = useState<ThrowParams | null>(null);
  const [rollKey, setRollKey] = useState(0);
  const pendingParams = useRef<ThrowParams | null>(null);

  const handleSceneThrow = useCallback((params: ThrowParams) => {
    pendingParams.current = params;
    setThrowParams(params);
    setRollKey((k) => k + 1);
  }, []);

  const handleAllSettle = useCallback(
    (faces: number[]) => {
      const params = pendingParams.current;
      if (!params) return; // a spectator-style settle with no local throw — ignore
      pendingParams.current = null;
      onThrow({
        request_id: requestId,
        action,
        skill,
        target,
        difficulty,
        throw_params: {
          velocity: params.linearVelocity,
          angular: params.angularVelocity,
          position: [params.position[0] + 0.5, (params.position[2] + 0.8) / 1.6],
        },
        face: faces,
      });
    },
    [requestId, action, skill, target, difficulty, onThrow],
  );

  return (
    <div data-testid="fate-dice-tray" className="flex flex-col">
      <div data-testid="fate-dice-frame" style={{ position: "relative", height: 200 }}>
        <Canvas
          camera={{ position: [0, 2.3, 0], rotation: [-Math.PI / 2, 0, 0], up: [0, 0, -1], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          style={{ pointerEvents: "auto", background: "transparent" }}
        >
          <DiceScene
            kind="dF"
            count={4}
            throwParams={throwParams}
            rollKey={rollKey}
            onThrow={handleSceneThrow}
            onAllSettle={handleAllSettle}
            theme={DEFAULT_DICE_THEME}
          />
        </Canvas>
      </div>
      <div data-testid="fate-throw-hint" className="text-sm opacity-80">
        Throw your four Fudge dice for {action.replace("_", " ")} ({skill}).
      </div>
    </div>
  );
}

export default FateDiceTray;
