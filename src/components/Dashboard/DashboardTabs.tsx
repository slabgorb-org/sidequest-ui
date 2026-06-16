import { THEME, SERIF, MONO } from "./shared/constants";

const TAB_LABELS = [
  "Timeline",
  "State",
  "Subsystems",
  "Timing",
  "Console",
  "Prompt",
  "Lore",
  "Encounters",
  "Mechanical",
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
        padding: "0 18px",
        borderBottom: `1px solid ${THEME.rule}`,
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
              padding: "9px 15px",
              cursor: "pointer",
              fontFamily: SERIF,
              fontVariant: "small-caps",
              letterSpacing: "0.07em",
              fontSize: 13,
              userSelect: "none",
              color: isActive ? THEME.ink : THEME.muted,
              borderBottom: `2px solid ${isActive ? THEME.accent : "transparent"}`,
              marginBottom: -1,
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
        fontFamily: MONO,
        fontSize: 9,
        marginLeft: 5,
        color: error ? THEME.accent : THEME.muted,
        verticalAlign: "super",
      }}
    >
      {value}
    </span>
  );
}
