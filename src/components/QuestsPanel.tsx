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
  // Quest ids present in the log — used to detect anchors whose owning quest is
  // absent (a dangling reference), so they are surfaced rather than dropped.
  const loggedQuestIds = new Set(spine.quest_log.map((q) => q.quest_id));

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
            {/* Story 117-7: the discovered lore cohered under this quest — the
                "what I've learned about this job" picture the playgroup was
                missing (server projection landed in 117-5). Defensive `?? []`
                tolerates a version-skew wire entry that omits the field; the
                block is suppressed entirely when nothing is learned. Keyed on
                fact_id (the server dedup key), never the array index. */}
            {(q.related_lore ?? []).length > 0 ? (
              <div
                data-testid="quests-lore"
                style={{ marginTop: "0.5rem" }}
              >
                <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
                  What I've learned about this job
                </div>
                {(q.related_lore ?? []).map((lore) => (
                  <div key={lore.fact_id} style={{ color: FOLIO.inkSoft }}>
                    {lore.content}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Anchors not attached to a rendered quest — either no owning quest
          (quest_id null) OR a dangling reference (quest_id names a quest absent
          from quest_log, e.g. after a server-side prune or in a partial
          snapshot). Surfaced here rather than silently dropped — a quest anchor
          the player should see must never vanish without a trace
          (No-Silent-Fallbacks). */}
      {spine.quest_anchors
        .filter((a) => !a.quest_id || !loggedQuestIds.has(a.quest_id))
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
