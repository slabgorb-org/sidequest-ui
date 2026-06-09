// Story 100-8 (Phase 2) — shared presentational shell for the reference pages.
//
// Renders loading / error / content for a fetched projection. Loading exposes
// an accessible `role="status"` node; error exposes `role="alert"` (AC4 — never
// a white screen). Content maps each generic `{id, label, node}` section to a
// labelled block rendered by the generic NodeTree.
//
// Map/Cast/POI/Timeline sections are Phase 3 (100-10+) and OUT of scope here —
// any section without a generic `node` is skipped rather than rendered.

import { NodeTree } from "@/components/reference/NodeTree";
import type { GenericSection } from "@/types/reference";

export function ReferenceDocument({
  loading,
  error,
  sections,
}: {
  loading: boolean;
  error: string | null;
  sections: GenericSection[] | undefined;
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
      {(sections ?? [])
        // Only generic node-bearing sections render in this phase.
        .filter((section) => section && section.node)
        .map((section) => (
          <section key={section.id} className="reference-section">
            <h2 className="reference-section__label">{section.label}</h2>
            <NodeTree node={section.node} />
          </section>
        ))}
    </div>
  );
}
