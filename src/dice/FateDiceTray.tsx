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
  buildDefaultThrowParams,
  D6_RADIUS,
  type DiceTheme,
  type ThrowParams,
} from "@local/dice-lib";
import type { FateRollPayload, FateThrowPayload } from "@/types/payloads";

// Fate face glyphs (+ / − / 0) are drawn by troika from this font. dice-lib's
// DEFAULT_DICE_THEME carries no labelFont, so DiceScene fell back to its
// cross-origin CDN Inter-Bold (cdn.slabgorb.com/dice_assets/Inter-Bold.ttf),
// whose blob-worker fetch flakes intermittently → blank dice (sq-playtest
// 2026-06-19). #430 routed it same-origin via the /dice-cdn Vite proxy, but that
// proxy rewrites to https://cdn.slabgorb.com/dice_assets/Inter-Bold.ttf which
// returns HTTP 403 (the font isn't public on R2 under dice_assets/) → STILL
// blank dice (sq-playtest 2026-06-20). Serve the font that already ships in this
// app's own public/ directory instead: /fonts/Inter-Bold.ttf is same-origin (no
// CORS/worker flake), needs no CDN/R2 round-trip, and is copied into dist/ on a
// production build — so it resolves in dev AND prod, offline included.
// A DARK die body (not the default ivory) so the four Fudge cubes pop off the
// pale parchment background and the bright per-value face glyphs (green + / red −
// / near-white 0, coloured in dice-lib's FaceLabels) read at a glance — the ivory
// die on cream was invisible and its faces unreadable (Keith, sq-playtest 2026-06-20).
const FATE_DICE_THEME: DiceTheme = {
  ...DEFAULT_DICE_THEME,
  dieColor: "#26262e",
  labelColor: "#ece9e0",
  labelFont: "/fonts/Inter-Bold.ttf",
};

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

/**
 * A single 4dF face as a large, high-contrast, per-value COLORED chip so the
 * three Fudge faces are unmistakable at a glance: green = +1, red = −1, grey = 0.
 *
 * The pre-fix readout drew `+ / 0 / −` as one thin same-colour line, which is
 * illegible against the parchment theme (Keith, sq-playtest 2026-06-20: "I have
 * no idea what the dice say — is it a diamond or a zero?"). Colours are inline so
 * they never depend on the Tailwind palette/purge config — a roll readout must
 * always render correctly. `aria-label` keeps the value readable to assistive tech.
 */
function FaceChip({ value }: { value: number }) {
  const tone =
    value > 0
      ? { bg: "#15803d", fg: "#ffffff", border: "#166534" } // emerald
      : value < 0
        ? { bg: "#be123c", fg: "#ffffff", border: "#9f1239" } // rose
        : { bg: "#e7e5e4", fg: "#57534e", border: "#a8a29e" }; // stone
  return (
    <span
      aria-label={value > 0 ? "plus" : value < 0 ? "minus" : "zero"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: 8,
        border: `2px solid ${tone.border}`,
        backgroundColor: tone.bg,
        color: tone.fg,
        fontSize: 28,
        fontWeight: 900,
        lineHeight: 1,
      }}
    >
      {faceGlyph(value)}
    </span>
  );
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
            theme={FATE_DICE_THEME}
          />
        </Canvas>
      </div>

      {/* The legible readout — visible regardless of the 3D render. The four
          faces are large, per-value COLOURED chips (+ green / − red / 0 grey) so
          the roll reads at a glance; the old thin one-colour "0 0 + +" line was
          unreadable on the parchment theme (Keith, sq-playtest 2026-06-20). */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div data-testid="fate-roll-faces" className="flex gap-1.5">
          {roll.dice.map((value, i) => (
            <FaceChip key={i} value={value} />
          ))}
        </div>
        <span data-testid="fate-roll-shift" className="text-2xl font-black tabular-nums leading-none">
          {formatShift(roll.shifts)}
          <span className="ml-1 text-base font-semibold text-muted-foreground">shifts</span>
        </span>
        <span data-testid="fate-roll-ladder" className="text-lg font-semibold">
          {roll.ladder_name}
        </span>
        <span data-testid="fate-roll-tier" className="text-sm text-muted-foreground">
          {roll.tier}
        </span>
        {roll.succeeded_with_style && (
          <span
            data-testid="fate-roll-style"
            style={{ backgroundColor: "#fcd34d", color: "#451a03" }}
            className="rounded-full px-2.5 py-0.5 text-sm font-bold shadow-sm"
          >
            ★ Succeed with Style!
          </span>
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
            theme={FATE_DICE_THEME}
          />
        </Canvas>
      </div>
      <div data-testid="fate-throw-hint" className="text-sm opacity-80">
        Throw your four Fudge dice for {action.replace("_", " ")} ({skill}).
      </div>
      {/* sq-playtest 2026-06-19: the drag-flick was the only DISCOVERABLE trigger
          and it is finicky (the Space/Enter keyboard throw already existed but was
          hidden — window listener, no UI hint). Surface a visible primary "Throw"
          button wired to the SAME default-throw path (buildDefaultThrowParams), and
          name the flick + keyboard alternatives. Low-friction default (Alex). */}
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          data-testid="fate-throw-button"
          disabled={throwParams !== null}
          onClick={() => handleSceneThrow(buildDefaultThrowParams())}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {throwParams !== null ? "Rolling…" : "Throw dice"}
        </button>
        <span className="text-xs text-muted-foreground">or flick a die · Space / Enter</span>
      </div>
    </div>
  );
}

export default FateDiceTray;
