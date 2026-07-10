/**
 * Story 163-5 / plan task 12 (Track A, spec §4 A1): MapState gains an optional
 * `treatment` field and MapOverlay.tsx exports the RasterTreatment interface —
 * the client-side twin of the server's CartographyTreatmentWire (163-1).
 * App.tsx blind-casts the MAP_UPDATE payload, so this type add is what makes
 * `mapData.treatment` reach consumers type-checked.
 *
 * RED-observability note: vitest transpiles with esbuild and does NOT
 * typecheck, so a pure `import type` contract passes vacuously at runtime.
 * The load-bearing RED assertions here are the sanctioned ?raw source guards
 * (pattern: referenceCss-wiring.test.ts, GameBoard-fate-tab.test.tsx); the
 * typed literal below additionally pins the contract at `tsc -b` time.
 */
import { describe, it, expect } from "vitest";
import type { MapState, RasterTreatment } from "@/components/MapOverlay";

describe("MapState.treatment type (Story 163-5 task 12)", () => {
  it("MapOverlay.tsx exports a RasterTreatment interface (source guard)", async () => {
    const src = (await import("@/components/MapOverlay?raw")) as unknown as {
      default: string;
    };
    expect(src.default).toMatch(/export interface RasterTreatment/);
  });

  it("MapState declares an optional treatment field typed RasterTreatment (source guard)", async () => {
    const src = (await import("@/components/MapOverlay?raw")) as unknown as {
      default: string;
    };
    expect(src.default).toMatch(/treatment\?:\s*RasterTreatment/);
  });

  it("accepts a raster treatment on MapState (tsc contract; runtime shape smoke)", () => {
    const t: RasterTreatment = {
      kind: "raster",
      image_url: "https://cdn/sheet.jpg",
      node_anchors: { r1: [1, 2] },
      style_hints: { faction_layer: "default" },
    };
    const s: MapState = {
      current_location: "r1",
      region: "w",
      explored: [],
      fog_bounds: { width: 0, height: 0 },
      treatment: t,
    };
    expect(s.treatment?.kind).toBe("raster");
    expect(s.treatment?.node_anchors.r1).toEqual([1, 2]);
  });
});
