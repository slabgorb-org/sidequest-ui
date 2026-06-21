// Story 153-25 AC-1 — the DUNGEON_MAP frame must be NAMED on the client.
//
// The server already broadcasts a DUNGEON_MAP frame
// (sidequest-server .../map_emit.py:957 `emit_fn(msg, "DUNGEON_MAP")`), but the
// client `MessageType` const has no DUNGEON_MAP entry (only MAP_UPDATE). Without
// the name, App.tsx cannot switch on it and the room-graph frame is silently
// dropped at the client — the exact gap 153-25 fixes.
//
// Uses Object.keys/Object.values rather than `MessageType.DUNGEON_MAP` directly
// so the file still type-checks in the RED state (where the key does not yet
// exist) — the assertions fail loudly instead of the file failing to compile.

import { describe, it, expect } from "vitest";
import { MessageType } from "@/types/protocol";

describe("MessageType.DUNGEON_MAP (153-25 AC-1)", () => {
  it("is named on the client MessageType const, mirroring the server frame name", () => {
    expect(Object.keys(MessageType)).toContain("DUNGEON_MAP");
    expect(Object.values(MessageType)).toContain("DUNGEON_MAP");
  });

  it("follows the const-object key===value convention (so MessageType.DUNGEON_MAP === \"DUNGEON_MAP\")", () => {
    const map = MessageType as Record<string, string>;
    expect(map.DUNGEON_MAP).toBe("DUNGEON_MAP");
  });

  it("is a defined frame name, distinct from MAP_UPDATE (the surface-cartography frame it coexists with)", () => {
    const map = MessageType as Record<string, string>;
    // typeof guard first so this does not pass vacuously in RED, where
    // `map.DUNGEON_MAP` is undefined and `undefined !== "MAP_UPDATE"` is
    // trivially true. The frame must be a real string AND distinct.
    expect(typeof map.DUNGEON_MAP).toBe("string");
    expect(map.DUNGEON_MAP).not.toBe(MessageType.MAP_UPDATE);
  });
});
