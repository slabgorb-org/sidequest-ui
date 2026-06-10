// Section dispatch (Story 100-11, anchored for the 2026-06-09 redesign).
//
// Routes a projected reference section to its renderer by `id`:
//   - "poi"      → PoiSection
//   - "cast"     → CastSection
//   - "timeline" → TimelineSection
//   - any other section carrying a generic `node` → NodeTree (cards mode —
//     the locked-in treatment), wrapped in a labelled, ANCHORED <section>
//     (`section-{slug}`) so the TOC and deep links land on it
//   - an unknown section WITHOUT a node (e.g. the not-yet-wired "map" section)
//     → render nothing, never crash. Its own future story wires it.

import { NodeTree } from "@/components/reference/NodeTree";
import { slugify, type NodeTreeMode } from "@/components/reference/nodeShape";
import { CastSection } from "@/components/reference/sections/CastSection";
import { PoiSection } from "@/components/reference/sections/PoiSection";
import { TimelineSection } from "@/components/reference/sections/TimelineSection";
import type {
  CastSectionData,
  PoiSectionData,
  ReferenceSection,
  TimelineSectionData,
} from "@/types/reference";

export function SectionDispatch({
  section,
  mode = "cards",
}: {
  section: ReferenceSection;
  mode?: NodeTreeMode;
}) {
  switch (section.id) {
    case "poi":
      return <PoiSection section={section as PoiSectionData} />;
    case "cast":
      return <CastSection section={section as CastSectionData} />;
    case "timeline":
      return <TimelineSection section={section as TimelineSectionData} />;
    default:
      // Generic node-bearing section → NodeTree. A node-less unknown section
      // (a deferred type like "map") degrades to nothing, never a crash.
      if ("node" in section && section.node) {
        return (
          <section className="reference-section" id={`section-${slugify(section.id)}`}>
            <h2 className="reference-section__label">{section.label}</h2>
            <NodeTree node={section.node} depth={0} mode={mode} sectionId={section.id} />
          </section>
        );
      }
      return null;
  }
}
