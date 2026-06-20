import type {
  FateAspectEntry,
  FateCharacterEntry,
  FateStuntEntry,
} from "@/types/payloads";

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
 * THE Fate-sheet renderer, mounted in the Character panel's Stats tab (the
 * standalone "Fate" dock tab and its FateWidget/FatePanel host were removed in
 * 126-26) — a Fate player sees their sheet where they look for it, the
 * Sebastien/Jade "show me the math in the player UI" mandate. Pure
 * presentational; covered by CharacterPanelFateSheet.test.tsx.
 *
 * `showDivider` draws the inter-PC separator rule — true when several PCs stack,
 * false when the Character panel renders a single sheet (no trailing rule under
 * one sheet).
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
  const stunts = ch.stunts ?? [];
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

      <FateStunts stunts={stunts} />
    </div>
  );
}

/** Render a PC's Fate stunts (their special abilities under Fate). Returns null
 *  when there are none, so a sheet with no stunts draws no empty section. Shared by
 *  the FateCharacterSheet (Stats tab) and the Character panel's Abilities tab —
 *  under Fate the player's special abilities ARE their stunts, so the native
 *  class-move surface is replaced by this (playtest 150-2). */
export function FateStunts({ stunts }: { stunts: FateStuntEntry[] }) {
  if (stunts.length === 0) return null;
  return (
    <div data-testid="fate-stunts" style={{ marginTop: "0.4rem" }}>
      <div style={{ fontFamily: FONT_DISPLAY, color: FOLIO.ink }}>Stunts</div>
      {stunts.map((st) => (
        <div key={st.name} data-testid="fate-stunt" style={{ marginTop: "0.15rem" }}>
          <span style={{ fontWeight: 600 }}>{st.name}</span>
          {st.description ? (
            <span style={{ color: FOLIO.inkSoft }}>{` — ${st.description}`}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
