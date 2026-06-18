// sidequest-ui/src/components/reference/sections/RulesDocument.tsx
//
// ADR-149 Phase 1 — rules-document section renderer.
//
// Headless body (2026-06-17 shell-accordion refactor): the SRD is now ONE
// section-accordion item in the shell (ReferenceDocument), so this component no
// longer renders the `<section id="section-...">` wrapper or the
// `.reference-section__label` heading — the shell's section trigger carries the
// "The Rules of Fate Core" label and the `section-{id}` anchor. This component
// returns the section BODY: a nested full-width chapter accordion (one item per
// chapter, 7 for Fate Core) plus the provenance footer.
//
// Long-form verbatim prose reads badly in a narrow card column, so the chapter
// index is a vertical accordion — the trigger row is the chapter title (plus a
// muted preview of the chapter's H2/H3 section names); the expanded panel is the
// verbatim chapter body rendered at a comfortable reading measure (~70ch).
//
// Invariants:
//   - Verbatim SRD text: body_markdown is never paraphrased, trimmed, or altered.
//   - Progressive disclosure: a chapter's body is NOT in the DOM until its
//     accordion item is expanded (base-ui keepMounted defaults to false).
//   - Multiple open: `multiple` lets several chapters stay open independently —
//     the right pattern for a reference tool.
//   - Deep links: each chapter item carries id={chapter.anchor} so the TOC
//     chapter sub-links and the scroll-spy ([data-toc-anchor]) still work.
//   - Provenance: the attribution footer is rendered exactly as-is (legal).
//   - Heading hierarchy: chapter titles are h3 in the trigger. If the markdown
//     body leads with an h1 repeating the chapter title it is demoted to h3 via
//     react-markdown's `components` prop. One h1 per page (Masthead only).
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { RulesDocumentSection, RulesChapter } from "@/types/reference";

// ── Heading extractor ────────────────────────────────────────────────────────
// Derives section names from body_markdown by scanning ATX headings (## / ###).
// Returns at most 5 names so the trigger preview stays one line. This is purely
// presentational and must never invent content — it reads the actual headings.
function extractH2Names(markdown: string): string[] {
  const lines = markdown.split("\n");
  const names: string[] = [];
  for (const line of lines) {
    const m = line.match(/^#{2,3}\s+(.+)/);
    if (m) {
      names.push(m[1].trim());
      if (names.length >= 5) break;
    }
  }
  return names;
}

// ── Markdown component overrides ─────────────────────────────────────────────
// Demote a leading h1 in the markdown body (some SRD chapters re-state the
// chapter title as an h1). We map h1→h3 so the page has exactly one h1
// (the Masthead). h2 and below are untouched.
const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h3 className="rules-document__md-h1-demoted" {...props}>
      {children}
    </h3>
  ),
};

// ── Per-chapter accordion item ───────────────────────────────────────────────

function ChapterItem({ chapter }: { chapter: RulesChapter }) {
  const sectionNames = extractH2Names(chapter.body_markdown);

  return (
    <AccordionItem
      // The id carries the anchor for deep links and the TOC scroll-spy.
      // data-toc-anchor is the secondary selector used by useScrollSpy.
      value={chapter.anchor}
      id={chapter.anchor}
      data-toc-anchor={chapter.anchor}
      className="rules-document__item"
    >
      <AccordionTrigger className="rules-document__trigger">
        <span className="rules-document__trigger-text">
          <h3 className="rules-document__chapter-title">{chapter.title}</h3>
          {sectionNames.length > 0 && (
            <span className="rules-document__section-preview">
              {sectionNames.join(" · ")}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="rules-document__body prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {chapter.body_markdown}
          </ReactMarkdown>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ── Section body (headless) ───────────────────────────────────────────────────
// Returns the SRD section body only — the shell accordion owns the section
// wrapper, the `section-{id}` anchor, and the "The Rules of Fate Core" label.
//
// The chapter accordion is uncontrolled by default (standalone use: clicks
// toggle chapters). When the shell passes `openChapters` + `onChaptersChange`
// it becomes controlled, so a TOC chapter sub-link can open a chapter remotely.

export function RulesDocument({
  section,
  openChapters,
  onChaptersChange,
}: {
  section: RulesDocumentSection;
  openChapters?: string[];
  onChaptersChange?: (chapters: string[]) => void;
}) {
  const controlled = openChapters !== undefined;
  return (
    <div className="reference-section--rules-document">
      <Accordion
        multiple
        className="rules-document__accordion"
        {...(controlled
          ? {
              value: openChapters,
              onValueChange: (v) => onChaptersChange?.(v as string[]),
            }
          : {})}
      >
        {section.chapters.map((chapter) => (
          <ChapterItem key={chapter.anchor} chapter={chapter} />
        ))}
      </Accordion>
      <footer className="rules-document__provenance">
        <p>{section.provenance.attribution}</p>
      </footer>
    </div>
  );
}
