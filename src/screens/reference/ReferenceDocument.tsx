// Shared presentational shell for the reference pages.
//
// 2026-06-17 shell-accordion refactor: the WHOLE page is brought "up to par"
// with the SRD chapter accordion — every top-level section is a collapsible
// panel in ONE controlled section-level `<Accordion multiple>`, all COLLAPSED by
// default, so the page is ~1 scannable screen and the reader expands what they
// want. The section chrome (the `section-{slug}` deep-link anchor + the
// `.reference-section__label` heading) lives HERE on the accordion item/trigger;
// each section renderer (SectionDispatch) returns only its inner body so there
// is exactly ONE element per `section-{id}`.
//
// TOC navigation is the make-or-break with everything collapsed: the open-state
// is lifted here as controlled state (`openSections` / `openChapters`) so a TOC
// click can OPEN the section that contains the anchor (and, for SRD chapter
// sub-links, the nested chapter), then scroll to it. See `handleTocNavigate`.
//
// Contracts preserved: loading exposes `role="status"`; error exposes
// `role="alert"` (AC4 — never a white screen); masthead renders only when the
// projection carries `meta`. Section labels stay <h2> (base-ui's <h3> Header is
// swapped to <h2> via the `render` prop) so existing heading/label queries and
// the lore section-ordering check still hold.

import { useCallback, useMemo, useState } from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem } from "@/components/ui/accordion";
import { SectionDispatch } from "@/components/reference/sections/SectionDispatch";
import { isRenderableSection } from "@/components/reference/sections/sectionShape";
import { slugify } from "@/components/reference/nodeShape";
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

const RULESET_SECTION_ID = "ruleset_reference";

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
  const activeId = useScrollSpy([sections, loading, error]);

  // Lifted, controlled open-state — empty by default = all collapsed.
  // `openSections` holds `section-{slug}` ids; `openChapters` holds SRD chapter
  // anchors so a TOC chapter sub-link can open the nested chapter too.
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [openChapters, setOpenChapters] = useState<string[]>([]);

  // Only renderable sections become accordion items (a node-less unknown section
  // produces no body and must not create an empty item).
  const renderable = useMemo(
    () => (sections ?? []).filter(isRenderableSection),
    [sections],
  );

  // Map a TOC anchor (a `section-{slug}` id OR a child anchor like an SRD chapter
  // anchor / a NodeTree subsection anchor) to the `section-{slug}` item that
  // contains it.
  const sectionItemForAnchor = useCallback(
    (anchor: string): string | null => {
      const direct = renderable.find((s) => `section-${slugify(s.id)}` === anchor);
      if (direct) return `section-${slugify(direct.id)}`;
      const ruleset = renderable.find((s) => s.id === RULESET_SECTION_ID);
      if (ruleset && "chapters" in ruleset && ruleset.chapters.some((c) => c.anchor === anchor)) {
        return `section-${slugify(ruleset.id)}`;
      }
      // Generic NodeTree subsection anchors are `{slug(sectionId)}--{key}`.
      const generic = renderable.find((s) => anchor.startsWith(`${slugify(s.id)}--`));
      if (generic) return `section-${slugify(generic.id)}`;
      return null;
    },
    [renderable],
  );

  const isChapterAnchor = useCallback(
    (anchor: string): boolean => {
      const ruleset = renderable.find((s) => s.id === RULESET_SECTION_ID);
      return Boolean(
        ruleset && "chapters" in ruleset && ruleset.chapters.some((c) => c.anchor === anchor),
      );
    },
    [renderable],
  );

  // A TOC click must (a) open the containing section, (b) for an SRD chapter
  // sub-link open the nested chapter, then (c) scroll to the anchor. Bare
  // href="#…" can't expand a collapsed panel, so the TOC delegates here.
  const handleTocNavigate = useCallback(
    (anchor: string) => {
      const sectionItem = sectionItemForAnchor(anchor);
      if (sectionItem) {
        setOpenSections((prev) => (prev.includes(sectionItem) ? prev : [...prev, sectionItem]));
      }
      if (isChapterAnchor(anchor)) {
        setOpenChapters((prev) => (prev.includes(anchor) ? prev : [...prev, anchor]));
      }
      // Scroll after the panel has had a chance to mount. The section item id is
      // always present (it rides the always-mounted AccordionItem); a sub-anchor
      // only exists once its panel mounts, so retry across a couple of frames.
      const scrollTo = () => {
        const el = document.getElementById(anchor);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          return true;
        }
        return false;
      };
      if (!scrollTo()) {
        requestAnimationFrame(() => {
          if (!scrollTo()) requestAnimationFrame(scrollTo);
        });
      }
    },
    [sectionItemForAnchor, isChapterAnchor],
  );

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
        <Toc items={tocItems} activeId={activeId} onNavigate={handleTocNavigate} />
        <main className="reference-document">
          <Accordion
            multiple
            value={openSections}
            onValueChange={(v) => setOpenSections(v as string[])}
            className="reference-section-accordion"
          >
            {renderable.map((section) => {
              const sectionAnchor = `section-${slugify(section.id)}`;
              const isRuleset = section.id === RULESET_SECTION_ID;
              return (
                <AccordionItem
                  key={section.id}
                  value={sectionAnchor}
                  id={sectionAnchor}
                  data-toc-anchor={sectionAnchor}
                  className="reference-section reference-section--accordion-item"
                >
                  {/* base-ui Header defaults to <h3>; render as <h2> so section
                      labels stay h2 (heading/label queries + lore ordering). */}
                  <AccordionPrimitive.Header
                    render={<h2 className="reference-section__label" />}
                  >
                    <AccordionPrimitive.Trigger
                      data-slot="accordion-trigger"
                      className="reference-section__trigger"
                    >
                      <span className="reference-section__trigger-label">{section.label}</span>
                      <ChevronDownIcon className="reference-section__chevron" aria-hidden="true" />
                    </AccordionPrimitive.Trigger>
                  </AccordionPrimitive.Header>
                  <AccordionContent>
                    {isRuleset ? (
                      <SectionDispatch
                        section={section}
                        mode={MODE}
                        openChapters={openChapters}
                        onChaptersChange={setOpenChapters}
                      />
                    ) : (
                      <SectionDispatch section={section} mode={MODE} />
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </main>
      </div>
    </div>
  );
}
