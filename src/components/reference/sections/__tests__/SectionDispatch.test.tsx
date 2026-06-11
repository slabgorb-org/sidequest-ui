// Story 100-11 (Phase 3) — RED.
//
// SECTION DISPATCH. The reference document must route each projected section to
// its renderer by `id`:
//   - "poi"      → PoiSection
//   - "cast"     → CastSection
//   - "timeline" → TimelineSection
//   - "map"      → MapSection (wired by Story 104-3 / M-C — completes 100-12's
//                  dropped seam; the section carries `regions`/`edges`/`pins`)
//   - everything else WITH a `node` → NodeTree (generic fallback, the 100-8 path)
//   - an unknown section WITHOUT a `node` → rendered as nothing, never a crash /
//     white screen (an as-yet-unimplemented section type degrades gracefully,
//     not throw — its own story wires it later).
//
// This file pins BOTH:
//   (1) the dispatch unit — SectionDispatch routes by id; and
//   (2) the WIRING — ReferenceDocument (the production shell, 100-8) uses the
//       dispatch so a mixed projection renders ALL section types end-to-end.
//       This is the integration test required by the project's "every test suite
//       needs a wiring test" rule: it proves the dedicated components are
//       reachable from the real page, not just in isolation.
//
// Components/types under test (Dev creates in GREEN):
//   src/components/reference/sections/SectionDispatch.tsx
//     → export function SectionDispatch({ section }: { section: ReferenceSection })
//   src/types/reference.ts → ReferenceSection (union incl. Cast/Poi/Timeline)
//   src/screens/reference/ReferenceDocument.tsx → widened to dispatch sections.

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SectionDispatch } from "@/components/reference/sections/SectionDispatch";
import { ReferenceDocument } from "@/screens/reference/ReferenceDocument";
import type {
  CastSectionData,
  GenericSection,
  MapSectionData,
  PoiSectionData,
  ReferenceSection,
  TimelineSectionData,
} from "@/types/reference";

const castSection: CastSectionData = {
  id: "cast",
  label: "Cast",
  members: [
    {
      slug: "marshal-vex",
      name: "Marshal Vex",
      role: "Foundry-Marshal",
      appearance: null,
      portrait_url: "https://r2.example.com/portraits/marshal-vex.png",
    },
  ],
};

const poiSection: PoiSectionData = {
  id: "poi",
  label: "Points of Interest",
  entries: [
    {
      slug: "the-long-foundry",
      name: "The Long Foundry",
      region: "Evropi",
      description: "Cathedral of hammers.",
      image_url: "https://r2.example.com/poi/the-long-foundry.png",
    },
  ],
};

const timelineSection: TimelineSectionData = {
  id: "timeline",
  label: "Timeline",
  sort_mode: "sorted",
  preamble: null,
  entries: [
    { slug: "the-first-casting", name: "The First Casting", summary: "The first rig was forged.", temporal: "-1200" },
  ],
};

const mapSection: MapSectionData = {
  id: "map",
  label: "Map",
  starting_region: "turning_hub",
  is_cluster: false,
  regions: [{ id: "turning_hub", name: "Turning Hub", adjacent: [], pins: [] }],
  edges: [],
  dangling: [],
};

const genericSection: GenericSection = {
  id: "factions",
  label: "Factions",
  node: {
    type: "dict",
    entries: [
      { key: "evropi", label: "Evropi", node: { type: "scalar", value: "The northern foundries." } },
    ],
  },
};

describe("SectionDispatch — routes a section to its renderer by id (100-11)", () => {
  it("routes a 'poi' section to the dedicated POI renderer (produces an image)", () => {
    render(<SectionDispatch section={poiSection} />);
    expect(screen.getByRole("img", { name: /Long Foundry/i })).toBeInTheDocument();
  });

  it("routes a 'cast' section to the dedicated Cast renderer (produces a portrait)", () => {
    render(<SectionDispatch section={castSection} />);
    expect(screen.getByRole("img", { name: /Marshal Vex/i })).toBeInTheDocument();
    expect(screen.getByText("Marshal Vex")).toBeInTheDocument();
  });

  it("routes a 'timeline' section to the dedicated Timeline renderer", () => {
    render(<SectionDispatch section={timelineSection} />);
    expect(screen.getByText("The First Casting")).toBeInTheDocument();
    expect(screen.getByText("The first rig was forged.")).toBeInTheDocument();
  });

  it("falls back to NodeTree for a generic node-bearing section", () => {
    render(<SectionDispatch section={genericSection} />);
    // NodeTree output: the humanized label + scalar value, and NO image.
    expect(screen.getByText("Evropi")).toBeInTheDocument();
    expect(screen.getByText("The northern foundries.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("routes a 'map' section to MapSection — the graph renders (104-3 completes the 100-12 seam)", () => {
    // BEFORE 104-3 the map section fell through to nothing (it carries
    // regions/edges/pins, not a `node`). After M-C it routes to MapSection,
    // which renders the shared CartographyMap graph.
    render(<SectionDispatch section={mapSection} />);
    expect(screen.getByTestId("map-region-graph")).toBeInTheDocument();
  });

  it("still renders nothing (no crash) for an unknown section without a node", () => {
    // A genuinely unknown, node-less section type — graceful degrade, never throw.
    const unknown = { id: "ledger", label: "Ledger" } as unknown as ReferenceSection;
    expect(() => render(<SectionDispatch section={unknown} />)).not.toThrow();
    expect(screen.queryByTestId("map-region-graph")).not.toBeInTheDocument();
  });
});

describe("ReferenceDocument WIRING — dispatch reaches the production shell (100-11)", () => {
  it("renders poi, cast, timeline AND generic sections together via the dispatch", () => {
    const sections: ReferenceSection[] = [
      timelineSection,
      poiSection,
      castSection,
      genericSection,
    ];
    render(
      <ReferenceDocument
        docType="lore"
        loading={false}
        error={null}
        sections={sections}
        meta={undefined}
      />,
    );

    // Dedicated renderers fired (images are produced only by the dedicated path).
    expect(screen.getByRole("img", { name: /Long Foundry/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Marshal Vex/i })).toBeInTheDocument();
    // Timeline dedicated content.
    expect(screen.getByText("The First Casting")).toBeInTheDocument();
    // Generic fallback still works alongside the dedicated sections.
    expect(screen.getByText("The northern foundries.")).toBeInTheDocument();
  });

  it("no longer drops cast/poi/timeline sections (regression vs the 100-8 node-only filter)", () => {
    // The 100-8 ReferenceDocument filtered to `section.node` only, silently
    // dropping cast/poi/timeline. After 100-11 they must render.
    render(
      <ReferenceDocument
        docType="lore"
        loading={false}
        error={null}
        sections={[castSection]}
        meta={undefined}
      />,
    );
    expect(screen.getByText("Marshal Vex")).toBeInTheDocument();
  });
});
