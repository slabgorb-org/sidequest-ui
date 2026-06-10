// Story 100-11 (Phase 3) — dedicated Points of Interest renderer.
//
// Consumes the server `poi` section (`build_poi_section`). Each entry's
// `image_url` is a resolved R2 landscape URL (always present — the server only
// projects a POI whose art is on R2). `region`/`description` are nullable and
// are simply omitted when absent (never rendered as the literal "null").
//
// a11y: every landscape image carries alt text naming the POI.

import { slugify } from "@/components/reference/nodeShape";
import type { PoiSectionData } from "@/types/reference";

export function PoiSection({ section }: { section: PoiSectionData }) {
  return (
    <section
      className="reference-section reference-section--poi"
      id={`section-${slugify(section.id)}`}
    >
      <h2 className="reference-section__label">{section.label}</h2>
      <ul className="poi-section__list">
        {section.entries.map((entry) => (
          <li key={entry.slug} className="poi-section__entry">
            <img
              className="poi-section__image"
              src={entry.image_url}
              alt={entry.name}
            />
            <h3 className="poi-section__name">{entry.name}</h3>
            {entry.region !== null && (
              <p className="poi-section__region">{entry.region}</p>
            )}
            {entry.description !== null && (
              <p className="poi-section__description">{entry.description}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
