import type { ForensicTimelineRound } from "../source/types";
import { THEME } from "../shared/constants";

interface Props {
  rounds: ForensicTimelineRound[];
  selectedRound: number | null;
  onSelectRound: (round: number) => void;
}

export function ForensicTimelineTab({ rounds, selectedRound, onSelectRound }: Props) {
  if (rounds.length === 0) {
    return (
      <div style={{ color: THEME.muted, textAlign: "center", padding: 32 }}>
        No rounds recorded for this save.
      </div>
    );
  }
  return (
    <div style={{ padding: 16 }}>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}>
        {rounds.map((r) => {
          const kinds = Object.entries(r.event_kind_counts)
            .map(([k, n]) => `${k}:${n}`)
            .join("  ");
          const active = r.round === selectedRound;
          return (
            <li
              key={r.round}
              data-active={active}
              onClick={() => onSelectRound(r.round)}
              style={{
                cursor: "pointer",
                padding: "6px 8px",
                borderBottom: `1px solid ${THEME.border}`,
                background: active ? THEME.surface : "transparent",
                color: active ? THEME.accent : THEME.text,
              }}
            >
              <strong>Round {r.round}</strong>{" "}
              <span style={{ color: THEME.muted }}>
                · {r.narrative_authors.join(", ") || "—"} · {kinds || "no events"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
