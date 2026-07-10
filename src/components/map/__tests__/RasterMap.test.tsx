/**
 * Story 163-5 / plan task 13 (Track A, spec §4 A1, §5): RasterMap renders a
 * PD scan image with an SVG overlay — one pin per anchored region, the
 * current location marked, route lines between anchored endpoints. Image
 * load failure is an EXPLICIT error state (spec §5 / SOUL "No Silent
 * Fallbacks"): never a dag/generated fallback render.
 *
 * DOM contract (plan task 13): host `map-panel-raster`; scan `raster-scan`;
 * pins `[data-region-id]` with `data-current="true"` on the party's region;
 * error state `map-panel-raster-error`. Style branches are data-driven off
 * `style_hints` (`data-route-tracing` on route lines, `data-defaced` on
 * pins) — never off genre strings (Track B touchpoint).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { MapState, RasterTreatment } from "@/components/MapOverlay";
import { RasterMap } from "../RasterMap";

function makeTreatment(
  overrides: Partial<RasterTreatment> = {}
): RasterTreatment {
  return {
    kind: "raster",
    image_url: "https://cdn/sheet.jpg",
    node_anchors: { r1: [100, 120], r2: [300, 240] },
    style_hints: { faction_layer: "default", routes: "default" },
    ...overrides,
  };
}

function makeMapState(
  treatment: RasterTreatment,
  overrides: Partial<MapState> = {}
): MapState {
  return {
    current_location: "r1",
    region: "w",
    explored: [],
    fog_bounds: { width: 0, height: 0 },
    cartography: {
      navigation_mode: "region",
      starting_region: "r1",
      regions: { r1: { name: "R1" }, r2: { name: "R2" } },
      routes: [],
    },
    treatment,
    ...overrides,
  };
}

describe("RasterMap (Story 163-5 task 13)", () => {
  it("renders the scan image and a pin per anchored region, marking the current location", () => {
    const treatment = makeTreatment();
    const { container } = render(
      <RasterMap treatment={treatment} mapData={makeMapState(treatment)} />
    );
    expect(screen.getByTestId("map-panel-raster")).toBeInTheDocument();
    expect(screen.getByTestId("raster-scan")).toHaveAttribute(
      "src",
      "https://cdn/sheet.jpg"
    );
    expect(container.querySelectorAll("[data-region-id]")).toHaveLength(2);
    expect(container.querySelector('[data-region-id="r1"]')).toHaveAttribute(
      "data-current",
      "true"
    );
    expect(
      container.querySelector('[data-region-id="r2"]')
    ).not.toHaveAttribute("data-current");
  });

  it("fires onNodeSelect with the clicked region id (orientation, not travel)", () => {
    const treatment = makeTreatment();
    const onSelect = vi.fn();
    const { container } = render(
      <RasterMap
        treatment={treatment}
        mapData={makeMapState(treatment)}
        onNodeSelect={onSelect}
      />
    );
    fireEvent.click(container.querySelector('[data-region-id="r2"]')!);
    expect(onSelect).toHaveBeenCalledWith("r2");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("pin click without an onNodeSelect handler does not throw", () => {
    const treatment = makeTreatment();
    const { container } = render(
      <RasterMap treatment={treatment} mapData={makeMapState(treatment)} />
    );
    expect(() =>
      fireEvent.click(container.querySelector('[data-region-id="r1"]')!)
    ).not.toThrow();
  });

  it("shows an explicit error state on image load failure — no silent fallback render", () => {
    const treatment = makeTreatment();
    const { queryByTestId } = render(
      <RasterMap treatment={treatment} mapData={makeMapState(treatment)} />
    );
    fireEvent.error(screen.getByTestId("raster-scan"));
    expect(screen.getByTestId("map-panel-raster-error")).toBeInTheDocument();
    // The error state REPLACES the raster panel; nothing may quietly render
    // a dag/generated/overlay map in its place (spec §5, No Silent Fallbacks).
    expect(queryByTestId("map-panel-raster")).not.toBeInTheDocument();
    expect(queryByTestId("map-overlay")).not.toBeInTheDocument();
  });

  it("draws route lines between anchored endpoints, flagged by the routes style hint", () => {
    const tracing = makeTreatment({
      style_hints: { faction_layer: "default", routes: "highway_tracing" },
    });
    const { container } = render(
      <RasterMap
        treatment={tracing}
        mapData={makeMapState(tracing, {
          cartography: {
            navigation_mode: "region",
            starting_region: "r1",
            regions: { r1: { name: "R1" }, r2: { name: "R2" } },
            routes: [{ name: "coastal run", from_id: "r1", to_id: "r2" }],
          },
        })}
      />
    );
    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(1);
    expect(
      container.querySelectorAll('line[data-route-tracing="true"]')
    ).toHaveLength(1);
  });

  it("default style hints draw untraced routes and unflagged pins; defacement flags every pin", () => {
    const plain = makeTreatment();
    const { container: plainC } = render(
      <RasterMap
        treatment={plain}
        mapData={makeMapState(plain, {
          cartography: {
            navigation_mode: "region",
            starting_region: "r1",
            regions: { r1: { name: "R1" }, r2: { name: "R2" } },
            routes: [{ name: "coastal run", from_id: "r1", to_id: "r2" }],
          },
        })}
      />
    );
    expect(
      plainC.querySelectorAll('line[data-route-tracing="true"]')
    ).toHaveLength(0);
    expect(plainC.querySelectorAll('[data-defaced="true"]')).toHaveLength(0);

    const defaced = makeTreatment({
      style_hints: { faction_layer: "wasteland_defacement", routes: "default" },
    });
    const { container: defacedC } = render(
      <RasterMap treatment={defaced} mapData={makeMapState(defaced)} />
    );
    expect(
      defacedC.querySelectorAll('[data-region-id][data-defaced="true"]')
    ).toHaveLength(2);
  });

  it("skips route lines with an unanchored endpoint instead of drawing NaN coordinates", () => {
    const treatment = makeTreatment();
    const { container } = render(
      <RasterMap
        treatment={treatment}
        mapData={makeMapState(treatment, {
          cartography: {
            navigation_mode: "region",
            starting_region: "r1",
            regions: { r1: { name: "R1" }, r2: { name: "R2" } },
            routes: [{ name: "ghost road", from_id: "r1", to_id: "ghost" }],
          },
        })}
      />
    );
    expect(container.querySelectorAll("line")).toHaveLength(0);
  });

  it("renders without a current marker when the party's region has no anchor", () => {
    const treatment = makeTreatment();
    const { container } = render(
      <RasterMap
        treatment={treatment}
        mapData={makeMapState(treatment, { current_location: "unanchored" })}
      />
    );
    expect(screen.getByTestId("map-panel-raster")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-region-id]")).toHaveLength(2);
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(0);
  });
});
