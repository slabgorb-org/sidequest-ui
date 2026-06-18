// Story 104-3 (M-C) — RED.
//
// Wire the lore-page Map section + NPC portrait-pin renderer, completing story
// 100-12's dropped seam. The lore page is designed to LEAD with the map, the
// server builds a `map` section on every load
// (reference_projection.py::build_lore_map_section), but the client drops it:
// SectionDispatch's default only renders a `node`-bearing section, and the map
// section carries `regions`/`edges`/`pins` instead — so it fell through to
// nothing. This story adds the renderer.
//
// This file pins the M-C acceptance criteria:
//   AC1  SectionDispatch gains `case "map"` → MapSection, adapting the server
//        `{regions, edges, pins, starting_region}` to what CartographyMap consumes.
//   AC2  CartographyMap renders NPC portrait pins (the "fancy node thing").
//   AC3  Session-free — renders with no WebSocket / provider / theme in scope.
//   AC4  The lore projection's `map` section renders a graph (NOT nothing), and
//        pins appear when `portrait_url` is present.
//   AC5  The SAME upgraded renderer (CartographyMap) is what the in-game graph
//        uses — one component, both surfaces (honors 100-10's intent). The pin
//        capability therefore lives in CartographyMap so both surfaces inherit it.
//
// Contract (pinned VERBATIM from the live server projection,
// sidequest-server/sidequest/server/reference_projection.py:126):
//   { id:"map", label:"Map", starting_region:str, is_cluster:bool,
//     regions:[{id, name, adjacent:[...], pins:[{slug, label, portrait_url:str|null}]}],
//     edges:[[a,b]…], dangling:[[src,missing]…] }
// `regions` is a LIST with embedded `pins`; `portrait_url` is nullable (R2-gated,
// exactly like the Cast section's portraits).
//
// AC-defined DOM contracts (TEA, this story — the sprint YAML recorded no ACs):
//   - The graph is the shared CartographyMap: testid `map-region-graph`, one
//     `map-region-node-{id}` per region, `map-region-edge-{a}--{b}` per adjacency.
//   - A resolved portrait pin (portrait_url present) renders an accessible image
//     NAMED by the NPC's pin label — `getByRole("img", { name })` — mirroring the
//     Cast section's a11y/portrait pattern.
//   - A pin with `portrait_url: null` renders NO portrait image (no broken/empty-src
//     <img>), mirroring the Cast section's nullable-portrait contract.
//
// RED reason: `MapSection`, the `MapSectionData` type, the `map` dispatch case,
// and the `pins` field on CartographyMap's region shape do not exist yet → these
// imports/types fail to compile and the assertions fail. After GREEN they pass.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MapSection } from "@/components/reference/sections/MapSection";
import { SectionDispatch } from "@/components/reference/sections/SectionDispatch";
import { CartographyMap } from "@/components/map/CartographyMap";
import type { CartographyMetadata } from "@/components/MapOverlay";
import { ReferenceDocument } from "@/screens/reference/ReferenceDocument";
import type { MapSectionData, ReferenceSection } from "@/types/reference";

const MENDES_PORTRAIT = "https://r2.example.com/portraits/mendes.png";

/** A two-region single-system map (coyote_star shape) with one resolved pin and
 *  one R2-unresolved (null) pin — exercises both portrait branches. */
const mapSection: MapSectionData = {
  id: "map",
  label: "Map",
  starting_region: "far_landing",
  is_cluster: false,
  regions: [
    {
      id: "far_landing",
      name: "Far Landing",
      adjacent: ["deep_root"],
      pins: [{ slug: "mendes", label: "Mendes", portrait_url: MENDES_PORTRAIT }],
    },
    {
      id: "deep_root",
      name: "Deep Root",
      adjacent: ["far_landing"],
      // R2 has no portrait for this NPC → server resolves portrait_url to null.
      pins: [{ slug: "the-drifter", label: "The Drifter", portrait_url: null }],
    },
  ],
  edges: [["deep_root", "far_landing"]],
  dangling: [],
};

describe("MapSection — renders the lore-page Map graph (M-C AC1/AC4)", () => {
  it("renders the shared region graph (a graph, NOT nothing)", () => {
    render(<MapSection section={mapSection} />);
    expect(screen.getByTestId("map-region-graph")).toBeInTheDocument();
  });

  it("renders one node per server region (list-shaped regions adapted to the graph)", () => {
    render(<MapSection section={mapSection} />);
    expect(screen.getByTestId("map-region-node-far_landing")).toBeInTheDocument();
    expect(screen.getByTestId("map-region-node-deep_root")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^map-region-node-/)).toHaveLength(2);
  });

  it("renders the adjacency edge between the two regions (de-duped, sorted endpoints)", () => {
    render(<MapSection section={mapSection} />);
    // Reciprocal adjacency collapses to one sorted-endpoint edge: deep_root--far_landing.
    expect(
      screen.getByTestId("map-region-edge-deep_root--far_landing"),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId(/^map-region-edge-/)).toHaveLength(1);
  });

  it("renders an NPC portrait pin when portrait_url is present (AC2/AC4)", () => {
    render(<MapSection section={mapSection} />);
    const pin = screen.getByRole("img", { name: /Mendes/i });
    expect(pin).toBeInTheDocument();
    expect(pin).toHaveAttribute("src", MENDES_PORTRAIT);
  });

  it("renders NO portrait image for a pin whose portrait_url is null (no broken src)", () => {
    render(<MapSection section={mapSection} />);
    // The unresolved NPC must not produce an image element — the graph keeps its
    // shape and never emits an empty/broken <img>, mirroring the Cast contract.
    expect(screen.queryByRole("img", { name: /Drifter/i })).not.toBeInTheDocument();
  });

  it("never emits the literal string 'null' or 'undefined'", () => {
    render(<MapSection section={mapSection} />);
    expect(screen.queryAllByText(/^(null|undefined)$/)).toHaveLength(0);
  });

  it("is session-free (C2): renders with no provider / WebSocket / theme in scope (AC3)", () => {
    // No GameStateProvider / ThemeProvider / socket wrapper — bare render.
    expect(() => render(<MapSection section={mapSection} />)).not.toThrow();
  });
});

describe("SectionDispatch WIRING — the 'map' case completes 100-12's dropped seam (M-C AC1)", () => {
  it("routes a 'map' section to MapSection so the graph renders (was previously nothing)", () => {
    render(<SectionDispatch section={mapSection} />);
    expect(screen.getByTestId("map-region-graph")).toBeInTheDocument();
  });

  it("renders the map section graph + pins end-to-end through the production shell", async () => {
    // WIRING TEST: proves the dispatch is reachable from the real lore-page shell,
    // not just in isolation (repo rule: every test suite needs a wiring test).
    // 2026-06-17: the shell collapses sections by default, so the panel body is
    // not mounted until the section is expanded — expand it, then assert.
    const user = userEvent.setup();
    const sections: ReferenceSection[] = [mapSection];
    render(
      <ReferenceDocument
        docType="lore"
        loading={false}
        error={null}
        sections={sections}
        meta={undefined}
      />,
    );
    // Collapsed by default: the graph is not mounted yet.
    expect(screen.queryByTestId("map-region-graph")).not.toBeInTheDocument();
    // Expand the Map section via its trigger.
    await user.click(screen.getByRole("button", { name: /Map/i }));
    expect(await screen.findByTestId("map-region-graph")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Mendes/i })).toBeInTheDocument();
  });
});

describe("Shared renderer — pins live in CartographyMap so BOTH surfaces inherit them (M-C AC2/AC5)", () => {
  it("CartographyMap (the in-game renderer) draws a portrait pin from region pin data", () => {
    // AC5: the lore Map surface and the in-game map share ONE renderer. The pin
    // upgrade (AC2) therefore belongs to CartographyMap itself — fed here directly
    // (not through MapSection) to prove the capability lives in the shared
    // component, so the in-game cluster graph inherits it for free.
    const cartWithPin: CartographyMetadata = {
      navigation_mode: "region",
      starting_region: "mendes_post",
      regions: {
        mendes_post: {
          name: "Mendes' Post",
          adjacent: [],
          pins: [{ slug: "mendes", label: "Mendes", portrait_url: MENDES_PORTRAIT }],
        },
      },
      routes: [],
    };
    render(<CartographyMap cartography={cartWithPin} />);
    const graph = screen.getByTestId("map-region-graph");
    const pin = within(graph).getByRole("img", { name: /Mendes/i });
    expect(pin).toHaveAttribute("src", MENDES_PORTRAIT);
  });
});
