// Dedicated Timeline renderer (Story 100-11, polished by the 2026-06-09
// redesign).
//
// Consumes the server `timeline` section (`build_timeline_section`). The
// server has ALREADY ordered `entries` (dated spine first per `sort_mode`,
// undated last); the client renders the array verbatim and MUST NOT re-sort —
// that is the load-bearing "respecting sort_mode" behavior. `preamble` (world
// history prose) is nullable and omitted when absent. A null per-entry
// `temporal` renders the era label "Within living memory" (redesign decision)
// so every spine entry keeps its diamond marker — never the literal "null".

import type { TimelineSectionData } from "@/types/reference";

// Headless renderer (2026-06-17 shell-accordion refactor): the section wrapper
// (`section-{id}` deep-link anchor) and the `.reference-section__label` heading
// now live on the shell's section accordion (ReferenceDocument). This component
// returns ONLY its inner body so it can drop into an accordion panel without
// double chrome.
export function TimelineSection({ section }: { section: TimelineSectionData }) {
  return (
    <div className="reference-section--timeline">
      {section.preamble !== null && (
        <p className="timeline-section__preamble">{section.preamble}</p>
      )}
      <ol className="timeline-section__entries">
        {section.entries.map((entry) => (
          <li key={entry.slug} className="timeline-section__entry">
            <span className="timeline-section__temporal">
              {entry.temporal !== null ? entry.temporal : "Within living memory"}
            </span>
            <h3 className="timeline-section__name">{entry.name}</h3>
            <p className="timeline-section__summary">{entry.summary}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
