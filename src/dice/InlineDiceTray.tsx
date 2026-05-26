/**
 * InlineDiceTray — Compact dice tray embedded in the Confrontation panel.
 *
 * No gestures, no drag-to-throw. The die sits idle in the tray. When a beat
 * button is clicked (which creates a DiceRequest), the die auto-rolls with
 * random physics params. Settle → face reported → result shown inline.
 *
 * The Canvas stays mounted as long as the confrontation is active, avoiding
 * WebGL context creation/destruction churn. The die only appears and rolls
 * when a DiceRequest is active.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  DiceScene,
  DEFAULT_DICE_THEME,
  D20_RADIUS,
  replayThrowParams,
  type DiceTheme,
  type ThrowParams,
} from "@local/dice-lib";
import type { DiceRequestPayload, DiceResultPayload, DiceThrowParams } from "@/types/payloads";

// Archetype → dice label font (matches useChromeArchetype UI fonts)
const PARCHMENT_FONT = "/fonts/EBGaramond.ttf";
const TERMINAL_FONT = "/fonts/Orbitron.ttf";
const RUGGED_FONT = "/fonts/Oswald.ttf";

/** Per-genre dice themes. Genres not listed here fall back to DEFAULT_DICE_THEME. */
const GENRE_DICE_THEMES: Record<string, DiceTheme> = {
  // --- parchment archetype ---
  caverns_and_claudes: {
    dieColor: "#e8e0d0",    // classic ivory
    labelColor: "#8b0000",  // dark red ink
    roughness: 0.4,
    metalness: 0.05,
    normalMap: "/textures/dice/scratched-plastic-normal.jpg",
    normalScale: 0.15,
    labelFont: PARCHMENT_FONT,
  },
  elemental_harmony: {
    dieColor: "#f5f0e8",    // parchment white
    labelColor: "#2d5a27",  // forest green
    roughness: 0.5,
    metalness: 0.0,
    normalMap: "/textures/dice/worn-stone-normal.jpg",
    normalScale: 0.15,
    labelFont: PARCHMENT_FONT,
  },
  low_fantasy: {
    dieColor: "#6b4226",    // worn leather
    labelColor: "#d4a574",  // aged gold
    roughness: 0.8,
    metalness: 0.1,
    normalMap: "/textures/dice/worn-stone-normal.jpg",
    normalScale: 0.25,
    labelFont: PARCHMENT_FONT,
  },
  tea_and_murder: {
    dieColor: "#4a1a3a",    // deep plum
    labelColor: "#d4af37",  // polished brass
    roughness: 0.25,
    metalness: 0.5,
    normalMap: "/textures/dice/scratched-metal-normal.jpg",
    normalScale: 0.15,
    labelFont: PARCHMENT_FONT,
  },
  // --- terminal archetype ---
  neon_dystopia: {
    dieColor: "#1a1a2e",    // dark chrome
    labelColor: "#ff00ff",  // hot magenta
    roughness: 0.1,
    metalness: 0.8,
    normalMap: "/textures/dice/brushed-metal-normal.jpg",
    normalScale: 0.2,
    labelFont: TERMINAL_FONT,
  },
  space_opera: {
    dieColor: "#1a1a3a",    // deep space blue
    labelColor: "#00ccff",  // hologram cyan
    roughness: 0.15,
    metalness: 0.7,
    normalMap: "/textures/dice/brushed-metal-normal.jpg",
    normalScale: 0.15,
    labelFont: TERMINAL_FONT,
  },
  // --- rugged archetype ---
  mutant_wasteland: {
    dieColor: "#7fff00",    // lime green
    labelColor: "#1a3a0a",  // dark green
    roughness: 0.5,
    metalness: 0.1,
    normalMap: "/textures/dice/worn-stone-normal.jpg",
    normalScale: 0.3,
    labelFont: "/fonts/AmericanTypewriter.ttf",
  },
  road_warrior: {
    dieColor: "#2a2a2a",    // matte black
    labelColor: "#ff4400",  // hot rod orange
    roughness: 0.6,
    metalness: 0.3,
    normalMap: "/textures/dice/scratched-metal-normal.jpg",
    normalScale: 0.2,
    labelFont: RUGGED_FONT,
  },
  spaghetti_western: {
    dieColor: "#c4956a",    // dusty sandstone
    labelColor: "#3a1a0a",  // burnt leather
    roughness: 0.9,
    metalness: 0.0,
    normalMap: "/textures/dice/worn-stone-normal.jpg",
    normalScale: 0.25,
    labelFont: RUGGED_FONT,
  },
  pulp_noir: {
    dieColor: "#1a1a1a",    // noir black
    labelColor: "#c8b060",  // smoky gold
    roughness: 0.2,
    metalness: 0.4,
    normalMap: "/textures/dice/brushed-metal-normal.jpg",
    normalScale: 0.15,
    labelFont: RUGGED_FONT,
  },
  heavy_metal: {
    dieColor: "#0a0a0a",    // black iron
    labelColor: "#cc0000",  // blood red
    roughness: 0.35,
    metalness: 0.6,
    normalMap: "/textures/dice/scratched-metal-normal.jpg",
    normalScale: 0.2,
    labelFont: "/fonts/Bastarda-K.ttf",
  },
};

export interface InlineDiceTrayProps {
  diceRequest: DiceRequestPayload | null;
  diceResult: DiceResultPayload | null;
  playerId: string;
  onThrow: (params: DiceThrowParams, face: number[]) => void;
  /** Genre slug for theming the die. */
  genreSlug?: string;
}

/** Generate random throw params — replaces the drag gesture. */
function randomThrowParams(): ThrowParams {
  // Random position near center of tray
  const px = (Math.random() - 0.5) * 0.3;
  const pz = (Math.random() - 0.5) * 0.4;

  // Hard horizontal throw — bounces off walls, good energy
  const vx = (Math.random() - 0.5) * 8;
  const vy = -(Math.random() * 2 + 1.5); // moderate downward
  const vz = (Math.random() - 0.5) * 6;

  // Good spin — tumbles convincingly
  const ax = (Math.random() - 0.5) * 30;
  const ay = (Math.random() - 0.5) * 30;
  const az = (Math.random() - 0.5) * 30;

  // Random initial rotation
  const rx = Math.random() * Math.PI * 2;
  const ry = Math.random() * Math.PI * 2;
  const rz = Math.random() * Math.PI * 2;

  return {
    position: [px, 0.5, pz],
    linearVelocity: [vx, vy, vz],
    angularVelocity: [ax, ay, az],
    rotation: [rx, ry, rz],
  };
}

function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// Outcome-aware presentation. Tie is its own band on the resolver
// (total == DC); rendering it as "Fail" in red lies to the player and made
// the dial feel arbitrary in the 2026-05-06 playtest. Tie gets a neutral
// amber so it reads as "no movement" rather than "you lost."
function outcomeColor(outcome: DiceResultPayload["outcome"]): string {
  switch (outcome) {
    case "CritSuccess":
      return "#22c55e";
    case "CritFail":
      return "#ef4444";
    case "Success":
      return "#e8e0d0";
    case "Tie":
      return "#fbbf24";
    case "Fail":
    default:
      return "#fca5a5";
  }
}

function outcomeLabel(outcome: DiceResultPayload["outcome"]): string {
  switch (outcome) {
    case "CritSuccess":
      return "Critical!";
    case "CritFail":
      return "Critical Fail!";
    case "Success":
      return "Success";
    case "Tie":
      return "Tie";
    case "Fail":
    default:
      return "Fail";
  }
}

function buildAnnouncement(result: DiceResultPayload): string {
  const faces = result.rolls.flatMap((r) => r.faces).join(", ");
  return `${result.character_name} rolled ${result.total} (${faces} ${formatModifier(result.modifier)}) vs DC ${result.difficulty} — ${result.outcome}`;
}

export function InlineDiceTray({ diceRequest, diceResult, playerId, onThrow, genreSlug }: InlineDiceTrayProps) {
  const diceTheme = useMemo(
    () => (genreSlug && GENRE_DICE_THEMES[genreSlug]) || DEFAULT_DICE_THEME,
    [genreSlug],
  );
  const [throwParams, setThrowParams] = useState<ThrowParams | null>(null);
  const [rollKey, setRollKey] = useState(0);
  const [pendingLocalParams, setPendingLocalParams] = useState<ThrowParams | null>(null);
  const lastRequestIdRef = useRef<string | null>(null);

  const isRollingPlayer = diceRequest !== null && playerId === diceRequest.rolling_player_id;

  // Auto-roll when a new DiceRequest arrives for the rolling player.
  // No gesture needed — the beat button click is the intent signal.
  //
  // Pre-roll pause: give the table 1500ms to read the target before the
  // physics fires. Alex needs time to parse "need 12"; Sebastien wants to
  // see the mechanical target before the outcome. Too short and the number
  // blurs past unread; too long and it feels laggy. 1.5s is the tabletop
  // "DM calls the target, then picks up the die" beat.
  useEffect(() => {
    if (!diceRequest) return;
    if (diceRequest.request_id === lastRequestIdRef.current) return;
    lastRequestIdRef.current = diceRequest.request_id;

    if (!isRollingPlayer) return;

    const timer = setTimeout(() => {
      const params = randomThrowParams();
      setThrowParams(params);
      setPendingLocalParams(params);
      setRollKey((k) => k + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [diceRequest, isRollingPlayer]);

  // Spectator replay — when DiceResult arrives for non-rolling players
  useLayoutEffect(() => {
    if (!diceResult) return;
    if (isRollingPlayer) return;
    const sceneParams = replayThrowParams(diceResult.throw_params, diceResult.seed, D20_RADIUS);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThrowParams(sceneParams);
    setRollKey((k) => k + 1);
  }, [diceResult, isRollingPlayer]);

  // Physics settle → report face to server
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

  // DiceScene still requires an onThrow prop (for PickupDie). Since we
  // auto-roll, PickupDie never renders — but we need a no-op to satisfy types.
  const noopThrow = useCallback(() => {}, []);

  // Minimum d20 face that yields Success on the server resolver, which uses
  // `total > difficulty` (Tie at total==DC, Success at total>DC). Display the
  // first *passing* face — anything less ties or fails. (Playtest 2026-05-06:
  // Sebastien rolled the displayed minimum and got "Fail" — that was a Tie at
  // the displayed face. Display now matches what actually passes.)
  const needed = diceRequest ? diceRequest.difficulty - diceRequest.modifier + 1 : 0;

  return (
    <div data-testid="inline-dice-tray" className="flex flex-col">
      {/* Target banner — prominent so the table can read it before the roll.
          Shows DC (the number the total beats) as the big target; modifier
          is secondary context. Stays visible through the roll and result,
          replaced when the next beat builds a new DiceRequest. */}
      {diceRequest && (
        <div
          data-testid="dice-target-banner"
          className="flex items-center justify-center gap-2 mb-2 px-3 py-2 rounded border border-border bg-muted/40"
        >
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Target
          </span>
          <span className="text-2xl font-bold text-foreground leading-none">
            {diceRequest.difficulty}
          </span>
          <span className="text-[11px] text-muted-foreground">
            ({diceRequest.stat} {formatModifier(diceRequest.modifier)} · need {needed} on d20)
          </span>
        </div>
      )}

      {/* 3D dice canvas — transparent background, die rolls on the panel
          surface. Fixed, roughly-square height (no flex:1) so the die lives
          in a stable side lane that never reflows the beats and never
          flashes in/out: the settled die persists here and re-tumbles in
          place on the next beat commit (Klinger design, 2026-05-26). The
          ~180px square preserves the calibrated top-down frame (camera
          y=2.4 → ~1.84-unit square frame) so the landed face stays legible. */}
      <div
        style={{
          position: "relative",
          height: 180,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <Canvas
          shadows
          camera={{
            // Straight-down, 90° — the top face of the settled icosahedron
            // is flat to the viewer, so reading the roll is unambiguous.
            // (Playtest 2026-04-24: oblique cameras made the "up" face
            // indistinguishable from its neighbors, prompting floating
            // callouts that could disagree with what the player sees.)
            //
            // FOV 42 (was 50) tightens the lens for legibility — Sebastien
            // reads the number, Alex isn't time-pressured to lean forward.
            // The tray (1.6 wide) still fits the frame at this distance
            // (camera y=2.4 → frame width ≈ 1.84 units) with ~0.12 of
            // padding each side. Combined with D20_RADIUS=0.36 (1.5× the
            // prior 0.24), the die now occupies ~39% of the frame width
            // (was ~21%) — roughly 1.86× perceptual size, addressing the
            // playtest 2026-04-25 readability bug.
            position: [0, 2.4, 0],
            rotation: [-Math.PI / 2, 0, 0],
            up: [0, 0, -1],
            fov: 42,
            near: 0.01,
            far: 50,
          }}
          gl={{ antialias: true, alpha: true }}
          dpr={Math.min(window.devicePixelRatio, 2)}
          style={{ pointerEvents: "none", background: "transparent" }}
        >
          <DiceScene
            kind="d20"
            count={1}
            throwParams={throwParams}
            rollKey={rollKey}
            onThrow={noopThrow}
            onAllSettle={(values) => handleSettle(values[0])}
            theme={diceTheme}
          />
        </Canvas>

        {/* Result readout — "Rolled N vs Target M — Outcome".
            Persists alongside the target banner above through the
            narrator's resolution. App.tsx clears the request + result on
            new DiceRequest, on confrontation end, and on NARRATION_END
            (the narrator's turn boundary) — so the stale TARGET doesn't
            linger beside the next set of beat buttons. Tabletop parity:
            the DM never erases the target mid-resolution, but the slate
            wipes clean before the next roll. */}
        {diceResult && (
          <div
            data-testid="dice-result"
            data-outcome={diceResult.outcome}
            style={{
              position: "absolute",
              bottom: 8,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              padding: "6px 12px",
              background: "rgba(0, 0, 0, 0.55)",
              borderRadius: 6,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              fontFamily: "serif",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}
          >
            <span style={{ fontSize: 12, color: "#a8a29e" }}>Rolled</span>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: outcomeColor(diceResult.outcome),
                lineHeight: 1,
              }}
            >
              {diceResult.total}
            </span>
            <span style={{ fontSize: 12, color: "#a8a29e" }}>
              vs {diceResult.difficulty}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginLeft: 4,
                color: outcomeColor(diceResult.outcome),
              }}
            >
              {outcomeLabel(diceResult.outcome)}
            </span>
          </div>
        )}
      </div>

      {/* Screen reader announcement */}
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

export default InlineDiceTray;
