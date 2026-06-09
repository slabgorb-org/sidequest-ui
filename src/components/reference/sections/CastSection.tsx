// Story 100-11 (Phase 3) — dedicated Cast renderer.
//
// Consumes the server `cast` section (`build_cast_section`). `portrait_url` is
// nullable: when null the member is still shown (name + details) but NO <img> is
// emitted — never a broken/empty-src image. Portrait URLs are already resolved
// server-side and rendered verbatim. `role`/`appearance` are nullable and are
// omitted when absent (never the literal "null").
//
// a11y: every portrait image carries alt text naming the cast member.

import type { CastSectionData } from "@/types/reference";

export function CastSection({ section }: { section: CastSectionData }) {
  return (
    <section className="reference-section reference-section--cast">
      <h2 className="reference-section__label">{section.label}</h2>
      <ul className="cast-section__list">
        {section.members.map((member) => (
          <li key={member.slug} className="cast-section__member">
            {member.portrait_url !== null && (
              <img
                className="cast-section__portrait"
                src={member.portrait_url}
                alt={member.name}
              />
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
