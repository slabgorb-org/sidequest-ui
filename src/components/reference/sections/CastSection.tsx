// Dedicated Cast renderer (Story 100-11, polished by the 2026-06-09 redesign).
//
// Consumes the server `cast` section (`build_cast_section`). `portrait_url` is
// nullable: when null the member renders the brand-guide Folio placeholder
// (initials on Folio paper) instead of no image — the card grid keeps its
// shape and never emits a broken/empty-src <img>. Portrait URLs are already
// resolved server-side and rendered verbatim. `role`/`appearance` are nullable
// and are omitted when absent (never the literal "null").
//
// a11y: every portrait image carries alt text naming the cast member; the
// placeholder is aria-hidden (the name is adjacent text).

import { FolioPlaceholder } from "@/components/reference/FolioPlaceholder";
import { slugify } from "@/components/reference/nodeShape";
import type { CastSectionData } from "@/types/reference";

export function CastSection({ section }: { section: CastSectionData }) {
  return (
    <section
      className="reference-section reference-section--cast"
      id={`section-${slugify(section.id)}`}
    >
      <h2 className="reference-section__label">{section.label}</h2>
      <ul className="cast-section__list">
        {section.members.map((member) => (
          <li key={member.slug} className="cast-section__member">
            {member.portrait_url !== null ? (
              <img
                className="cast-section__portrait"
                src={member.portrait_url}
                alt={member.name}
              />
            ) : (
              <FolioPlaceholder name={member.name} />
            )}
            <h3 className="cast-section__name">{member.name}</h3>
            {member.role !== null && (
              <p className="cast-section__role">{member.role}</p>
            )}
            {member.appearance !== null && (
              <p className="cast-section__appearance">{member.appearance}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
