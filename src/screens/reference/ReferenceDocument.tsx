// Story 100-8 (Phase 2) — shared presentational shell for the reference pages.
// Story 100-11 (Phase 3) — widened to route every section through
// `SectionDispatch` so the dedicated POI / Cast / Timeline renderers are
// reachable from the production page, alongside the generic node-tree sections.
//
// Renders loading / error / content for a fetched projection. Loading exposes
// an accessible `role="status"` node; error exposes `role="alert"` (AC4 — never
// a white screen). Content dispatches each section by id: poi/cast/timeline get
// dedicated components, generic node-bearing sections fall back to NodeTree, and
// a not-yet-wired node-less section degrades to nothing.
//
// The 100-8 `section.node`-only filter — which silently dropped poi/cast/
// timeline (they carry `entries`/`members`, not a `node`) — is gone; the
// dispatch owns that decision now.

import { SectionDispatch } from "@/components/reference/sections/SectionDispatch";
import type { ReferenceSection } from "@/types/reference";

export function ReferenceDocument({
  loading,
  error,
  sections,
}: {
  loading: boolean;
  error: string | null;
  sections: ReferenceSection[] | undefined;
}) {
  if (loading) {
    return (
      <div role="status" aria-live="polite" className="reference-document reference-document--loading">
        Loading reference…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="reference-document reference-document--error">
        {error}
      </div>
    );
  }

  return (
    <div className="reference-document">
      {(sections ?? []).map((section) => (
        <SectionDispatch key={section.id} section={section} />
      ))}
    </div>
  );
}
