// Pure section-level predicates for the reference shell (2026-06-17
// shell-accordion refactor). Split out of SectionDispatch.tsx so that file only
// exports components (react-refresh), and so the shell (ReferenceDocument) can
// share the EXACT renderability rule the dispatcher uses.

import type { ReferenceSection } from "@/types/reference";

// Sections handled by a dedicated renderer (by id) — these always render a body
// even though they carry no generic `node`.
const DEDICATED_IDS = new Set(["poi", "cast", "timeline", "map", "ruleset_reference"]);

// A section is renderable when a dedicated renderer handles its id, OR it carries
// a generic `node`. A genuinely unknown, node-less section produces no body — the
// shell uses this to skip creating an empty accordion item for it.
export function isRenderableSection(section: ReferenceSection): boolean {
  if (DEDICATED_IDS.has(section.id)) return true;
  return "node" in section && Boolean(section.node);
}
