import { useState } from "react";
import type { CSSProperties } from "react";
import type { RelationshipEntryPayload } from "@/types/payloads";

// Folio palette — mirrors LocationPanel / CharacterPanel / KnowledgeJournal so
// every dock panel reads as the same artifact. Resolved via CSS custom
// properties from the injected genre theme (ADR-079). The useGenreTheme hook
// is a CSS-injection effect, not a color accessor — panels read the resolved
// custom properties directly, exactly as LocationPanel does.
const FOLIO = {
  ink: "var(--card-foreground)",
  inkSoft: "var(--muted-foreground)",
  paper: "var(--card)",
  paper2: "var(--muted)",
  accent: "var(--accent)",
  primary: "var(--primary)",
  rule: "var(--border)",
} as const;

const FONT_DISPLAY = "'Pirata One', serif";
const FONT_BODY = "'EB Garamond', serif";

// ADR-136 hybrid disclosure: the band ("Warm") is the default, player-facing
// read; the raw disposition integer + per-turn beat history are mechanics-first
// detail (Sebastien/Jade) revealed only on expand. Phase B will insert
// personality_read and Phase C the claims roster inside the expanded body.
const TREND_ARROW: Record<string, string> = { up: "↗", flat: "→", down: "↘" };

export interface RelationshipsPanelProps {
  data: RelationshipEntryPayload[] | null;
}

export function RelationshipsPanel({ data }: RelationshipsPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!data || data.length === 0) {
    return (
      <div
        data-testid="relationships-empty"
        className="p-6"
        style={{
          background: FOLIO.paper,
          color: FOLIO.inkSoft,
          fontFamily: FONT_BODY,
          minHeight: "100%",
        }}
      >
        <p>No one yet. People you meet and engage will appear here.</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.last_seen_turn - a.last_seen_turn);

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });

  return (
    <div
      data-testid="relationships-panel"
      className="p-4"
      style={{
        background: FOLIO.paper,
        color: FOLIO.ink,
        fontFamily: FONT_BODY,
        minHeight: "100%",
      }}
    >
      {sorted.map((e) => {
        const isOpen = expanded.has(e.name);
        return (
          <div
            key={e.name}
            data-testid="relationships-entry"
            style={{
              borderBottom: `1px solid ${FOLIO.rule}`,
              padding: "0.5rem 0",
            }}
          >
            <button
              type="button"
              onClick={() => toggle(e.name)}
              aria-expanded={isOpen}
              style={headerButtonStyle()}
            >
              <span style={{ fontWeight: 600, flex: 1 }}>{e.name}</span>
              <span style={{ color: FOLIO.inkSoft }}>{e.band}</span>
              <span aria-label={`trend ${e.trend}`} style={{ color: FOLIO.accent }}>
                {TREND_ARROW[e.trend] ?? "→"}
              </span>
            </button>
            {isOpen && (
              <div
                data-testid="relationships-detail"
                style={{ padding: "0.5rem 0 0 0.5rem", color: FOLIO.inkSoft }}
              >
                <div>
                  Standing: <strong style={{ color: FOLIO.ink }}>{e.disposition}</strong>{" "}
                  ({e.band})
                </div>
                {e.last_seen_location ? (
                  <div>
                    Last seen: {e.last_seen_location} (turn {e.last_seen_turn})
                  </div>
                ) : null}
                {e.beats.length > 0 ? (
                  <div style={{ marginTop: "0.5rem" }}>
                    <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
                      History
                    </div>
                    <ul style={{ margin: "0.25rem 0", paddingLeft: "1rem" }}>
                      {e.beats
                        .slice()
                        .reverse()
                        .map((b, i) => (
                          <li key={`${b.turn}-${i}`}>
                            {b.reason} ({b.delta > 0 ? `+${b.delta}` : b.delta})
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
                {/* Phase B inserts personality_read here; Phase C inserts claims here. */}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function headerButtonStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: FOLIO.ink,
    fontFamily: FONT_BODY,
    fontSize: "0.95rem",
    textAlign: "left",
    padding: 0,
  };
}
