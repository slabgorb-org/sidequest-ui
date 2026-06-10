// Story 100-8 (Phase 2) — session-free lore reference route (AC1 C2 / AC2 / AC4).
//
// `/reference/lore/:pack/:world` mounts with NO WebSocket session, NO
// GameStateProvider, NO auth, NO character selection in scope. It reads the
// route params and fetches the public lore projection over REST
// (`GET /reference/api/lore/{pack}/{world}`), then renders its generic sections
// via the shared ReferenceDocument / NodeTree.

import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ReferenceDocument } from "./ReferenceDocument";
import { useReferenceProjection } from "./useReferenceProjection";
import { useThemeTokens } from "./useThemeTokens";
import type { LoreProjection, ReferenceSection } from "@/types/reference";

// Display order of lore sections, by section id. The server emits sections in
// build order; *display* order is a client concern (this is the React SPA that
// owns the page layout). Map leads as the page header, then the authored content
// spine the table reads top-to-bottom. Any section whose id is not listed here
// (e.g. cultures, calendar, demographics, openings, locations) keeps its server
// order and trails the named block.
const LORE_SECTION_ORDER: readonly string[] = [
  "map",
  "world",
  "lore",
  "poi",
  "cast",
  "timeline",
  "history",
  "legends",
];

// Stable sort by display rank. Unlisted ids sort to the end; ties (including all
// unlisted sections) preserve the server's original order via the index tiebreak.
function orderLoreSections(
  sections: ReferenceSection[] | undefined,
): ReferenceSection[] | undefined {
  if (!sections) return sections;
  const rank = (id: string) => {
    const i = LORE_SECTION_ORDER.indexOf(id);
    return i === -1 ? LORE_SECTION_ORDER.length : i;
  };
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => rank(a.section.id) - rank(b.section.id) || a.index - b.index)
    .map(({ section }) => section);
}

export function ReferenceLorePage() {
  const { pack, world } = useParams<{ pack: string; world: string }>();
  const { data, loading, error } = useReferenceProjection<LoreProjection>(
    `/reference/api/lore/${pack}/${world}`,
  );

  // Session-free theme injection (C3): apply the projection's flat CSS-var
  // token dict to :root. Fed from the REST projection JSON, not the in-game
  // WebSocket theme_css channel — and cleaned up on unmount / pack switch.
  useThemeTokens(data?.theme);

  const sections = useMemo(() => orderLoreSections(data?.sections), [data?.sections]);

  return (
    <ReferenceDocument
      docType="lore"
      loading={loading}
      error={error}
      sections={sections}
      meta={data?.meta}
    />
  );
}
