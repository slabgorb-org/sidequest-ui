// Shared presentational shell for the reference pages.
//
// Story 100-8/100-11 established loading / error / dispatch; the 2026-06-09
// redesign bundle adds the wiki-style page shell: masthead (eyebrow · title ·
// dateline · dinkus), a sticky scroll-spied table of contents derived from the
// projection itself, and the cards-mode NodeTree treatment for generic
// sections.
//
// Contracts preserved: loading exposes an accessible `role="status"` node;
// error exposes `role="alert"` (AC4 — never a white screen); sections dispatch
// by id through SectionDispatch. The masthead renders only when the projection
// carries a `meta` block (an older server omits it; the page still renders).

import { useMemo } from "react";
import { SectionDispatch } from "@/components/reference/sections/SectionDispatch";
import type { ReferenceMeta, ReferenceSection } from "@/types/reference";
import { buildToc } from "./buildToc";
import { Masthead, type ReferenceDocType } from "./Masthead";
import { Toc } from "./Toc";
import { useScrollSpy } from "./useScrollSpy";
// The reference pages' entire rule sheet — every `reference-*` classname in
// this shell and the section components is defined here, consuming the genre
// tokens that useThemeTokens injects onto :root. This import is load-bearing:
// the stylesheet was orphaned (never imported, never committed) when the
// 100-12 cutover deleted the server-rendered HTML path, shipping unstyled
// lore/rules pages (2026-06-09).
import "@/styles/reference.css";

// The locked-in NodeTree treatment (design review 2026-06-09). `headings` and
// `ledger` remain in NodeTree for comparison work but production ships cards.
const MODE = "cards" as const;

export function ReferenceDocument({
  docType,
  loading,
  error,
  sections,
  meta,
}: {
  docType: ReferenceDocType;
  loading: boolean;
  error: string | null;
  sections: ReferenceSection[] | undefined;
  meta: ReferenceMeta | undefined;
}) {
  const tocItems = useMemo(() => buildToc(sections ?? [], MODE), [sections]);
  const activeId = useScrollSpy([sections]);

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
    <div className="reference-page">
      {meta !== undefined && <Masthead docType={docType} meta={meta} />}
      <div className="reference-layout">
        <Toc items={tocItems} activeId={activeId} />
        <main className="reference-document">
          {(sections ?? []).map((section) => (
            <SectionDispatch key={section.id} section={section} mode={MODE} />
          ))}
        </main>
      </div>
    </div>
  );
}
