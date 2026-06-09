// Story 100-11 (Phase 3) — dedicated Timeline renderer.
//
// Consumes the server `timeline` section (`build_timeline_section`). The server
// has ALREADY ordered `entries` (dated spine first per `sort_mode`, undated
// last); the client renders the array verbatim and MUST NOT re-sort — that is
// the load-bearing "respecting sort_mode" behavior. `preamble` (world history
// prose) and per-entry `temporal` are nullable and are omitted when absent
// (never the literal "null").

import type { TimelineSectionData } from "@/types/reference";

export function TimelineSection({ section }: { section: TimelineSectionData }) {
  return (
    <section className="reference-section reference-section--timeline">
      <h2 className="reference-section__label">{section.label}</h2>
      {section.preamble !== null && (
        <p className="timeline-section__preamble">{section.preamble}</p>
      )}
      <ol className="timeline-section__entries">
        {section.entries.map((entry) => (
          <li key={entry.slug} className="timeline-section__entry">
            {entry.temporal !== null && (
              <span className="timeline-section__temporal">{entry.temporal}</span>
            )}
            <h3 className="timeline-section__name">{entry.name}</h3>
            <p className="timeline-section__summary">{entry.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
