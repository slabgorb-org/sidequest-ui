// TOC derivation (2026-06-09 redesign bundle) — built from the projection
// itself: one item per section; generic dict sections contribute their depth-0
// keys as sub-items. Imports `isCompactNode` from the shared shape module so
// the TOC can never drift from the headings NodeTree actually emits: compact
// entries live in the spec box, not under a heading, so they contribute no
// TOC slot.

import {
  anchorId,
  isCompactNode,
  slugify,
  visibleEntries,
  type NodeTreeMode,
} from "@/components/reference/nodeShape";
import type { ReferenceSection } from "@/types/reference";

export interface TocItem {
  id: string;
  label: string;
  children: { id: string; label: string }[];
}

export function buildToc(sections: ReferenceSection[], mode: NodeTreeMode): TocItem[] {
  return sections.map((section) => {
    const item: TocItem = { id: slugify(section.id), label: section.label, children: [] };
    if (section.id === "ruleset_reference" && "chapters" in section) {
      item.children = section.chapters.map((chapter) => ({
        id: chapter.anchor,
        label: chapter.title,
      }));
      return item;
    }
    // Ledger mode renders no subsection anchors — top-level entries only.
    if (mode !== "ledger" && "node" in section && section.node && section.node.type === "dict") {
      item.children = visibleEntries(section.node)
        .filter((entry) => !isCompactNode(entry.node))
        .map((entry) => ({
          id: anchorId(section.id, entry.key),
          label: entry.label,
        }));
    }
    return item;
  });
}
