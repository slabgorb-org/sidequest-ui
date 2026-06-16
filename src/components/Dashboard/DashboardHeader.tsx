import { THEME, SERIF, MONO } from "./shared/constants";
import { Sparkline } from "./charts/tufte";

interface Props {
  connected: boolean;
  turnCount: number;
  errorCount: number;
  p95: string;
  /** Chronological agent-duration sequence (ms) for the p95 trend sparkline. */
  p95Series?: number[];
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  onRefreshState: () => void;
}

const labelStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontVariant: "small-caps",
  letterSpacing: "0.08em",
  color: THEME.muted,
  fontSize: 12,
};

const valueStyle: React.CSSProperties = {
  fontFamily: MONO,
  color: THEME.ink,
  fontSize: 14,
};

export function DashboardHeader({
  connected,
  turnCount,
  errorCount,
  p95,
  p95Series,
  paused,
  onTogglePause,
  onClear,
  onRefreshState,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 15,
        padding: "14px 26px 12px",
        borderBottom: `1px solid ${THEME.rule}`,
      }}
    >
      <span style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.04em", color: THEME.ink }}>
        SideQuest <span style={{ color: THEME.muted, fontStyle: "italic" }}>Inspector</span>
      </span>
      <span style={{ fontSize: 9, color: connected ? THEME.good : THEME.muted }}>●</span>
      <span style={labelStyle}>{connected ? "connected" : "disconnected"}</span>

      <div style={{ flex: 1 }} />

      <Metric label="turns">
        <span style={valueStyle}>{turnCount}</span>
      </Metric>
      <Metric label="errors">
        <span style={{ ...valueStyle, color: errorCount > 0 ? THEME.accent : THEME.ink }}>
          {errorCount}
        </span>
      </Metric>
      <Metric label="p95">
        <span style={valueStyle}>{p95}</span>
        {p95Series && p95Series.length > 1 && (
          <Sparkline values={p95Series} color={THEME.muted} width={60} height={16} />
        )}
      </Metric>

      <TextButton onClick={onTogglePause}>{paused ? "resume" : "pause"}</TextButton>
      <TextButton onClick={onClear}>clear</TextButton>
      <TextButton onClick={onRefreshState} title="Refresh game state from server">
        ↻ state
      </TextButton>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 7, marginRight: 2 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </span>
  );
}

function TextButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        marginLeft: 12,
        fontFamily: SERIF,
        fontVariant: "small-caps",
        letterSpacing: "0.06em",
        color: THEME.muted,
        fontSize: 12,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = THEME.ink)}
      onMouseLeave={(e) => (e.currentTarget.style.color = THEME.muted)}
    >
      {children}
    </button>
  );
}
