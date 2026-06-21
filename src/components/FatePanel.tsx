import type { CSSProperties } from "react";
import type {
  FateAspectEntry,
  FateCharacterEntry,
  FateSkillEntry,
  FateStuntEntry,
} from "@/types/payloads";

// Folio palette — mirrors QuestsPanel / RelationshipsPanel / LocationPanel and
// the host CharacterPanel so every dock surface reads as the same artifact.
// Resolved via CSS custom properties from the injected genre theme (ADR-079):
// the imported design ("Fate Sheet.dc.html", 2026-06-20) hardcoded an
// Oz-parchment palette (#f4ecd4 paper, #c19a3a gold, #b0492f crimson); we map
// those roles onto theme tokens so the sheet reads parchment-and-gold in
// wry_whimsy/tea_and_murder but stays correctly themed in every other genre
// (No-Silent-Fallback: never a fixed palette that clashes with the page).
const FOLIO = {
  ink: "var(--card-foreground)",
  // Lift secondary text toward readable ink (UX review 2026-05-25 contrast
  // floor) while staying theme-driven — both ends resolve through ADR-079.
  inkSoft:
    "color-mix(in oklch, var(--card-foreground) 55%, var(--muted-foreground))",
  // Non-apex ladder numerals + open-consequence ticks: a touch softer than ink.
  inkFaint:
    "color-mix(in oklch, var(--card-foreground) 70%, var(--muted-foreground))",
  paper: "var(--card)",
  paper2: "var(--muted)",
  gold: "var(--primary)",
  goldFaint: "color-mix(in oklch, var(--primary) 42%, transparent)",
  goldWash: "color-mix(in oklch, var(--primary) 16%, transparent)",
  crimson: "var(--accent)",
  crimsonWash: "color-mix(in oklch, var(--accent) 8%, transparent)",
  crimsonRule: "color-mix(in oklch, var(--accent) 32%, transparent)",
  rule: "var(--border)",
} as const;

// Pirata One (blackletter display) is reserved for genuinely decorative
// surfaces — section numerals, skill-rung values, consequence slots, stunt
// names. EB Garamond carries everything that names a mechanic (it is already
// loaded across the full weight axis; the rugged --font-ui face is NOT loaded
// and would silently degrade — a No-Silent-Fallback violation).
const FONT_DISPLAY = "'Pirata One', serif";

// snake_case wire kind → display label. Canonical render order matches the
// story enumeration (high-concept / trouble / character / situation / boost /
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

// Per-kind visual weight from the design: the defining aspects (high concept /
// trouble) read large + italic with a crimson accent bar; the rest sit smaller
// with a gold bar. `consequence` aspects (filled-consequence text) keep the
// crimson weight — they are wounds, not flavor.
const KIND_BIG = new Set(["high_concept", "trouble", "consequence"]);
const KIND_CRIMSON = new Set(["high_concept", "trouble", "consequence"]);

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

// Several Fate-sheet sections render one small marker per wire-supplied count:
// fate-point tokens (one per `refresh`) and an aspect's free-invoke pips (one per
// `free_invokes`). Those counts ride the FATE_STATE payload, so a malformed/huge/
// non-finite value would allocate a pathological array — Array.from({ length: 1e9 })
// materializes a billion nodes and Array.from({ length: Infinity }) throws
// RangeError — a browser-tab DoS (Story 125-6, 118-2 Reviewer finding). EVERY such
// Array.from length goes through clampPipCount.
const MAX_PIP_COUNT = 12;

/** Clamp a wire-supplied marker count (fate-point tokens / free-invoke pips) to a
 *  sane, bounded value before it becomes an `Array.from` length. Accepts a possibly-
 *  missing wire value: `?? 0` defaults null/undefined to 0 (a malformed payload),
 *  Math.max floors negatives at 0, Math.min caps the huge/Infinity case at
 *  MAX_PIP_COUNT. A falsy-but-valid 0 stays 0. */
function clampPipCount(count: number | null | undefined): number {
  return Math.min(Math.max(0, count ?? 0), MAX_PIP_COUNT);
}

/** Crimson uppercase section header with optional right-aligned meta — the
 *  recurring band that opens every section of the sheet (FATE POINTS · THE
 *  LADDER · ASPECTS · …). */
function SectionLabel({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: "0.6rem",
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: FOLIO.crimson,
          fontWeight: 600,
        }}
      >
        {title}
      </span>
      {meta != null && (
        <span style={{ fontSize: 12, color: FOLIO.inkSoft, letterSpacing: "0.04em" }}>
          {meta}
        </span>
      )}
    </div>
  );
}

const SECTION_STYLE: CSSProperties = {
  padding: "0.85rem 0",
  borderBottom: `1px solid ${FOLIO.rule}`,
};

/** Fate-point header: a token row (one diamond per refresh, the available
 *  points filled), the big numeral, and a static guidance hint. READ-ONLY —
 *  the tokens are glyphs, not controls; spending a fate point flows through the
 *  conflict surface, not the sheet (the 2026-06-20 design import is a display
 *  restyle, so the prototype's clickable tokens are omitted, not rendered
 *  dead). */
function FatePoints({ points, refresh }: { points: number; refresh: number }) {
  // One token per point of Refresh; the first `points` read as available. The
  // count is clamped (Story 125-6): refresh is wire data, so a malformed/huge/
  // non-finite value must not allocate a pathological array (or throw on Infinity).
  const tokens = Array.from({ length: clampPipCount(refresh) }, (_, i) => i < points);
  const hint =
    points > 0
      ? "Spend to invoke an aspect or refuse a compel."
      : "Out of fate points — accept a compel to earn one back.";
  return (
    <div style={SECTION_STYLE}>
      <SectionLabel title="Fate Points" meta={`Refresh ${refresh}`} />
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.45rem" }}>
          {tokens.map((filled, i) => (
            <span
              key={i}
              data-testid="fate-point-token"
              data-filled={filled ? "true" : "false"}
              aria-hidden="true"
              style={{
                fontSize: 22,
                lineHeight: 1,
                color: filled ? FOLIO.gold : FOLIO.goldFaint,
              }}
            >
              {filled ? "♦" : "◇"}
            </span>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.3rem",
            marginLeft: "auto",
            whiteSpace: "nowrap",
          }}
        >
          <span
            data-testid="fate-points"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 30,
              color: FOLIO.ink,
              lineHeight: 1,
            }}
          >
            {points}
          </span>
          <span style={{ fontSize: 12, color: FOLIO.inkSoft }}>of {refresh}</span>
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          color: FOLIO.inkSoft,
          fontStyle: "italic",
          marginTop: "0.55rem",
        }}
      >
        {hint}
      </div>
    </div>
  );
}

/** The Ladder: skills sorted high→low and grouped into rungs by rating. Each
 *  rung shows its signed value + ladder adjective once (apex rung in gold) and
 *  the skills at that rating as chips. */
function Ladder({ skills }: { skills: FateSkillEntry[] }) {
  if (skills.length === 0) return null;
  const sorted = [...skills].sort(
    (a, b) => b.rating - a.rating || a.name.localeCompare(b.name),
  );
  const maxRating = sorted[0].rating;
  const byRating = new Map<number, FateSkillEntry[]>();
  for (const s of sorted) {
    const list = byRating.get(s.rating) ?? [];
    list.push(s);
    byRating.set(s.rating, list);
  }
  const ratings = [...byRating.keys()].sort((a, b) => b - a);
  return (
    <div style={SECTION_STYLE}>
      <SectionLabel title="The Ladder" meta={`${skills.length} skills`} />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {ratings.map((rating) => {
          const group = byRating.get(rating) ?? [];
          const apex = rating === maxRating;
          // Skills at one rating share the adjective; take the first.
          const adjective = group[0]?.ladder ?? "";
          return (
            <div
              key={rating}
              data-testid="fate-rung"
              style={{ display: "flex", alignItems: "flex-start", gap: "0.8rem" }}
            >
              <div
                style={{
                  width: 52,
                  flex: "none",
                  textAlign: "right",
                  paddingTop: 1,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 20,
                    lineHeight: 1,
                    color: apex ? FOLIO.gold : FOLIO.inkFaint,
                  }}
                >
                  {formatRating(rating)}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                    color: FOLIO.inkSoft,
                    marginTop: 3,
                  }}
                >
                  {adjective.toUpperCase()}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  borderLeft: `1px solid ${FOLIO.rule}`,
                  paddingLeft: "0.8rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.4rem",
                  minHeight: 26,
                }}
              >
                {group.map((s) => (
                  <span
                    key={s.name}
                    data-testid="fate-skill"
                    style={{
                      fontSize: 13.5,
                      padding: "0.25rem 0.7rem",
                      lineHeight: 1.1,
                      color: FOLIO.ink,
                      background: apex ? FOLIO.goldWash : FOLIO.paper2,
                      border: `1px solid ${apex ? FOLIO.gold : FOLIO.rule}`,
                    }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Aspects grouped by kind, each rendered as an accent-barred card with its
 *  free-invoke pips. READ-ONLY — the design's per-aspect Invoke button is
 *  omitted (invoking spends a fate point and runs through the conflict surface;
 *  a button here would be a dead control). */
function Aspects({ aspects }: { aspects: FateAspectEntry[] }) {
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
    <div style={SECTION_STYLE}>
      <SectionLabel title="Aspects" />
      {kinds.map((kind) => {
        const crimson = KIND_CRIMSON.has(kind);
        const big = KIND_BIG.has(kind);
        const accent = crimson ? FOLIO.crimson : FOLIO.gold;
        return (
          <div key={kind} style={{ marginBottom: "0.8rem" }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: crimson ? FOLIO.crimson : FOLIO.inkSoft,
                marginBottom: "0.4rem",
              }}
            >
              {kindLabel(kind)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {(byKind.get(kind) ?? []).map((a, i) => (
                <div
                  key={`${kind}-${a.text}-${i}`}
                  data-testid="fate-aspect"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    background: FOLIO.paper2,
                    border: `1px solid ${FOLIO.rule}`,
                    borderLeft: `3px solid ${accent}`,
                    padding: "0.5rem 0.7rem",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: big ? 15.5 : 14.5,
                      fontStyle: big ? "italic" : "normal",
                      color: FOLIO.ink,
                      lineHeight: 1.25,
                    }}
                  >
                    {a.text}
                  </span>
                  {/* One pip per available free invoke (zero ⇒ no pips). The
                      count is clamped (Story 125-6): free_invokes is wire data,
                      so a malformed/huge/non-finite value must not allocate a
                      pathological array here. */}
                  {Array.from({ length: clampPipCount(a.free_invokes) }).map((_, pip) => (
                    <span
                      key={pip}
                      data-testid="fate-pip"
                      aria-label="free invoke"
                      style={{
                        width: "0.55rem",
                        height: "0.55rem",
                        flex: "none",
                        borderRadius: "50%",
                        background: FOLIO.gold,
                        boxShadow: `0 0 0 2px ${FOLIO.goldWash}`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Stress tracks (physical / mental). READ-ONLY — boxes are static; a checked
 *  box reads filled-gold, an open box reads as an empty slot. */
function Stress({ stress }: { stress: Record<string, { value: number; checked: boolean }[]> }) {
  const tracks = Object.entries(stress);
  if (tracks.length === 0) return null;
  return (
    <div style={SECTION_STYLE}>
      <SectionLabel title="Stress" />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {tracks.map(([track, boxes]) => (
          <div key={track} style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
            <span
              style={{
                width: 62,
                flex: "none",
                fontSize: 10.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: FOLIO.inkSoft,
              }}
            >
              {track}
            </span>
            <div style={{ display: "flex", gap: "0.45rem" }}>
              {boxes.map((b, i) => (
                <span
                  key={`${track}-${i}`}
                  data-testid="fate-stress-box"
                  data-checked={b.checked ? "true" : "false"}
                  style={{
                    width: "1.8rem",
                    height: "1.8rem",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    border: `1px solid ${b.checked ? FOLIO.gold : FOLIO.rule}`,
                    background: b.checked ? FOLIO.gold : FOLIO.paper2,
                    color: b.checked ? FOLIO.paper : FOLIO.inkSoft,
                  }}
                >
                  {b.value}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Consequence slots: label · absorption value · the consequence aspect text
 *  (or "open" when the slot is empty). Filled slots read in crimson. */
function Consequences({
  consequences,
}: {
  consequences: { level: string; value: number; filled: boolean; text: string }[];
}) {
  if (consequences.length === 0) return null;
  return (
    <div style={SECTION_STYLE}>
      <SectionLabel title="Consequences" />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {consequences.map((c) => (
          <div
            key={c.level}
            data-testid="fate-consequence"
            data-filled={c.filled ? "true" : "false"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.7rem",
              padding: "0.45rem 0.7rem",
              background: c.filled ? FOLIO.crimsonWash : FOLIO.paper2,
              border: `1px solid ${c.filled ? FOLIO.crimsonRule : FOLIO.rule}`,
              borderLeft: `3px solid ${c.filled ? FOLIO.crimson : FOLIO.goldFaint}`,
            }}
          >
            <span
              style={{
                width: 62,
                flex: "none",
                fontSize: 10.5,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: FOLIO.inkSoft,
              }}
            >
              {c.level}
            </span>
            <span
              style={{
                flex: "none",
                fontFamily: FONT_DISPLAY,
                fontSize: 15,
                color: c.filled ? FOLIO.crimson : FOLIO.goldFaint,
              }}
            >
              {formatRating(c.value)}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 14,
                color: c.filled ? FOLIO.ink : FOLIO.inkSoft,
                fontStyle: "italic",
                lineHeight: 1.2,
              }}
            >
              {c.filled ? c.text : "open"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One PC's Fate sheet — fate points + refresh, the ladder (skills grouped into
 * rungs), aspects grouped by kind, stress tracks, consequence slots, and
 * stunts. THE Fate-sheet renderer, mounted in the Character panel's Stats tab
 * (the standalone "Fate" dock tab and its FateWidget/FatePanel host were
 * removed in 126-26) — a Fate player sees their sheet where they look for it,
 * the Sebastien/Jade "show me the math in the player UI" mandate. Pure
 * presentational and READ-ONLY (restyled 2026-06-20 to the imported
 * "Fate Sheet.dc.html" design); covered by CharacterPanelFateSheet.test.tsx.
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
  return (
    <div
      data-testid="fate-character"
      style={{
        borderBottom: showDivider ? `1px solid ${FOLIO.rule}` : undefined,
        paddingBottom: showDivider ? "0.75rem" : undefined,
        marginBottom: showDivider ? "0.75rem" : undefined,
      }}
    >
      <FatePoints points={ch.fate_points} refresh={ch.refresh} />
      <Ladder skills={ch.skills ?? []} />
      <Aspects aspects={ch.aspects ?? []} />
      <Stress stress={ch.stress ?? {}} />
      <Consequences consequences={ch.consequences ?? []} />
      <FateStunts stunts={ch.stunts ?? []} />
    </div>
  );
}

/** Render a PC's Fate stunts (their special abilities under Fate). Returns null
 *  when there are none, so a sheet with no stunts draws no empty section. Shared
 *  by the FateCharacterSheet (Stats tab) and the Character panel's Abilities tab
 *  — under Fate the player's special abilities ARE their stunts, so the native
 *  class-move surface is replaced by this (playtest 150-2). */
export function FateStunts({ stunts }: { stunts: FateStuntEntry[] }) {
  if (stunts.length === 0) return null;
  return (
    <div
      data-testid="fate-stunts"
      style={{ padding: "0.85rem 0 0.25rem" }}
    >
      <SectionLabel title="Stunts" />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {stunts.map((st) => (
          <div
            key={st.name}
            data-testid="fate-stunt"
            style={{
              background: FOLIO.paper2,
              border: `1px solid ${FOLIO.rule}`,
              padding: "0.55rem 0.7rem",
            }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 16,
                color: FOLIO.ink,
                lineHeight: 1.1,
              }}
            >
              {st.name}
            </div>
            {st.description ? (
              <div
                style={{
                  fontSize: 13.5,
                  color: FOLIO.inkSoft,
                  lineHeight: 1.4,
                  marginTop: 3,
                }}
              >
                {st.description}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
