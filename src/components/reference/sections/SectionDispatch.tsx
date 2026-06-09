// Story 100-11 (Phase 3) — section dispatch.
//
// Routes a projected reference section to its renderer by `id`:
//   - "poi"      → PoiSection
//   - "cast"     → CastSection
//   - "timeline" → TimelineSection
//   - any other section carrying a generic `node` → NodeTree (the 100-8 path,
//     wrapped in the same labelled <section> the shell used to emit)
//   - an unknown section WITHOUT a node (e.g. the not-yet-wired "map" section)
//     → render nothing, never crash. Its own future story wires it.
//
// This kills the 100-8 `section.node`-only filter that silently dropped
// poi/cast/timeline (which carry `entries`/`members`, not a `node`).

import { NodeTree } from "@/components/reference/NodeTree";
import { CastSection } from "@/components/reference/sections/CastSection";
import { PoiSection } from "@/components/reference/sections/PoiSection";
import { TimelineSection } from "@/components/reference/sections/TimelineSection";
import type {
  CastSectionData,
  PoiSectionData,
  ReferenceSection,
  TimelineSectionData,
} from "@/types/reference";

export function SectionDispatch({ section }: { section: ReferenceSection }) {
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
          <section className="reference-section">
            <h2 className="reference-section__label">{section.label}</h2>
            <NodeTree node={section.node} />
          </section>
        );
      }
      return null;
  }
}
