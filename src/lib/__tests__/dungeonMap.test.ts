// Story 158-6 — deep-view region nodes get DISTINCT labels.
//
// FINDING (sq-playtest 2026-06-22, beneath_sunden): in the Map-tab deep-view,
// distinct procedural regions collapse to duplicate "The Drowned Cavern" labels.
// ROOT CAUSE: the server labels each region by its THEME display name
// (map_emit.py `_build_dungeon_map_payload`: name = palette.get(node.theme)
// .display_name), and a megadungeon theme spans many regions — so every region
// of one theme arrives with an identical `name` while its `id` stays distinct.
//
// `dungeonMapToMapState` now disambiguates colliding labels by numbering the
// duplicates in payload order ("The Drowned Cavern 1/2/3"), keyed off the
// distinct id, without touching id / connections / room_exits (graph topology).

import { describe, it, expect } from "vitest";
import { dungeonMapToMapState, type DungeonMapPayload } from "@/lib/dungeonMap";

/** A DUNGEON_MAP frame whose three distinct regions share one theme label. */
function drownedCavernFrame(): DungeonMapPayload {
  return {
    current_location: "exp001.r2",
    region: "exp001.r2",
    explored: [
      {
        id: "entrance",
        name: "The Rope Gallery",
        type: "region",
        connections: ["exp001.r1"],
        room_exits: [{ target: "exp001.r1", exit_type: "corridor" }],
        room_type: "entrance",
        is_current_room: false,
      },
      {
        id: "exp001.r1",
        name: "The Drowned Cavern",
        type: "region",
        connections: ["entrance", "exp001.r2"],
        room_exits: [
          { target: "entrance", exit_type: "corridor" },
          { target: "exp001.r2", exit_type: "corridor" },
        ],
        room_type: "normal",
        is_current_room: false,
      },
      {
        id: "exp001.r2",
        name: "The Drowned Cavern",
        type: "region",
        connections: ["exp001.r1", "exp002.r3"],
        room_exits: [
          { target: "exp001.r1", exit_type: "corridor" },
          { target: "exp002.r3", exit_type: "stairs" },
        ],
        room_type: "normal",
        is_current_room: true,
      },
      {
        id: "exp002.r3",
        name: "The Drowned Cavern",
        type: "region",
        connections: ["exp001.r2"],
        room_exits: [{ target: "exp001.r2", exit_type: "stairs" }],
        room_type: "normal",
        is_current_room: false,
      },
    ],
  };
}

describe("dungeonMapToMapState — distinct labels for theme-shared regions (158-6)", () => {
  it("numbers duplicate region labels so each node is distinguishable", () => {
    const state = dungeonMapToMapState(drownedCavernFrame());
    const names = state.explored.map((l) => l.name);

    // The three "The Drowned Cavern" regions become distinct, ordered labels.
    expect(names).toEqual([
      "The Rope Gallery",
      "The Drowned Cavern 1",
      "The Drowned Cavern 2",
      "The Drowned Cavern 3",
    ]);
    // No duplicate labels survive: distinct nodes → distinct labels.
    expect(new Set(names).size).toBe(names.length);
  });

  it("leaves a label that occurs once untouched (no spurious numbering)", () => {
    const state = dungeonMapToMapState(drownedCavernFrame());
    expect(state.explored[0].name).toBe("The Rope Gallery");
  });

  it("never collapses nodes — node count equals the discovered set", () => {
    const frame = drownedCavernFrame();
    const state = dungeonMapToMapState(frame);
    expect(state.explored).toHaveLength(frame.explored.length);
    // Distinct ids are preserved verbatim (the key the Automapper joins on).
    expect(state.explored.map((l) => l.id)).toEqual([
      "entrance",
      "exp001.r1",
      "exp001.r2",
      "exp002.r3",
    ]);
  });

  it("never rewrites id / connections / room_exits — graph topology is preserved", () => {
    const frame = drownedCavernFrame();
    const state = dungeonMapToMapState(frame);
    // Connections/exits still reference the original region IDS, not the
    // renumbered display labels — so the Automapper can still join the graph.
    const current = state.explored.find((l) => l.id === "exp001.r2")!;
    expect(current.connections).toEqual(["exp001.r1", "exp002.r3"]);
    expect(current.room_exits?.map((e) => e.target)).toEqual([
      "exp001.r1",
      "exp002.r3",
    ]);
    expect(current.is_current_room).toBe(true);
  });

  it("is stable as the discovered set grows: existing labels keep their number", () => {
    // Turn N: two drowned-cavern regions discovered.
    const small: DungeonMapPayload = {
      current_location: "exp001.r1",
      region: "exp001.r1",
      explored: [
        { id: "exp001.r1", name: "The Drowned Cavern", type: "region", connections: [] },
        { id: "exp001.r2", name: "The Drowned Cavern", type: "region", connections: [] },
      ],
    };
    const smallNames = dungeonMapToMapState(small).explored.map((l) => l.name);
    expect(smallNames).toEqual(["The Drowned Cavern 1", "The Drowned Cavern 2"]);

    // Turn N+1: a third region is APPENDED (fog-of-war reveal). The first two
    // keep their numbers; only the new tail gets the next ordinal.
    const grown: DungeonMapPayload = {
      ...small,
      explored: [
        ...small.explored,
        { id: "exp002.r3", name: "The Drowned Cavern", type: "region", connections: [] },
      ],
    };
    const grownNames = dungeonMapToMapState(grown).explored.map((l) => l.name);
    expect(grownNames).toEqual([
      "The Drowned Cavern 1",
      "The Drowned Cavern 2",
      "The Drowned Cavern 3",
    ]);
  });
});
