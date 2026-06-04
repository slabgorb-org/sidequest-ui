import type { CSSProperties } from "react";
import type { LocationDescriptionPayload } from "@/types/payloads";

export interface LocationPanelProps {
  data: LocationDescriptionPayload | null;
}

// Folio palette — mirrors CharacterPanel / InventoryPanel / KnowledgeJournal
// so all dock panels read as the same artifact. Resolved via CSS custom
// properties from useGenreTheme (ADR-079).
const FOLIO = {
  ink: "var(--card-foreground)",
  inkSoft: "var(--muted-foreground)",
  paper: "var(--card)",
  paper2: "var(--muted)",
  accent: "var(--accent)",
  primary: "var(--primary)",
  rule: "var(--border)",
} as const;

// ADR-079: track the genre's chrome archetype instead of hard-coding one
// face. useChromeArchetype sets --font-display / --font-body per archetype
// (parchment → Cinzel / EB Garamond, terminal → Orbitron / Share Tech Mono,
// rugged → Pirata One / Source Sans 3). The old hard-coded 'Pirata One'
// header rendered blackletter on the wry_whimsy parchment theme (off-theme;
// 2026-06-02 playtest). All three archetype display faces are loaded
// (index.html), so var() resolution is safe; the literal fallback only
// applies pre-archetype. NB: --font-ui is deliberately NOT used here — its
// rugged value ('Oswald') is unloaded and degrades to Impact (see
// CharacterPanel's No-Silent-Fallback note).
const FONT_DISPLAY = "var(--font-display, 'Pirata One', serif)";
const FONT_BODY = "var(--font-body, 'EB Garamond', serif)";

// Story 54-9 / ADR-109: this component intentionally renders prose ONLY.
// The LocationEntity manifest arrives in `data.entities` and is mirrored
// into state.currentLocation.entities for server-side debugging and
// future operator surfaces, but rendering the manifest as clickable
// entries is a Zork-Problem violation (CLAUDE.md doctrine; spec §6.1
// "Reinforced exclusion"). Do not add entity chips here.

export function LocationPanel({ data }: LocationPanelProps) {
  if (!data) {
    return (
      <div
        data-testid="location-empty"
        className="p-6"
        style={{
          background: FOLIO.paper,
          color: FOLIO.inkSoft,
          fontFamily: FONT_BODY,
          minHeight: "100%",
        }}
      >
        <p>Gathering your bearings…</p>
      </div>
    );
  }

  const baseParagraphs = splitParagraphs(data.prose);
  const overlayParagraphs = data.overlays
    .map((o) => o.prose_suffix)
    .filter((s) => s.length > 0)
    .flatMap(splitParagraphs);

  const overlayTooltip = data.overlays.map((o) => o.encounter_id).join(", ");

  return (
    <div
      data-testid="location-panel"
      className="p-6"
      style={{
        background: FOLIO.paper,
        color: FOLIO.ink,
        fontFamily: FONT_BODY,
        minHeight: "100%",
      }}
    >
      <header
        data-testid="location-header"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: "1.4rem",
          color: FOLIO.ink,
          borderBottom: `1px solid ${FOLIO.rule}`,
          paddingBottom: "0.5rem",
          marginBottom: "0.75rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        {data.reference_url ? (
          // Story 63-6: deep-link the region header into the /reference/lore
          // wiki (mirrors the CharacterSheet class-subtitle anchor). Plain
          // text when no anchor exists.
          <a
            href={data.reference_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: FOLIO.ink, textDecoration: "underline" }}
          >
            {regionDisplayName(data)}
          </a>
        ) : (
          <span>{regionDisplayName(data)}</span>
        )}
        {data.terrain ? (
          <span data-testid="location-terrain-badge" style={badgeStyle()}>
            {data.terrain}
          </span>
        ) : null}
        {data.overlays.length > 0 ? (
          <span
            data-testid="location-overlay-pip"
            title={`Overlay active — ${overlayTooltip}`}
            style={pipStyle()}
          >
            ● Overlay active
          </span>
        ) : null}
      </header>

      {data.poi_image_url ? (
        // POI landscape for the region. The server builds the URL from the
        // region_id verbatim; a region whose art isn't rendered yet 404s, so
        // we hide the <img> on error rather than show a broken-image glyph
        // (graceful degradation to text-only — no broken img).
        <img
          data-testid="location-poi-image"
          src={data.poi_image_url}
          alt={regionDisplayName(data)}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          style={{
            width: "100%",
            borderRadius: "4px",
            border: `1px solid ${FOLIO.rule}`,
            marginBottom: "0.75rem",
            display: "block",
          }}
        />
      ) : null}

      <section data-testid="location-base-prose">
        {baseParagraphs.map((p, i) => (
          <p
            key={`base-${i}`}
            data-testid={`location-prose-paragraph-${i}`}
            style={paragraphStyle()}
          >
            {p}
          </p>
        ))}
      </section>

      {overlayParagraphs.length > 0 ? (
        <section
          data-testid="location-overlay-prose"
          style={{
            marginTop: "0.75rem",
            paddingTop: "0.5rem",
            borderTop: `1px dashed ${FOLIO.rule}`,
          }}
        >
          {overlayParagraphs.map((p, i) => (
            <p
              key={`overlay-${i}`}
              style={{
                ...paragraphStyle(),
                fontStyle: "italic",
                color: FOLIO.accent,
              }}
            >
              {p}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function splitParagraphs(prose: string): string[] {
  if (!prose) return [];
  return prose
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// The header shows the authored, human-readable region/room name supplied
// by the server (LocationDescriptionPayload.region_name — e.g. "The Munchkin
// Country"). The snake_case region_id is NOT shown to the player; it stays
// the key for the lore deep-link (data.reference_url). When no authored name
// is available (old snapshots / nameless sources) we fall back to the slug
// rather than inventing one — an honest, if ugly, label beats a wrong guess.
function regionDisplayName(data: LocationDescriptionPayload): string {
  return data.region_name && data.region_name.length > 0
    ? data.region_name
    : data.region_id;
}

function badgeStyle(): CSSProperties {
  return {
    fontFamily: FONT_BODY,
    fontSize: "0.75rem",
    color: FOLIO.inkSoft,
    background: FOLIO.paper2,
    padding: "0.1rem 0.5rem",
    borderRadius: "999px",
    border: `1px solid ${FOLIO.rule}`,
    textTransform: "lowercase",
  };
}

function pipStyle(): CSSProperties {
  return {
    fontFamily: FONT_BODY,
    fontSize: "0.75rem",
    color: FOLIO.primary,
    background: FOLIO.paper2,
    padding: "0.1rem 0.5rem",
    borderRadius: "999px",
    border: `1px solid ${FOLIO.primary}`,
    cursor: "help",
  };
}

function paragraphStyle(): CSSProperties {
  return {
    margin: "0 0 0.6rem 0",
    lineHeight: 1.55,
    fontSize: "0.95rem",
  };
}
