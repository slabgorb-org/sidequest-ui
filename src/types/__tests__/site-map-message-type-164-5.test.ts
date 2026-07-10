// Story 164-5 AC-1 — the client MessageType must NAME the SITE_MAP frame, and
// the retired DUNGEON_MAP frame name must be GONE.
//
// The 164-4 server cutover renamed the emit `emit_fn(msg, "SITE_MAP")`
// (map_emit.py). The client half completes the rename: without `SITE_MAP` in the
// MessageType const, App.tsx cannot switch on it and the frame is silently
// dropped — which is exactly today's bug (the client still only knows
// DUNGEON_MAP). This is a CUTOVER, not a coexistence: DUNGEON_MAP must not
// linger as a straggler (AC-1). Supersedes the retired 153-25 DUNGEON_MAP test.
//
// Uses Object.keys/Object.values rather than `MessageType.SITE_MAP` directly so
// the file still type-checks in the RED state (where the key does not yet
// exist) — the assertions fail loudly instead of the file failing to compile.

import { describe, it, expect } from "vitest";
import { MessageType } from "@/types/protocol";

describe("MessageType.SITE_MAP (164-5 AC-1)", () => {
  it('names SITE_MAP, mirroring the server emit_fn(msg, "SITE_MAP")', () => {
    expect(Object.keys(MessageType)).toContain("SITE_MAP");
    expect(Object.values(MessageType)).toContain("SITE_MAP");
  });

  it('follows the const-object key===value convention (MessageType.SITE_MAP === "SITE_MAP")', () => {
    const map = MessageType as Record<string, string>;
    expect(map.SITE_MAP).toBe("SITE_MAP");
  });

  it("removes the retired DUNGEON_MAP frame name — this is a cutover, not a coexistence", () => {
    expect(Object.keys(MessageType)).not.toContain("DUNGEON_MAP");
    expect(Object.values(MessageType)).not.toContain("DUNGEON_MAP");
  });

  it("keeps SITE_MAP distinct from the surface MAP_UPDATE it coexists with", () => {
    const map = MessageType as Record<string, string>;
    // typeof guard first so this does not pass vacuously in RED, where
    // `map.SITE_MAP` is undefined and `undefined !== "MAP_UPDATE"` is
    // trivially true. The frame must be a real string AND distinct.
    expect(typeof map.SITE_MAP).toBe("string");
    expect(map.SITE_MAP).not.toBe(MessageType.MAP_UPDATE);
  });
});
