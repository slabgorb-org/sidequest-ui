import { THEME } from "./shared/constants";

const TAB_LABELS = [
  "① Timeline",
  "② State",
  "③ Subsystems",
  "④ Timing",
  "⑤ Console",
  "⑥ Prompt",
  "⑦ Lore",
  "⑧ Encounters",
  "⑨ Mechanical",
];

interface Props {
  activeTab: number;
  onTabChange: (tab: number) => void;
  turnCount: number;
  errorCount: number;
}

export function DashboardTabs({ activeTab, onTabChange, turnCount, errorCount }: Props) {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: `2px solid ${THEME.border}`,
        background: THEME.surface,
      }}
    >
      {TAB_LABELS.map((label, i) => {
        const isActive = activeTab === i;
        let badge: React.ReactNode = null;
        if (i === 0 && turnCount > 0) {
          badge = <Badge value={turnCount} />;
        }
        if (i === 2 && errorCount > 0) {
          badge = <Badge value={errorCount} error />;
        }
        return (
          <div
            key={i}
            onClick={() => onTabChange(i)}
            style={{
              padding: "8px 20px",
              cursor: "pointer",
              color: isActive ? THEME.accent : THEME.muted,
              borderBottom: `2px solid ${isActive ? THEME.accent : "transparent"}`,
              marginBottom: -2,
              fontSize: 12,
              userSelect: "none",
            }}
          >
            {label}
            {badge}
          </div>
        );
      })}
    </div>
  );
}

function Badge({ value, error }: { value: number; error?: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        marginLeft: 4,
        padding: "1px 5px",
        borderRadius: 8,
        background: error ? THEME.red : THEME.border,
        color: error ? "white" : THEME.text,
      }}
    >
      {value}
    </span>
  );
}
