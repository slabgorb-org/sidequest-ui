// 2026-06-09 reference redesign — TOC derivation.
//
// buildToc shares `isCompactNode` with NodeTree, so the TOC mirrors exactly
// the headings the renderer emits: compact depth-0 entries live in the spec
// box (no heading, no TOC slot); prose and structured entries get subsection
// anchors. Dedicated sections (poi/cast/timeline) contribute a section item
// with no children.

import { describe, it, expect } from "vitest";
import { buildToc } from "@/screens/reference/buildToc";
import type { ReferenceSection } from "@/types/reference";

const rulesSection: ReferenceSection = {
  id: "rules",
  label: "Rules",
  node: {
    type: "dict",
    entries: [
      // Compact (short scalar) → spec box → NO TOC slot.
      { key: "stat_generation", label: "Stat generation", node: { type: "scalar", value: "point_buy" } },
      // Prose → subsection heading → TOC slot.
      { key: "history", label: "History", node: { type: "scalar", value: "x".repeat(200) } },
      // Structured → subsection heading → TOC slot.
      {
        key: "confrontations",
        label: "Confrontations",
        node: {
          type: "list",
          items: [
            {
              type: "dict",
              entries: [
                { key: "label", label: "Label", node: { type: "scalar", value: "The duel" } },
                { key: "notes", label: "Notes", node: { type: "scalar", value: "n".repeat(150) } },
              ],
            },
          ],
        },
      },
      // Keeper-firewalled → never a TOC slot.
      { key: "_devnote", label: "Devnote", node: { type: "scalar", value: "z".repeat(200) } },
    ],
  },
};

const timelineSection: ReferenceSection = {
  id: "timeline",
  label: "Timeline",
  sort_mode: "sorted",
  preamble: null,
  entries: [],
};

describe("buildToc (2026-06-09 redesign)", () => {
  it("emits one item per section; dict sections contribute non-compact depth-0 keys", () => {
    const toc = buildToc([rulesSection, timelineSection], "cards");
    expect(toc).toHaveLength(2);
    expect(toc[0]).toMatchObject({ id: "rules", label: "Rules" });
    expect(toc[0].children).toEqual([
      { id: "rules--history", label: "History" },
      { id: "rules--confrontations", label: "Confrontations" },
    ]);
    // Dedicated (node-less) section → no children.
    expect(toc[1]).toEqual({ id: "timeline", label: "Timeline", children: [] });
  });

  it("ledger mode contributes top-level items only", () => {
    const toc = buildToc([rulesSection], "ledger");
    expect(toc[0].children).toEqual([]);
  });
});
