/**
 * FateDiceTray — the player-facing 4dF roll surface (ADR-144 F3c, Story 118-3).
 *
 * Option B: a real 3D Fudge die, not a flat readout. Four `dF` dice tumble in
 * the tray (kind='dF', count=4) and the legible result the player reads no
 * matter the 3D flourish sits beneath them — the four Fudge faces, the shift
 * total, the ladder rating, the outcome tier, and a succeed-with-style flash
 * (the legibility mandate — Sebastien/Jade).
 *
 * Ruleset-gated: this surface renders ONLY on a Fate pack so it never
 * co-renders with the WN/native ConfrontationOverlay. A non-fate ruleset
 * renders nothing at all.
 */

import { Canvas } from "@react-three/fiber";
import { DiceScene, DEFAULT_DICE_THEME } from "@local/dice-lib";
import type { FateRollPayload } from "@/types/payloads";

export interface FateDiceTrayProps {
  roll: FateRollPayload;
  /** The active pack's ruleset — the tray renders only when this is "fate". */
  ruleset: string;
  /** Genre slug, reserved for per-genre dice theming (parity with InlineDiceTray). */
  genreSlug?: string;
}

/** The Fudge glyph for a single face value. */
function faceGlyph(value: number): string {
  if (value > 0) return "+";
  if (value < 0) return "−";
  return "0";
}

function formatShift(shifts: number): string {
  return shifts >= 0 ? `+${shifts}` : `${shifts}`;
}

export function FateDiceTray({ roll, ruleset }: FateDiceTrayProps) {
  // The fate-ruleset gate: never co-render with the WN/native overlay.
  if (ruleset !== "fate") return null;

  return (
    <div data-testid="fate-dice-tray" className="flex flex-col">
      {/* Four dF dice on the table. */}
      <div data-testid="fate-dice-frame" style={{ position: "relative", height: 200 }}>
        <Canvas
          camera={{ position: [0, 2.3, 0], rotation: [-Math.PI / 2, 0, 0], up: [0, 0, -1], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          style={{ pointerEvents: "none", background: "transparent" }}
        >
          <DiceScene
            kind="dF"
            count={4}
            throwParams={null}
            rollKey={0}
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

export default FateDiceTray;
