// Story 164-5 AC-4 — MapWidget foregrounds the active site map and renders the
// drill-out breadcrumb (the visible 158-36 fix).
//
// `mapData` is now scene-keyed at the App level: the world cartography lives in
// `mapData`, the active site's room graph in a new `siteMap` prop. When a site
// scene is active, MapWidget foregrounds the site room graph (Automapper) and
// shows a breadcrumb — "You are inside <site> · ▲ <world region>" — with a
// drill-out affordance. Drill-out is VIEW-ONLY: it shows the world map; it does
// NOT move the party (travel stays prose-through-the-turn-barrier). The Track A
// orbital/cartography branches are untouched.
//
// RED: MapWidget has no `siteMap` prop, no breadcrumb, no drill-out.

import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MapWidget } from "../MapWidget";
import type { MapState } from "@/components/MapOverlay";

/** World cartography scene — region nodes, no room_exits → MapOverlay. */
function worldMap(): MapState {
  return {
    current_location: "the_dropmouth",
    region: "The Dropmouth",
    explored: [
      { name: "Ropefoot", x: 0, y: 0, type: "region", connections: ["the_dropmouth"] },
      { name: "The Dropmouth", x: 1, y: 0, type: "region", connections: ["ropefoot"] },
    ],
    fog_bounds: { width: 10, height: 10 },
  };
}

/** Active site scene — a room graph with the site descriptor stamped on. */
function siteMap(): MapState & {
  siteId: string;
  siteName: string;
  archetype: string;
  extent: string;
} {
  return {
    current_location: "frontier:entrance",
    region: "frontier:entrance",
    explored: [
      {
        id: "frontier:entrance",
        name: "Entrance",
        x: 0,
        y: 0,
        type: "region",
        connections: ["frontier:r2"],
        room_exits: [{ target: "frontier:r2", exit_type: "corridor" }],
        room_type: "entrance",
        is_current_room: true,
      },
      {
        id: "frontier:r2",
        name: "The Rope Gallery",
        x: 0,
        y: 0,
        type: "region",
        connections: ["frontier:entrance"],
        room_exits: [{ target: "frontier:entrance", exit_type: "corridor" }],
        room_type: "normal",
        is_current_room: false,
      },
    ],
    fog_bounds: { width: 0, height: 0 },
    siteId: "frontier",
    siteName: "The Deep",
    archetype: "megadungeon",
    extent: "frontier",
  };
}

function roomRects(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll("rect[data-room-id]");
}

describe("MapWidget site scene (164-5 AC-4)", () => {
  it("foregrounds the site room graph when siteMap is set", () => {
    const { container, queryByTestId } = render(
      <MapWidget mapData={worldMap()} siteMap={siteMap()} />,
    );
    expect(queryByTestId("map-panel-room-graph")).toBeInTheDocument();
    expect(roomRects(container)).toHaveLength(2);
    // The world cartography must NOT be foregrounded while inside a site.
    expect(queryByTestId("map-overlay")).not.toBeInTheDocument();
  });

  it("renders a breadcrumb naming the site and the world region to drill out to", () => {
    const { getByTestId } = render(
      <MapWidget mapData={worldMap()} siteMap={siteMap()} />,
    );
    const crumb = getByTestId("map-site-breadcrumb");
    expect(crumb).toBeInTheDocument();
    // The site the player is inside …
    expect(crumb.textContent).toContain("The Deep");
    // … and the world region the drill-out returns to.
    expect(crumb.textContent).toContain("The Dropmouth");
  });

  it("drill-out is view-only: it reveals the world map, it does not move the party", () => {
    const { getByTestId, queryByTestId, container } = render(
      <MapWidget mapData={worldMap()} siteMap={siteMap()} />,
    );
    // Inside the site: the room graph is foregrounded.
    expect(queryByTestId("map-panel-room-graph")).toBeInTheDocument();

    // Drill out — a client-side view toggle, no travel.
    fireEvent.click(getByTestId("map-drill-out"));

    // Now the world cartography shows and the site room graph is backgrounded.
    // (The site data still lives in the prop — this is a view change, not a
    // party move: re-entering the site is a pure re-render, not a server round
    // trip.)
    expect(queryByTestId("map-overlay")).toBeInTheDocument();
    expect(roomRects(container)).toHaveLength(0);
  });

  it("shows no breadcrumb and no room graph when there is no active site", () => {
    const { queryByTestId } = render(
      <MapWidget mapData={worldMap()} siteMap={null} />,
    );
    expect(queryByTestId("map-site-breadcrumb")).not.toBeInTheDocument();
    expect(queryByTestId("map-panel-room-graph")).not.toBeInTheDocument();
    expect(queryByTestId("map-overlay")).toBeInTheDocument();
  });
});
