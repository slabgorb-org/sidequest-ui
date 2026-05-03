/**
 * Bottom HUD strip — conjunction countdown + scale ruler. Spec §7.
 *
 * Holds local state for the countdown so the displayed T+Nd HHh decrements
 * smoothly between server pushes. When the prop changes (new ORBITAL_CHART
 * arrived after a beat), local state resyncs.
 *
 * Conjunction goes red when < 24h remain — matching the `chart.red` token
 * on the server. Scale ruler shows always (1 AU at 100% zoom).
 */

import { useEffect, useState } from "react";
import type { ConjunctionEventPayload } from "@/types/orbital-intent";

interface HudBottomStripProps {
  nextConjunction: ConjunctionEventPayload | null;
  /** Current viewport zoom (1.0 = native AU scale). Drives the ruler width. */
  zoom: number;
}

const BRASS = "#f5d020";
const DIM = "#7a6810";
const RED = "#e62a18";

export function HudBottomStrip(props: HudBottomStripProps) {
  // Key the impl by the conjunction event id so a new push remounts with
  // a fresh countdown timer, instead of calling setState in an effect.
  const eventKey = props.nextConjunction
    ? `${props.nextConjunction.body_a_id}:${props.nextConjunction.body_b_id}:${props.nextConjunction.t_hours_event}`
    : "none";
  return <HudBottomStripImpl {...props} key={eventKey} />;
}

function HudBottomStripImpl({ nextConjunction, zoom }: HudBottomStripProps) {
  // Initial hours come from the prop on mount; outer wrapper remounts on
  // prop change so the initial value always reflects the latest server push.
  const [tHoursUntil, setTHoursUntil] = useState(
    nextConjunction?.t_hours_until ?? 0
  );

  useEffect(() => {
    if (!nextConjunction) return;
    const tick = setInterval(() => {
      setTHoursUntil((prev) => Math.max(0, prev - 1 / 3600));
    }, 1000);
    return () => clearInterval(tick);
    // nextConjunction is stable for this impl's lifetime (parent keys remount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-testid="hud-bottom-strip"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        borderTop: `1px solid ${BRASS}`,
        background: "transparent",
        color: BRASS,
        fontFamily: "Orbitron, monospace",
        fontSize: 10,
        letterSpacing: 1,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <ConjunctionPanel event={nextConjunction} tHoursUntil={tHoursUntil} />
      <ScaleRuler zoom={zoom} />
    </div>
  );
}

function ConjunctionPanel({
  event,
  tHoursUntil,
}: {
  event: ConjunctionEventPayload | null;
  tHoursUntil: number;
}) {
  if (!event) {
    return <div data-testid="hud-conjunction-empty" />;
  }
  const days = Math.floor(tHoursUntil / 24);
  const hours = Math.floor(tHoursUntil % 24);
  const isUrgent = tHoursUntil < 24;
  const color = isUrgent ? RED : BRASS;

  return (
    <div
      data-testid="hud-conjunction"
      style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}
    >
      <span style={{ color: DIM, fontSize: 8, letterSpacing: 1.5 }}>
        NEXT CONJUNCTION
      </span>
      <span data-testid="hud-conjunction-label" style={{ color: BRASS }}>
        {event.label}
      </span>
      <span
        data-testid="hud-conjunction-countdown"
        style={{
          color,
          fontFamily: "VT323, monospace",
          fontSize: 12,
        }}
      >
        T+{days}d&nbsp;{hours.toString().padStart(2, "0")}h
      </span>
    </div>
  );
}

function ScaleRuler({ zoom }: { zoom: number }) {
  // The chart's default scale fits roughly 5 AU across an 800px viewport
  // (varies by scope; this is a rough indicator). Apply zoom so the ruler
  // shrinks/grows with the user's zoom level.
  const lengthPx = Math.round(80 * zoom);

  return (
    <div
      data-testid="hud-scale-ruler"
      style={{ display: "flex", alignItems: "center", gap: 8 }}
    >
      <div
        style={{
          width: lengthPx,
          height: 1,
          background: BRASS,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -3,
            width: 1,
            height: 7,
            background: BRASS,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: -3,
            width: 1,
            height: 7,
            background: BRASS,
          }}
        />
      </div>
      <span style={{ color: BRASS }}>1 AU</span>
    </div>
  );
}
