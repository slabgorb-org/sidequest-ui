// Story 100-11 (Phase 3) — RED.
//
// Dedicated Timeline section renderer. Consumes the server `timeline` section
// shape from
// sidequest-server/sidequest/server/reference_projection.py::build_timeline_section:
//
//   {
//     id: "timeline",
//     label: "Timeline",
//     sort_mode: "sorted" | "authored_order",
//     preamble: string | null,           // world history prose, may be absent
//     entries: [ { slug, name, summary, temporal: string|null } ]
//   }
//
// IMPORTANT contract facts pinned from the server:
//   - The server ALREADY orders `entries`: the dated spine first (ascending year
//     when sort_mode === "sorted", else authored order), then the undated
//     entries (temporal === null) in authored order. The client therefore
//     RENDERS ENTRIES IN THE GIVEN ARRAY ORDER and MUST NOT re-sort. This is the
//     load-bearing "respecting sort_mode" behavior — the mode is the server's
//     decision, encoded in the array; the client trusts it.
//   - `temporal` is nullable. Dated entries surface their temporal label; undated
//     entries render without a date and must not print the literal "null".
//   - `preamble` is nullable — rendered when present, gracefully omitted (no
//     crash) when null.
//
// Testing-Library output assertions only — no snapshots, no implementation
// coupling. DOM order is asserted via document position, not test ids.
//
// Component under test (Dev creates in GREEN):
//   src/components/reference/sections/TimelineSection.tsx
//     → export function TimelineSection({ section }: { section: TimelineSectionData })
// Types (Dev creates in GREEN):
//   src/types/reference.ts → TimelineEntry, TimelineSectionData

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TimelineSection } from "@/components/reference/sections/TimelineSection";
import type { TimelineSectionData } from "@/types/reference";

/** True when `first` appears strictly before `second` in document order. */
function precedes(first: Element, second: Element): boolean {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

const sorted: TimelineSectionData = {
  id: "timeline",
  label: "Timeline",
  sort_mode: "sorted",
  preamble: "Three ages turned beneath the Foundry's smoke.",
  entries: [
    { slug: "the-first-casting", name: "The First Casting", summary: "The first rig was forged.", temporal: "-1200" },
    { slug: "the-ember-war", name: "The Ember War", summary: "The yards burned for a decade.", temporal: "-300" },
    { slug: "the-long-silence", name: "The Long Silence", summary: "No one remembers when.", temporal: null },
  ],
};

describe("TimelineSection — dedicated Timeline renderer (100-11)", () => {
  // NOTE (2026-06-17 shell-accordion refactor): the section label heading and the
  // `section-timeline` deep-link anchor moved UP to the shell's section accordion
  // (ReferenceDocument); they are asserted there now (ReferenceShell.test.tsx).
  // This renderer is headless — it returns only the Timeline body.

  it("renders every entry name and summary", () => {
    render(<TimelineSection section={sorted} />);
    expect(screen.getByText("The First Casting")).toBeInTheDocument();
    expect(screen.getByText("The first rig was forged.")).toBeInTheDocument();
    expect(screen.getByText("The Ember War")).toBeInTheDocument();
    expect(screen.getByText("The Long Silence")).toBeInTheDocument();
  });

  it("renders the preamble prose when present", () => {
    render(<TimelineSection section={sorted} />);
    expect(
      screen.getByText("Three ages turned beneath the Foundry's smoke."),
    ).toBeInTheDocument();
  });

  it("renders without crashing when preamble is null", () => {
    const noPreamble: TimelineSectionData = { ...sorted, preamble: null };
    expect(() => render(<TimelineSection section={noPreamble} />)).not.toThrow();
  });

  it("surfaces the temporal label for dated entries", () => {
    render(<TimelineSection section={sorted} />);
    expect(screen.getByText(/-1200/)).toBeInTheDocument();
    expect(screen.getByText(/-300/)).toBeInTheDocument();
  });

  it("renders undated entries (temporal null) without printing 'null'", () => {
    render(<TimelineSection section={sorted} />);
    expect(screen.getByText("The Long Silence")).toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("renders entries in the server-given order, undated last", () => {
    render(<TimelineSection section={sorted} />);
    const first = screen.getByText("The First Casting");
    const second = screen.getByText("The Ember War");
    const undated = screen.getByText("The Long Silence");
    expect(precedes(first, second)).toBe(true);
    expect(precedes(second, undated)).toBe(true);
  });

  it("does NOT re-sort: preserves authored order when sort_mode is 'authored_order'", () => {
    // Deliberately NON-ascending dated entries with sort_mode "authored_order".
    // A client that re-sorts ascending would put "Younger" before "Elder"; the
    // contract is that the client trusts the server's array order verbatim.
    const authored: TimelineSectionData = {
      id: "timeline",
      label: "Timeline",
      sort_mode: "authored_order",
      preamble: null,
      entries: [
        { slug: "elder", name: "The Elder Pact", summary: "Signed in the third age.", temporal: "third age" },
        { slug: "younger", name: "The Younger Pact", summary: "Signed in the first age.", temporal: "first age" },
      ],
    };
    render(<TimelineSection section={authored} />);
    const elder = screen.getByText("The Elder Pact");
    const younger = screen.getByText("The Younger Pact");
    expect(precedes(elder, younger)).toBe(true);
  });
});

describe("TimelineSection — era label (2026-06-09 redesign)", () => {
  it("renders 'Within living memory' for a null temporal (never an empty spine slot)", () => {
    const undated: TimelineSectionData = {
      id: "timeline",
      label: "Timeline",
      sort_mode: "sorted",
      preamble: null,
      entries: [
        { slug: "the-long-silence", name: "The Long Silence", summary: "No one remembers when.", temporal: null },
      ],
    };
    render(<TimelineSection section={undated} />);
    expect(screen.getByText("Within living memory")).toBeInTheDocument();
  });
  // The `section-timeline` deep-link anchor moved to the shell accordion item
  // (2026-06-17) — asserted in ReferenceShell.test.tsx, not on the headless
  // renderer.
});
