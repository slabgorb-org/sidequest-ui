// Story 164-5 AC-2 — the SITE_MAP adapter (`src/lib/siteMap.ts`) carries the
// site descriptor metadata from the server wire shape into the `MapState` the
// Map tab consumes, and guards a malformed frame loudly.
//
// The server already emits SITE_MAP (164-4, map_emit.py `_build_site_map_payload`
// → SiteMapPayload): { current_location, region, explored[], site_id, site_name,
// archetype, extent }. This is the client half of the DUNGEON_MAP → SITE_MAP
// cutover: `siteMap.ts` replaces the retired `dungeonMap.ts`. The retired
// `dungeonMap.ts` unit behavior (x/y defaults, theme-shared label
// disambiguation, No-Silent-Fallbacks guard) must survive the rename.
//
// RED: `@/lib/siteMap` does not exist yet.

import { describe, it, expect } from "vitest";
import { isSiteMapPayload, siteMapToMapState } from "@/lib/siteMap";

/** A well-formed SITE_MAP payload in the server's exact wire shape. */
function validSitePayload() {
  return {
    current_location: "frontier:entrance",
    region: "frontier:entrance",
    explored: [
      {
        id: "frontier:entrance",
        name: "Entrance",
        type: "region",
        connections: ["frontier:r2"],
        room_exits: [
          { target: "frontier:r2", exit_type: "corridor", bearing: "north" },
        ],
        room_type: "entrance",
        is_current_room: true,
      },
    ],
    site_id: "frontier",
    site_name: "The Deep",
    archetype: "megadungeon",
    extent: "frontier",
  };
}

describe("isSiteMapPayload (164-5 AC-2)", () => {
  it("accepts a well-formed SITE_MAP payload", () => {
    expect(isSiteMapPayload(validSitePayload())).toBe(true);
  });

  it("rejects null / undefined / non-object", () => {
    expect(isSiteMapPayload(null)).toBe(false);
    expect(isSiteMapPayload(undefined)).toBe(false);
    expect(isSiteMapPayload("SITE_MAP")).toBe(false);
  });

  it("rejects a payload missing current_location", () => {
    const p = validSitePayload() as Record<string, unknown>;
    delete p.current_location;
    expect(isSiteMapPayload(p)).toBe(false);
  });

  it("rejects a payload whose explored is not an array", () => {
    const p = { ...validSitePayload(), explored: "nope" };
    expect(isSiteMapPayload(p)).toBe(false);
  });

  // No Silent Fallbacks: the breadcrumb + scene-keying are the whole feature.
  // A SITE_MAP that cannot name its site (missing site_id / site_name) must be
  // dropped LOUDLY by the caller, not rendered as "You are inside undefined".
  it("rejects a payload missing site_id (the scene key)", () => {
    const p = validSitePayload() as Record<string, unknown>;
    delete p.site_id;
    expect(isSiteMapPayload(p)).toBe(false);
  });

  it("rejects a payload missing site_name (the breadcrumb label)", () => {
    const p = validSitePayload() as Record<string, unknown>;
    delete p.site_name;
    expect(isSiteMapPayload(p)).toBe(false);
  });
});

describe("siteMapToMapState (164-5 AC-2)", () => {
  it("carries the site descriptor metadata into the MapState", () => {
    const state = siteMapToMapState(validSitePayload());
    expect(state.siteId).toBe("frontier");
    expect(state.siteName).toBe("The Deep");
    expect(state.archetype).toBe("megadungeon");
    expect(state.extent).toBe("frontier");
  });

  it("fills inert x/y defaults — room graphs have no coordinates (ADR-055)", () => {
    const state = siteMapToMapState(validSitePayload());
    expect(state.explored[0].x).toBe(0);
    expect(state.explored[0].y).toBe(0);
    expect(state.current_location).toBe("frontier:entrance");
  });

  it("preserves room_exits so MapWidget routes to the Automapper", () => {
    const state = siteMapToMapState(validSitePayload());
    expect(state.explored[0].room_exits?.[0]?.target).toBe("frontier:r2");
  });

  it("disambiguates theme-shared region labels (158-6 behavior survives the rename)", () => {
    const payload = {
      ...validSitePayload(),
      explored: [
        {
          id: "exp001.r1",
          name: "The Drowned Cavern",
          type: "region",
          connections: ["exp001.r2"],
          room_exits: [{ target: "exp001.r2", exit_type: "corridor" }],
          room_type: "normal",
          is_current_room: false,
        },
        {
          id: "exp001.r2",
          name: "The Drowned Cavern",
          type: "region",
          connections: ["exp001.r1"],
          room_exits: [{ target: "exp001.r1", exit_type: "corridor" }],
          room_type: "normal",
          is_current_room: true,
        },
      ],
    };
    const names = siteMapToMapState(payload).explored.map((l) => l.name);
    expect(names).toContain("The Drowned Cavern 1");
    expect(names).toContain("The Drowned Cavern 2");
  });
});
