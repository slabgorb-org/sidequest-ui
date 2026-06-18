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

// Headless renderer (2026-06-17 shell-accordion refactor): the section wrapper
// (`section-{id}` deep-link anchor) and the `.reference-section__label` heading
// now live on the shell's section accordion (ReferenceDocument). This component
// returns ONLY its inner body so it can drop into an accordion panel without
// double chrome.
export function MapSection({ section }: { section: MapSectionData }) {
  return (
    <div className="reference-section--map">
      <CartographyMap cartography={toCartography(section)} />
    </div>
  );
}
