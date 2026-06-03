import { describe, it, expect } from "vitest";
import { resolveRootArchetype } from "@/App";

// The leak regression. Before this story, App ran `useChromeArchetype(currentGenre)`
// on <html>, and `currentGenre` held the LAST-ENTERED world's genre — so the lobby
// rendered under a stale genre archetype. `resolveRootArchetype` is the seam: it must
// return the neutral `house` chrome whenever the lobby (connect phase) is showing,
// regardless of whatever genre was last entered.
describe("lobby root archetype (leak fix)", () => {
  it("is house during the connect phase regardless of last genre", () => {
    expect(resolveRootArchetype("connect", "space_opera")).toBe("house");
    expect(resolveRootArchetype("connect", "wry_whimsy")).toBe("house");
    expect(resolveRootArchetype("connect", null)).toBe("house");
  });

  it("is the genre archetype during creation and game", () => {
    expect(resolveRootArchetype("creation", "space_opera")).toBe("terminal");
    expect(resolveRootArchetype("game", "road_warrior")).toBe("rugged");
    expect(resolveRootArchetype("game", "low_fantasy")).toBe("parchment");
  });

  it("is null in non-connect phases when no genre is set", () => {
    expect(resolveRootArchetype("creation", null)).toBeNull();
    expect(resolveRootArchetype("game", null)).toBeNull();
  });
});
