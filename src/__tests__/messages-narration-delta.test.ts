import { describe, it, expect } from "vitest";
import { isNarrationDelta, type NarrationDelta } from "../types/payloads";

describe("NarrationDelta type and guard", () => {
  it("isNarrationDelta returns true for a narration.delta message", () => {
    const msg: NarrationDelta = {
      kind: "narration.delta",
      payload: {
        turn_id: "t-1",
        chunk: "Hello",
        seq: 0,
      },
    };

    expect(isNarrationDelta(msg)).toBe(true);
  });

  it("isNarrationDelta returns false for a canonical narration message", () => {
    const msg = {
      type: "NARRATION",
      payload: {
        text: "Hello, world!",
      },
      player_id: "player-1",
    };

    expect(isNarrationDelta(msg)).toBe(false);
  });
});
