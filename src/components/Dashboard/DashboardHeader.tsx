import { THEME } from "./shared/constants";

interface Props {
  connected: boolean;
  turnCount: number;
  errorCount: number;
  p95: string;
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  onRefreshState: () => void;
}

export function DashboardHeader({
  connected,
  turnCount,
  errorCount,
  p95,
  paused,
  onTogglePause,
  onClear,
  onRefreshState,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 16px",
        background: THEME.surface,
        borderBottom: `1px solid ${THEME.border}`,
      }}
    >
      <span style={{ color: THEME.accent, fontWeight: "bold", fontSize: 15 }}>
        SideQuest Inspector
      </span>
      <span style={{ fontSize: 10, color: connected ? THEME.green : THEME.muted }}>
        ●
      </span>
      <span style={{ color: THEME.muted, fontSize: 12 }}>
        {connected ? "Connected" : "Disconnected"}
      </span>
      <span style={{ color: THEME.muted, fontSize: 12 }}>
        Turns: <b style={{ color: THEME.text }}>{turnCount}</b>
      </span>
      <span style={{ color: THEME.muted, fontSize: 12 }}>
        Errors: <b style={{ color: errorCount > 0 ? THEME.red : THEME.text }}>{errorCount}</b>
      </span>
      <span style={{ color: THEME.muted, fontSize: 12 }}>
        p95: <b style={{ color: THEME.text }}>{p95}</b>
      </span>
      <button onClick={onTogglePause} style={btnStyle}>
        {paused ? "Resume" : "Pause"}
      </button>
      <button onClick={onClear} style={btnStyle}>
        Clear
      </button>
      <button onClick={onRefreshState} style={btnStyle} title="Refresh game state from server">
        ↻ State
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: THEME.border,
  color: THEME.text,
  border: "none",
  padding: "4px 10px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 11,
  fontFamily: "inherit",
};
