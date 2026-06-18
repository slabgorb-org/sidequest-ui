// sidequest-ui/src/components/reference/sections/RulesDocument.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { slugify } from "@/components/reference/nodeShape";
import type { RulesDocumentSection } from "@/types/reference";

export function RulesDocument({ section }: { section: RulesDocumentSection }) {
  return (
    <section
      className="reference-section reference-section--rules-document"
      id={`section-${slugify(section.id)}`}
    >
      <h2 className="reference-section__label">{section.label}</h2>
      {section.chapters.map((chapter) => (
        <article key={chapter.anchor} id={chapter.anchor} className="rules-document__chapter">
          <h3 className="rules-document__chapter-title">{chapter.title}</h3>
          <div className="rules-document__body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapter.body_markdown}</ReactMarkdown>
          </div>
        </article>
      ))}
      <footer className="rules-document__provenance">
        <p>{section.provenance.attribution}</p>
      </footer>
    </section>
  );
}
