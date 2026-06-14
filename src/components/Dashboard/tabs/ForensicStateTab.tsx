import type { ReactNode } from "react";
import type { ForensicBundle, ForensicSnapshot } from "../source/types";
import { THEME } from "../shared/constants";

interface Props {
  bundle: ForensicBundle | null;
  snapshot: ForensicSnapshot | null;
}

function Section({ title, color, children }: { title: string; color: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color, fontSize: 11, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function ForensicStateTab({ bundle, snapshot }: Props) {
  if (!bundle) {
    return (
      <div style={{ color: THEME.muted, textAlign: "center", padding: 32 }}>
        Select a round to inspect.
      </div>
    );
  }
  const derivedEntries = Object.entries(bundle.derived);
  return (
    <div style={{ padding: 16, fontSize: 12 }}>
      <Section title="Narrative (this round)" color={THEME.text}>
        {bundle.narrative.length === 0 ? (
          <div style={{ color: THEME.muted }}>No narrative this round.</div>
        ) : (
          bundle.narrative.map((n, i) => (
            <p key={i} style={{ margin: "4px 0" }}>
              <span style={{ color: THEME.muted }}>{n.author}: </span>
              {n.content}
            </p>
          ))
        )}
      </Section>

      <Section title="Derived — narrator believed (KnownFacts)" color={THEME.amber}>
        {derivedEntries.length === 0 ? (
          <div style={{ color: THEME.muted }}>No facts reconstructed.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {derivedEntries.map(([id, f]) => (
                <tr key={id} style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ color: THEME.amber, padding: "2px 8px" }}>{f.value.category ?? "—"}</td>
                  <td style={{ padding: "2px 8px" }}>{f.value.summary ?? id}</td>
                  <td style={{ color: THEME.muted, padding: "2px 8px" }}>seqs {f.source_seqs.join(",")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Stored — terminal snapshot (ground truth)" color={THEME.green}>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: THEME.text }}>
          {snapshot && Object.keys(snapshot).length > 0
            ? JSON.stringify(snapshot, null, 2)
            : "(no snapshot stored)"}
        </pre>
      </Section>
    </div>
  );
}
