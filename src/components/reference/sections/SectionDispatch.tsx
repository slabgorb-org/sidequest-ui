// Section dispatch (Story 100-11; headless for the 2026-06-17 shell-accordion
// refactor).
//
// Routes a projected reference section to its renderer by `id` and returns ONLY
// the section's inner BODY — the section wrapper (`section-{slug}` deep-link
// anchor) and the `.reference-section__label` heading now live on the shell's
// section accordion (ReferenceDocument), so each renderer drops into an accordion
// panel without emitting double chrome:
//   - "poi"      → PoiSection
//   - "cast"     → CastSection
//   - "timeline" → TimelineSection
//   - "map"      → MapSection (Story 104-3 / M-C — adapts the server
//     `{regions, edges, pins, starting_region}` to the shared CartographyMap;
//     completes story 100-12's dropped lore-Map seam)
//   - "ruleset_reference" → RulesDocument (its own nested chapter accordion)
//   - "archetypes" → ArchetypesSection (each archetype is its own collapsible
//     accordion item; the deep per-archetype block is the on-demand body)
//   - any other section carrying a generic `node` → NodeTree (cards mode —
//     the locked-in treatment)
//   - an unknown section WITHOUT a node → render nothing, never crash. Its own
//     future story wires it.

import { NodeTree } from "@/components/reference/NodeTree";
import { type NodeTreeMode } from "@/components/reference/nodeShape";
import { ArchetypesSection } from "@/components/reference/sections/ArchetypesSection";
import { CastSection } from "@/components/reference/sections/CastSection";
import { MapSection } from "@/components/reference/sections/MapSection";
import { PoiSection } from "@/components/reference/sections/PoiSection";
import { RulesDocument } from "@/components/reference/sections/RulesDocument";
import { TimelineSection } from "@/components/reference/sections/TimelineSection";
import type {
  CastSectionData,
  GenericSection,
  MapSectionData,
  PoiSectionData,
  ReferenceSection,
  RulesDocumentSection,
  TimelineSectionData,
} from "@/types/reference";

export function SectionDispatch({
  section,
  mode = "cards",
  openChapters,
  onChaptersChange,
}: {
  section: ReferenceSection;
  mode?: NodeTreeMode;
  // SRD-only: lift the nested chapter accordion's open-state to the shell so a
  // TOC chapter sub-link can open the chapter. Omitted → RulesDocument's chapter
  // accordion stays uncontrolled (its own clicks toggle it).
  openChapters?: string[];
  onChaptersChange?: (chapters: string[]) => void;
}) {
  switch (section.id) {
    case "poi":
      return <PoiSection section={section as PoiSectionData} />;
    case "cast":
      return <CastSection section={section as CastSectionData} />;
    case "timeline":
      return <TimelineSection section={section as TimelineSectionData} />;
    case "map":
      return <MapSection section={section as MapSectionData} />;
    case "archetypes":
      return <ArchetypesSection section={section as GenericSection} />;
    case "ruleset_reference":
      return (
        <RulesDocument
          section={section as RulesDocumentSection}
          openChapters={openChapters}
          onChaptersChange={onChaptersChange}
        />
      );
    default:
      // Generic node-bearing section → NodeTree body (no wrapper/label — the
      // shell accordion owns those). A node-less unknown section degrades to
      // nothing, never a crash.
      if ("node" in section && section.node) {
        return <NodeTree node={section.node} depth={0} mode={mode} sectionId={section.id} />;
      }
      return null;
  }
}
