import type { QuestsPayload } from "@/types/payloads";

// Folio palette — mirrors RelationshipsPanel / LocationPanel / CharacterPanel so
// every dock panel reads as the same artifact. Resolved via CSS custom
// properties from the injected genre theme (ADR-079); the panel reads the
// resolved properties directly rather than through a color accessor.
const FOLIO = {
  ink: "var(--card-foreground)",
  inkSoft: "var(--muted-foreground)",
  paper: "var(--card)",
  accent: "var(--accent)",
  rule: "var(--border)",
} as const;

const FONT_DISPLAY = "'Pirata One', serif";
const FONT_BODY = "'EB Garamond', serif";

const PANEL_LABEL = "Quests and objectives";

// Story 77-5 / ADR-137: the player-facing quest spine made legible. Renders the
// active_stakes (what's at risk now), the quest_log (what am I doing), and the
// quest_anchors (where/when an objective resolves). Read-only — no writes, no
// quest interaction (server lane owns all mutation). Structurally a sibling of
// RelationshipsPanel: a pure presentational component taking a typed `data`
// prop with the empty-state branch first.
export interface QuestsPanelProps {
  data: QuestsPayload | null;
}

function isEmptySpine(data: QuestsPayload): boolean {
  return (
    data.quest_log.length === 0 &&
    data.quest_anchors.length === 0 &&
    data.active_stakes.trim() === ""
  );
}

export function QuestsPanel({ data }: QuestsPanelProps) {
  if (!data || isEmptySpine(data)) {
    return (
      <div
        role="region"
        aria-label={PANEL_LABEL}
        data-testid="quests-empty"
        className="p-6"
        style={{
          background: FOLIO.paper,
          color: FOLIO.inkSoft,
          fontFamily: FONT_BODY,
          minHeight: "100%",
        }}
      >
        <p>No objective yet — your goal and stakes will appear here.</p>
      </div>
    );
  }

  // `data` is narrowed to QuestsPayload by the guard above.
  const spine = data;
  // Anchors keyed by id so each quest can surface its own resolution inline.
  const anchorsById = new Map(spine.quest_anchors.map((a) => [a.anchor_id, a]));

  return (
    <div
      role="region"
      aria-label={PANEL_LABEL}
      data-testid="quests-panel"
      className="p-4"
      style={{
        background: FOLIO.paper,
        color: FOLIO.ink,
        fontFamily: FONT_BODY,
        minHeight: "100%",
      }}
    >
      {spine.active_stakes.trim() !== "" && (
        <div
          data-testid="quests-stakes"
          style={{
            borderBottom: `1px solid ${FOLIO.rule}`,
            paddingBottom: "0.5rem",
            marginBottom: "0.5rem",
          }}
        >
          <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
            At stake
          </div>
          <div>{spine.active_stakes}</div>
        </div>
      )}

      {spine.quest_log.map((q) => {
        const anchor = q.anchor_id ? anchorsById.get(q.anchor_id) : undefined;
        return (
          <div
            key={q.quest_id}
            data-testid="quests-entry"
            style={{ borderBottom: `1px solid ${FOLIO.rule}`, padding: "0.5rem 0" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, flex: 1 }}>{q.title}</span>
              <span style={{ color: FOLIO.inkSoft, fontStyle: "italic" }}>
                {q.status}
              </span>
            </div>
            {q.objective ? (
              <div style={{ color: FOLIO.inkSoft }}>{q.objective}</div>
            ) : null}
            {anchor && anchor.resolution ? (
              <div style={{ color: FOLIO.accent, marginTop: "0.25rem" }}>
                Resolves: {anchor.resolution}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Anchors with no owning quest in the log — surfaced explicitly rather
          than silently dropped (mirrors the server's No-Silent-Fallbacks note). */}
      {spine.quest_anchors
        .filter((a) => !a.quest_id)
        .map((a) => (
          <div
            key={a.anchor_id}
            data-testid="quests-orphan-anchor"
            style={{ padding: "0.5rem 0", color: FOLIO.inkSoft }}
          >
            <span style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
              Anchor
            </span>{" "}
            {a.anchor_id}
            {a.resolution ? ` — ${a.resolution}` : ""}
          </div>
        ))}
    </div>
  );
}
