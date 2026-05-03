/**
 * Top HUD strip — stardate readout. Spec §7.
 *
 * Reads t_hours + epoch_days from props and renders STARDATE / DAY / HH:MM
 * in the brass-amber HUD register. Stateless — server pushes a fresh
 * ORBITAL_CHART on every clock advance, so we don't tick a local interval
 * for minute precision (the next push would clobber it anyway).
 */

interface HudTopStripProps {
  tHours: number;
  epochDays: number;
}

const BRASS = "#f5d020";
const DIM = "#7a6810";

export function HudTopStrip({ tHours, epochDays }: HudTopStripProps) {
  const tDays = tHours / 24;
  const stardate = (epochDays + tDays).toFixed(1);
  const day = Math.floor(tDays);
  const hourFloat = tHours % 24;
  const hh = Math.floor(hourFloat).toString().padStart(2, "0");
  const mm = Math.floor((hourFloat - Math.floor(hourFloat)) * 60)
    .toString()
    .padStart(2, "0");

  return (
    <div
      data-testid="hud-top-strip"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 28,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        borderBottom: `1px solid ${BRASS}`,
        background: "transparent",
        color: BRASS,
        fontFamily: "Orbitron, monospace",
        fontSize: 11,
        letterSpacing: 1,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <span data-testid="hud-stardate">STARDATE&nbsp;{stardate}</span>
      <span style={{ color: DIM, margin: "0 8px" }}>·</span>
      <span data-testid="hud-day">DAY&nbsp;{day}</span>
      <span style={{ color: DIM, margin: "0 8px" }}>·</span>
      <span
        data-testid="hud-clock"
        style={{ fontFamily: "VT323, monospace", fontSize: 14 }}
      >
        {hh}:{mm}
      </span>
    </div>
  );
}
