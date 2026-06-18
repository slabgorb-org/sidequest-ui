// Story 100-11 (Phase 3) — RED.
//
// Dedicated POI section renderer. Consumes the server `poi` section shape from
// sidequest-server/sidequest/server/reference_projection.py::build_poi_section:
//
//   {
//     id: "poi",
//     label: "Points of Interest",
//     entries: [
//       { slug, name, region: string|null, description: string|null, image_url: string }
//     ]
//   }
//
// IMPORTANT contract facts pinned from the server:
//   - A POI is ONLY projected when its landscape is on R2 (gallery exclusion
//     model). Therefore `image_url` is ALWAYS a resolved string — never null.
//     The component does not handle a null image_url because the server never
//     emits one.
//   - `region` and `description` are nullable (the server emits `null` verbatim
//     when the authored entry omits them) — the component must render without
//     crashing and without printing the literal "null".
//
// a11y: every landscape image MUST carry alt text (assert via getByRole img +
// accessible name). Testing-Library output assertions only — no snapshots, no
// implementation coupling.
//
// Component under test (Dev creates in GREEN):
//   src/components/reference/sections/PoiSection.tsx
//     → export function PoiSection({ section }: { section: PoiSectionData })
// Types (Dev creates in GREEN):
//   src/types/reference.ts → PoiEntry, PoiSectionData

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PoiSection } from "@/components/reference/sections/PoiSection";
import type { PoiSectionData } from "@/types/reference";

const fixture: PoiSectionData = {
  id: "poi",
  label: "Points of Interest",
  entries: [
    {
      slug: "the-long-foundry",
      name: "The Long Foundry",
      region: "Evropi",
      description: "A cathedral of hammers where the war-rigs are forged.",
      image_url: "https://r2.example.com/heavy_metal/evropi/poi/the-long-foundry.png",
    },
    {
      slug: "ashfall-yards",
      name: "Ashfall Yards",
      region: null,
      description: null,
      image_url: "https://r2.example.com/heavy_metal/evropi/poi/ashfall-yards.png",
    },
  ],
};

describe("PoiSection — dedicated POI renderer (100-11)", () => {
  // NOTE (2026-06-17 shell-accordion refactor): the section label heading and the
  // `section-poi` deep-link anchor moved UP to the shell's section accordion
  // (ReferenceDocument); they are asserted there now (ReferenceShell.test.tsx).
  // This renderer is headless — it returns only the POI body.

  it("renders every POI name", () => {
    render(<PoiSection section={fixture} />);
    expect(screen.getByText("The Long Foundry")).toBeInTheDocument();
    expect(screen.getByText("Ashfall Yards")).toBeInTheDocument();
  });

  it("renders each POI landscape image with alt text (a11y)", () => {
    render(<PoiSection section={fixture} />);
    // Accessible name must identify the POI — not an empty alt.
    const foundryImg = screen.getByRole("img", { name: /Long Foundry/i });
    expect(foundryImg).toBeInTheDocument();
    expect(foundryImg).toHaveAttribute(
      "src",
      "https://r2.example.com/heavy_metal/evropi/poi/the-long-foundry.png",
    );

    const ashfallImg = screen.getByRole("img", { name: /Ashfall Yards/i });
    expect(ashfallImg).toBeInTheDocument();
    expect(ashfallImg).toHaveAttribute(
      "src",
      "https://r2.example.com/heavy_metal/evropi/poi/ashfall-yards.png",
    );
  });

  it("renders the description and region when present", () => {
    render(<PoiSection section={fixture} />);
    expect(
      screen.getByText("A cathedral of hammers where the war-rigs are forged."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Evropi/)).toBeInTheDocument();
  });

  it("renders a POI with null region and null description without crashing or printing 'null'", () => {
    render(<PoiSection section={fixture} />);
    // The Ashfall Yards entry has region:null, description:null — still rendered,
    // and the literal "null" must never leak to the DOM.
    expect(screen.getByText("Ashfall Yards")).toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("renders one image per POI entry", () => {
    render(<PoiSection section={fixture} />);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });
});
