import type { ForensicMechanical } from "../source/types";
import { THEME } from "../shared/constants";

export function MechanicalCensus({ mechanical }: { mechanical: ForensicMechanical }) {
  if (mechanical.state === "absent" || mechanical.pcs.length === 0) {
    return (
      <div style={{ color: THEME.muted, textAlign: "center", padding: 32 }}>
        No mechanical census for this round.
      </div>
    );
  }
  return (
    <div style={{ padding: 16, fontSize: 12 }}>
      {mechanical.pcs.map((pc) => (
        <div key={pc.player_id} style={{ marginBottom: 12, borderBottom: `1px solid ${THEME.border}`, paddingBottom: 8 }}>
          <div style={{ color: THEME.accent, fontWeight: "bold" }}>
            {pc.character_name} <span style={{ color: THEME.muted }}>(seat {pc.seat} · {pc.kind})</span>
          </div>
          {pc.deltas.length === 0 ? (
            <div style={{ color: THEME.muted }}>no change</div>
          ) : (
            <table style={{ borderCollapse: "collapse", marginTop: 4 }}>
              <tbody>
                {pc.deltas.map(([field, change], i) => (
                  <tr key={i}>
                    <td style={{ color: THEME.purple, padding: "1px 8px" }}>{field}</td>
                    <td style={{ padding: "1px 8px" }}>{change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {mechanical.trope && (
        <div style={{ color: THEME.amber, marginTop: 8 }}>
          Tropes: {mechanical.trope.summary}
          {mechanical.trope.total_beats_fired !== null
            ? ` · ${mechanical.trope.total_beats_fired} beats fired`
            : ""}
        </div>
      )}
    </div>
  );
}

interface TabProps {
  mechanical: ForensicMechanical | null;
}

export function MechanicalTab({ mechanical }: TabProps) {
  if (!mechanical) {
    return (
      <div style={{ color: THEME.muted, textAlign: "center", padding: 32 }}>
        Select a saved session and round to see the mechanical census.
      </div>
    );
  }
  return <MechanicalCensus mechanical={mechanical} />;
}
