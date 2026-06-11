// Dedicated Map renderer (Story 104-3 / M-C — completes story 100-12's dropped
// seam). The lore page leads with the map; the server builds a `map` section on
// every load (reference_projection.py::build_lore_map_section), but the client
// dropped it (SectionDispatch's default only renders `node`-bearing sections, and
// the map section carries `regions`/`edges`/`pins` instead).
//
// This component ADAPTS the server map section — regions as a LIST with embedded
// NPC pins, plus edges/dangling — into the shared `CartographyMap`'s
// `CartographyMetadata` (regions as a Record + routes), then renders through the
// SAME component the in-game map uses (one renderer, both surfaces — honors
// 100-10's intent). The portrait-pin upgrade lives in `CartographyMap`, so both
// surfaces inherit it.
//
// Topology note: the layout derives graph edges from `regions[].adjacent`
// (deterministic, sorted-endpoint), exactly as the server's `edges` are built —
// so the adapter folds pins/adjacency into the Record and lets the shared layout
// own edge derivation rather than threading the server `edges` list through.

import { CartographyMap } from "@/components/map/CartographyMap";
import type { CartographyMetadata } from "@/components/MapOverlay";
import { slugify } from "@/components/reference/nodeShape";
import type { MapSectionData } from "@/types/reference";

/** Adapt the server map section into the shared `CartographyMetadata` shape. */
function toCartography(section: MapSectionData): CartographyMetadata {
  const regions: CartographyMetadata["regions"] = {};
  for (const region of section.regions) {
    regions[region.id] = {
      name: region.name,
      adjacent: region.adjacent,
      pins: region.pins,
    };
  }
  return {
    navigation_mode: "region",
    starting_region: section.starting_region,
    regions,
    routes: [],
  };
}

export function MapSection({ section }: { section: MapSectionData }) {
  return (
    <section
      className="reference-section reference-section--map"
      id={`section-${slugify(section.id)}`}
    >
      <h2 className="reference-section__label">{section.label}</h2>
      <CartographyMap cartography={toCartography(section)} />
    </section>
  );
}
