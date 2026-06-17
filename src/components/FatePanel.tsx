import type {
  FateAspectEntry,
  FateCharacterEntry,
  FateRollPayload,
  FateStatePayload,
} from "@/types/payloads";
import { FateDiceTray } from "@/dice/FateDiceTray";

// Folio palette — mirrors QuestsPanel / RelationshipsPanel / LocationPanel so
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

const PANEL_LABEL = "Fate sheet";

// Story 118-2 / ADR-144 F3b: the player-facing Fate sheet made legible. Renders,
// per PC: fate points (labeled), skills on the ladder (name + adjective +
// signed numeric), aspects grouped by kind with free-invoke pips, the stress
// tracks, and the four consequence slots (filled vs open). Plus the scene's
// situation aspects/boosts and the active conflict's participants by side.
// Read-only — no fate-point spending, no aspect invocation (later F3 stories).
// Structurally a sibling of QuestsPanel: a pure presentational component taking
// a typed `data` prop, with the empty-state branch first.
//
// THE mechanics-legibility surface for Sebastien/Jade (CLAUDE.md): every number
// carries a label. This is a player-UI mandate, not OTEL/GM observability.
export interface FatePanelProps {
  data: FateStatePayload | null;
  /**
   * Story 118-7 / ADR-144 F3g: the latest resolved 4dF roll. When present (and
   * the pack is Fate), the FateDiceTray mounts above the sheet so the table sees
   * the soloist's roll. Null/absent → no roll surface.
   */
  latestRoll?: FateRollPayload | null;
  /** The active pack's ruleset; the roll surface renders only when "fate"
   *  (FateDiceTray self-gates — never co-renders with the WN/native overlay). */
  ruleset?: string;
}

// snake_case wire kind → human display label. Canonical render order matches the
// story's enumeration (high-concept / trouble / character / situation / boost /
// consequence). An unknown kind falls back to a title-cased form rather than
// being dropped (No-Silent-Fallbacks — surface it).
const KIND_LABELS: Record<string, string> = {
  high_concept: "High Concept",
  trouble: "Trouble",
  character: "Character",
  situation: "Situation",
  boost: "Boost",
  consequence: "Consequence",
};
const KIND_ORDER = [
  "high_concept",
  "trouble",
  "character",
  "situation",
  "boost",
  "consequence",
];

function kindLabel(kind: string): string {
  return (
    KIND_LABELS[kind] ??
    kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Signed ladder value: "+4" for non-negative, "-2" for negative — the Fate
 *  ladder is signed and the sign is load-bearing for the player. */
function formatRating(rating: number): string {
  return rating >= 0 ? `+${rating}` : `${rating}`;
}

/** Render a list of aspects grouped by kind, each with its free-invoke pips.
 *  Shared by the per-PC character aspects and the scene aspects. */
function AspectGroups({ aspects }: { aspects: FateAspectEntry[] }) {
  if (aspects.length === 0) return null;
  // Group by kind, preserving canonical order; unknown kinds trail in
  // first-seen order so nothing is silently dropped.
  const byKind = new Map<string, FateAspectEntry[]>();
  for (const a of aspects) {
    const list = byKind.get(a.kind) ?? [];
    list.push(a);
    byKind.set(a.kind, list);
  }
  const kinds = [
    ...KIND_ORDER.filter((k) => byKind.has(k)),
    ...[...byKind.keys()].filter((k) => !KIND_ORDER.includes(k)),
  ];
  return (
    <>
      {kinds.map((kind) => (
        <div key={kind} style={{ marginTop: "0.4rem" }}>
          <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
            {kindLabel(kind)}
          </div>
          {(byKind.get(kind) ?? []).map((a, i) => (
            <div
              key={`${kind}-${a.text}-${i}`}
              data-testid="fate-aspect"
              style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}
            >
              <span style={{ flex: 1 }}>{a.text}</span>
              {/* One pip per available free invoke (the invoke control reads
                  this count in a later story). Zero invokes → no pips. */}
              {Array.from({ length: a.free_invokes }).map((_, pip) => (
                <span
                  key={pip}
                  data-testid="fate-pip"
                  aria-label="free invoke"
                  style={{
                    display: "inline-block",
                    width: "0.55rem",
                    height: "0.55rem",
                    borderRadius: "50%",
                    background: FOLIO.accent,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * One PC's Fate sheet — fate points + refresh, ladder skills (name + adjective +
 * signed rating), aspects grouped by kind, stress tracks, and consequence slots.
 * Extracted from FatePanel's per-character block (playtest 2026-06-17) so the
 * SAME renderer powers both the dock FateWidget AND the in-game Character panel's
 * Stats tab — a Fate player must see their sheet where they look for it, not only
 * in a separate dock tab (the Sebastien/Jade "show me the math in the player UI"
 * mandate). Pure presentational; markup is byte-identical to the prior inline
 * block so the existing FatePanel tests still cover it.
 *
 * `showDivider` draws the inter-PC separator rule — true when FatePanel stacks
 * several PCs, false when the Character panel renders a single sheet (no trailing
 * rule under one sheet).
 */
export function FateCharacterSheet({
  character,
  showDivider = true,
}: {
  character: FateCharacterEntry;
  showDivider?: boolean;
}) {
  const ch = character;
  const skills = ch.skills ?? [];
  const aspects = ch.aspects ?? [];
  const stress = ch.stress ?? {};
  const consequences = ch.consequences ?? [];
  return (
    <div
      data-testid="fate-character"
      style={{
        borderBottom: showDivider ? `1px solid ${FOLIO.rule}` : undefined,
        paddingBottom: "0.75rem",
        marginBottom: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1.1rem", flex: 1 }}>
          {ch.name}
        </span>
        <span data-testid="fate-points">Fate Points: {ch.fate_points}</span>
        <span style={{ color: FOLIO.inkSoft }}>(Refresh {ch.refresh})</span>
      </div>

      {skills.length > 0 && (
        <div style={{ marginTop: "0.4rem" }}>
          <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
            Skills
          </div>
          {skills.map((s) => (
            <div
              key={s.name}
              data-testid="fate-skill"
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "0.5rem",
              }}
            >
              <span style={{ flex: 1 }}>{s.name}</span>
              <span style={{ color: FOLIO.inkSoft }}>{s.ladder}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatRating(s.rating)}
              </span>
            </div>
          ))}
        </div>
      )}

      <AspectGroups aspects={aspects} />

      {Object.keys(stress).length > 0 && (
        <div style={{ marginTop: "0.4rem" }}>
          <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
            Stress
          </div>
          {Object.entries(stress).map(([track, boxes]) => (
            <div
              key={track}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <span style={{ textTransform: "capitalize", color: FOLIO.inkSoft }}>
                {track}
              </span>
              {boxes.map((b, i) => (
                <span
                  key={`${track}-${i}`}
                  data-testid="fate-stress-box"
                  data-checked={b.checked ? "true" : "false"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "1.4rem",
                    height: "1.4rem",
                    border: `1px solid ${FOLIO.rule}`,
                    background: b.checked ? FOLIO.accent : "transparent",
                    color: b.checked ? FOLIO.paper : FOLIO.ink,
                  }}
                >
                  {b.value}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {consequences.length > 0 && (
        <div style={{ marginTop: "0.4rem" }}>
          <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
            Consequences
          </div>
          {consequences.map((c) => (
            <div
              key={c.level}
              data-testid="fate-consequence"
              data-filled={c.filled ? "true" : "false"}
              style={{ color: c.filled ? FOLIO.ink : FOLIO.inkSoft }}
            >
              <span style={{ textTransform: "capitalize" }}>{c.level}</span> (
              {c.value})
              {c.filled ? `: ${c.text}` : " — open"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FatePanel({ data, latestRoll, ruleset }: FatePanelProps) {
  const characters = data?.characters ?? [];
  if (!data || characters.length === 0) {
    return (
      <div
        role="region"
        aria-label={PANEL_LABEL}
        data-testid="fate-empty"
        className="p-6"
        style={{
          background: FOLIO.paper,
          color: FOLIO.inkSoft,
          fontFamily: FONT_BODY,
          minHeight: "100%",
        }}
      >
        <p>No Fate sheet yet — your aspects, skills, and fate points will appear here.</p>
      </div>
    );
  }

  const sceneAspects = data.scene_aspects ?? [];
  const conflict = data.conflict;

  return (
    <div
      role="region"
      aria-label={PANEL_LABEL}
      data-testid="fate-panel"
      className="p-4"
      style={{
        background: FOLIO.paper,
        color: FOLIO.ink,
        fontFamily: FONT_BODY,
        minHeight: "100%",
      }}
    >
      {/* Story 118-7 / ADR-144 F3g: the 4dF roll surface. Mounts only when a
          roll has arrived; FateDiceTray self-gates on ruleset==="fate" so it
          never co-renders with the WN/native ConfrontationOverlay. */}
      {latestRoll && (
        <FateDiceTray roll={latestRoll} ruleset={ruleset ?? ""} />
      )}

      {characters.map((ch) => (
        <FateCharacterSheet key={ch.name} character={ch} />
      ))}

      {sceneAspects.length > 0 && (
        <div data-testid="fate-scene-aspects" style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
            Scene Aspects
          </div>
          <AspectGroups aspects={sceneAspects} />
        </div>
      )}

      {conflict && conflict.active && (
        <div data-testid="fate-conflict">
          <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>
            Conflict
          </div>
          {conflict.participants.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}
            >
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ color: FOLIO.inkSoft, textTransform: "capitalize" }}>
                {p.side}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
