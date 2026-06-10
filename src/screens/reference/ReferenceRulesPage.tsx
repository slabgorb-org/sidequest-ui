// Story 100-8 (Phase 2) — session-free rules reference route (AC1 C2 / AC2 / AC4).
//
// `/reference/rules/:pack` is the pack-tier rulebook — per-pack, NO :world. It
// mounts with no game session / WebSocket / auth, fetches the public rules
// projection over REST (`GET /reference/api/rules/{pack}`), and renders its
// generic sections via the shared ReferenceDocument / NodeTree.

import { useParams } from "react-router-dom";
import { ReferenceDocument } from "./ReferenceDocument";
import { useReferenceProjection } from "./useReferenceProjection";
import { useThemeTokens } from "./useThemeTokens";
import type { RulesProjection } from "@/types/reference";

export function ReferenceRulesPage() {
  const { pack } = useParams<{ pack: string }>();
  const { data, loading, error } = useReferenceProjection<RulesProjection>(
    `/reference/api/rules/${pack}`,
  );

  // Session-free theme injection (C3, 100-9 deferred finding): apply the rules
  // projection's flat CSS-var token dict to :root — same hook + unmount cleanup
  // as ReferenceLorePage. Fed from the REST projection JSON, never the in-game
  // WebSocket theme_css channel; /reference/rules/* must theme too.
  useThemeTokens(data?.theme);

  return (
    <ReferenceDocument
      docType="rules"
      loading={loading}
      error={error}
      sections={data?.sections}
      meta={data?.meta}
    />
  );
}
