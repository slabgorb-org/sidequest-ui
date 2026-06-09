// Story 100-8 (Phase 2) — session-free lore reference route (AC1 C2 / AC2 / AC4).
//
// `/reference/lore/:pack/:world` mounts with NO WebSocket session, NO
// GameStateProvider, NO auth, NO character selection in scope. It reads the
// route params and fetches the public lore projection over REST
// (`GET /reference/api/lore/{pack}/{world}`), then renders its generic sections
// via the shared ReferenceDocument / NodeTree.

import { useParams } from "react-router-dom";
import { ReferenceDocument } from "./ReferenceDocument";
import { useReferenceProjection } from "./useReferenceProjection";
import { useThemeTokens } from "./useThemeTokens";
import type { LoreProjection } from "@/types/reference";

export function ReferenceLorePage() {
  const { pack, world } = useParams<{ pack: string; world: string }>();
  const { data, loading, error } = useReferenceProjection<LoreProjection>(
    `/reference/api/lore/${pack}/${world}`,
  );

  // Session-free theme injection (C3): apply the projection's flat CSS-var
  // token dict to :root. Fed from the REST projection JSON, not the in-game
  // WebSocket theme_css channel — and cleaned up on unmount / pack switch.
  useThemeTokens(data?.theme);

  return <ReferenceDocument loading={loading} error={error} sections={data?.sections} />;
}
