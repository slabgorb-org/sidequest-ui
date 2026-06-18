// Dedicated Archetypes renderer (2026-06-18 — per-entry collapse).
//
// The `archetypes` section's projection is a `node` of type `list`, each item a
// deep dict: { name, description, personality_traits, typical_classes,
// typical_races, stat_ranges, jungian_hint, rpg_role_hint, inventory_hints,
// dialogue_quirks, disposition_default, ocean }. The entries are too deep to be
// "cardable", so the generic NodeTree path stacks them into a ~5,000px flat wall.
//
// This renderer makes EACH archetype its own collapsible accordion item: the
// archetype name is the trigger row (with chevron); the structured block is the
// on-demand body, rendered through NodeTree in HEADINGS mode so every existing
// field formatting (stat-range pairs, hint lists, OCEAN dict) is preserved
// unchanged. Collapsed by default; multiple-open (same base-ui pattern as the SRD
// chapter accordion and the shell section accordion).
//
// Headless (2026-06-17 refactor parity): no self `<section>` / label — the shell
// provides the `section-archetypes` anchor and the "Archetypes" heading. The
// projection carries no stable per-archetype id/slug/anchor, and the rules TOC
// has no per-archetype sub-links, so no per-item deep-link anchors are invented.

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { NodeTree } from "@/components/reference/NodeTree";
import { fmtScalar, visibleEntries } from "@/components/reference/nodeShape";
import type { DictNode } from "@/components/reference/nodeShape";
import type { GenericSection, ReferenceDictEntry, ReferenceNode } from "@/types/reference";

// Identity keys, in preference order, that name an archetype. Mirrors NodeTree's
// itemIdentity so the trigger label matches what the flat view used as a title.
const NAME_KEYS = ["name", "label", "title"];

function archetypeName(item: DictNode, fallback: number): { title: string; bodyEntries: ReferenceDictEntry[] } {
  const entries = visibleEntries(item);
  for (const key of NAME_KEYS) {
    const hit = entries.find(
      (e) => e.key === key && e.node.type === "scalar" && e.node.value !== null,
    );
    if (hit) {
      return {
        title: fmtScalar((hit.node as { value: string | number | boolean | null }).value),
        // Drop the name (it's the trigger) and the slug-twin `id` (NodeTree's rule).
        bodyEntries: entries.filter((e) => e.key !== key && e.key !== "id"),
      };
    }
  }
  return { title: `Archetype ${fallback + 1}`, bodyEntries: entries };
}

function ArchetypeItem({
  item,
  index,
  sectionId,
}: {
  item: DictNode;
  index: number;
  sectionId: string;
}) {
  const { title, bodyEntries } = archetypeName(item, index);
  // Synthetic dict of the remaining fields → NodeTree headings mode at depth 1
  // (routes to EntryFlow, preserving stat-range pairs / hint lists / OCEAN dict).
  const bodyNode: ReferenceNode = { type: "dict", entries: bodyEntries };
  return (
    <AccordionItem value={`archetype-${index}`} className="archetypes-section__item">
      <AccordionTrigger className="archetypes-section__trigger">
        <span className="archetypes-section__name">{title}</span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="archetypes-section__body reference-node--archetype">
          <NodeTree node={bodyNode} depth={1} mode="headings" sectionId={sectionId} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function ArchetypesSection({ section }: { section: GenericSection }) {
  const node = section.node;
  // Defensive: the dedicated case is only dispatched for `archetypes`, whose
  // projection is a list of dicts. If the shape ever differs, fall back to the
  // generic NodeTree so we never crash or silently drop content.
  if (node.type !== "list" || !node.items.every((i) => i.type === "dict")) {
    return <NodeTree node={node} depth={0} mode="cards" sectionId={section.id} />;
  }
  return (
    <div className="reference-section--archetypes">
      <Accordion multiple className="archetypes-section__accordion">
        {node.items.map((item, index) => (
          <ArchetypeItem
            key={index}
            item={item as DictNode}
            index={index}
            sectionId={section.id}
          />
        ))}
      </Accordion>
    </div>
  );
}
