/**
 * DiceOverlay — Production dice overlay driven by WebSocket protocol messages.
 *
 * Lifecycle: idle → DiceRequest → active (rolling or spectating) → DiceResult → settled → idle
 *
 * The overlay is invisible (not in DOM) when no DiceRequest is active.
 * When active, it renders a full-screen fixed overlay with:
 * - DC, stat, modifier, "you need X" display
 * - Three.js Canvas for 3D dice (rolling player) or spectator view
 * - aria-live region for screen reader announcements
 * - Result display with RollOutcome-driven data attributes
 *
 * Rolling vs spectator is determined by comparing playerId to
 * diceRequest.rolling_player_id.
 */

import { useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  DiceScene,
  D20_RADIUS,
  replayThrowParams,
  type ThrowParams,
} from "@local/dice-lib";
import type { DiceRequestPayload, DiceResultPayload, DiceThrowParams } from "@/types/payloads";

export interface DiceOverlayProps {
  diceRequest: DiceRequestPayload | null;
  diceResult: DiceResultPayload | null;
  playerId: string;
  /**
   * Fired after local physics settles on the rolling player's client.
   * `face` is flat-order across the pool; single-d20 case is `[value]`.
   * Physics-is-the-roll (story 34-12): the server treats `face` as the
   * authoritative result.
   */
  onThrow: (params: DiceThrowParams, face: number[]) => void;
}

/** Format the modifier for display: "+3" or "-2". */
function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Build the aria-live announcement string per ADR-075. */
function buildAnnouncement(result: DiceResultPayload): string {
  const faces = result.rolls.flatMap((r) => r.faces).join(", ");
  return `${result.character_name} rolled ${result.total} (${faces} ${formatModifier(result.modifier)}) vs DC ${result.difficulty} — ${result.outcome}`;
}

export function DiceOverlay({ diceRequest, diceResult, playerId, onThrow }: DiceOverlayProps) {
  const [throwParams, setThrowParams] = useState<ThrowParams | null>(null);
  const [rollKey, setRollKey] = useState(0);
  // Rolling player's in-flight local physics run. Set on gesture release,
  // cleared when handleSettle reports the face. Gates handleSettle so the
  // replay path can't accidentally double-send a DiceThrow message.
  const [pendingLocalParams, setPendingLocalParams] = useState<ThrowParams | null>(null);

  const isRollingPlayer = diceRequest !== null && playerId === diceRequest.rolling_player_id;

  // Fresh state on each new DiceRequest is handled by keying the overlay on
  // `diceRequest.request_id` at the parent (App.tsx / DiceSpikePage) — the
  // component remounts on every new request, so `useState` defaults do the
  // reset. No reset-in-effect needed (avoids react-hooks/set-state-in-effect).

  // Spectator replay: when DiceResult arrives for players who didn't roll,
  // run Rapier locally with seed-driven replay params so the visual playout
  // matches the rolling player's physics. The rolling player skips this
  // path to avoid watching the same roll twice. Seed is consumed inside
  // `replayThrowParams` — DiceScene plays deterministically from the
  // resulting throw params without needing the seed directly (Keith's
  // #128 build-fix removed the redundant seed prop from DiceScene).
  //
  // Legitimate prop→state sync: two values (throwParams, rollKey) must
  // change together in response to a new diceResult prop. The rolling-
  // player and spectator branches are mutually exclusive via the
  // isRollingPlayer guard, and the same state is also written by
  // handleSceneThrow for the rolling-player drag path. No cascading
  // renders — effect deps don't include its own outputs.
  useEffect(() => {
    if (!diceResult) return;
    if (isRollingPlayer) return;
    const sceneParams = replayThrowParams(diceResult.throw_params, diceResult.seed, D20_RADIUS);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThrowParams(sceneParams);
    setRollKey((k) => k + 1);
  }, [diceResult, isRollingPlayer]);

  // Rolling player's drag-and-release. Starts a local PhysicsDie simulation
  // but does NOT send DiceThrow yet — we wait for the die to settle so we
  // can report the authoritative face value (physics-is-the-roll, 34-12).
  const handleSceneThrow = useCallback(
    (params: ThrowParams) => {
      if (!isRollingPlayer || !diceRequest) return;
      setThrowParams(params);
      setPendingLocalParams(params);
      setRollKey((k) => k + 1);
    },
    [isRollingPlayer, diceRequest],
  );

  // Called by PhysicsDie on settle with the face reading from readD20Value.
  // Only fires the wire DiceThrow when we have a pending local run — that
  // guard ensures spectator replay settles don't accidentally send anything.
  const handleSettle = useCallback(
    (value: number) => {
      if (!isRollingPlayer || !diceRequest || !pendingLocalParams) return;
      const params = pendingLocalParams;
      setPendingLocalParams(null);
      onThrow(
        {
          velocity: params.linearVelocity,
          angular: params.angularVelocity,
          position: [
            params.position[0] + 0.5,
            (params.position[2] + 0.8) / 1.6,
          ],
        },
        [value],
      );
    },
    [isRollingPlayer, diceRequest, pendingLocalParams, onThrow],
  );

  if (!diceRequest) return null;

  const needed = diceRequest.difficulty - diceRequest.modifier;

  return (
    <div
      data-testid="dice-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        pointerEvents: isRollingPlayer ? "auto" : "none",
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.9) 100%)",
      }}
    >
      {/* Dice tray info — DC, stat, modifier, character, context */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          color: "#e8e0d0",
          fontFamily: "serif",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 14, color: "#8a7a6a", letterSpacing: 1 }}>
          {diceRequest.context}
        </div>
        <div style={{ fontSize: 18 }}>
          <span>{diceRequest.character_name}</span>
          {" — "}
          <span style={{ textTransform: "capitalize" }}>{diceRequest.stat}</span>
          {" "}
          <span>{formatModifier(diceRequest.modifier)}</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>
          DC {diceRequest.difficulty}
        </div>
        <div style={{ fontSize: 14, color: "#8a7a6a" }}>
          You need a {needed}
        </div>
      </div>

      {/* Three.js Canvas — only interactive for rolling player */}
      <Canvas
        shadows
        camera={{
          position: [0, 1.8, 1.2],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        gl={{ antialias: true, alpha: false }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <DiceScene
          kind="d20"
          count={1}
          throwParams={throwParams}
          rollKey={rollKey}
          onThrow={handleSceneThrow}
          onAllSettle={(values) => handleSettle(values[0])}
        />
      </Canvas>

      {/* Result display — shown when DiceResult arrives */}
      {diceResult && (
        <div
          data-testid="dice-result"
          data-outcome={diceResult.outcome}
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {/* Individual die faces */}
          <div style={{ display: "flex", gap: 8 }}>
            {diceResult.rolls.flatMap((group, gi) =>
              group.faces.map((face, fi) => (
                <span
                  key={`${gi}-${fi}`}
                  style={{
                    fontSize: 20,
                    color: "#e8e0d0",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontFamily: "serif",
                  }}
                >
                  {face}
                </span>
              )),
            )}
          </div>
          {/* Total */}
          <div
            style={{
              fontSize: diceResult.outcome === "CritSuccess" || diceResult.outcome === "CritFail" ? 48 : 36,
              fontWeight: 700,
              color:
                diceResult.outcome === "CritSuccess"
                  ? "#22c55e"
                  : diceResult.outcome === "CritFail"
                    ? "#ef4444"
                    : diceResult.outcome === "Success"
                      ? "#e8e0d0"
                      : "#9ca3af",
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              fontFamily: "serif",
            }}
          >
            {diceResult.total}
          </div>
          {/* Outcome label */}
          <div
            style={{
              fontSize: 16,
              color: "#8a7a6a",
              fontFamily: "serif",
              textTransform: "capitalize",
            }}
          >
            {diceResult.outcome === "CritSuccess"
              ? "Critical Success!"
              : diceResult.outcome === "CritFail"
                ? "Critical Fail!"
                : diceResult.outcome === "Success"
                  ? "Success"
                  : "Fail"}
          </div>
        </div>
      )}

      {/* aria-live region — screen reader announcement (ADR-075) */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
        }}
      >
        {diceResult && diceRequest ? buildAnnouncement(diceResult) : ""}
      </div>
    </div>
  );
}

export default DiceOverlay;
