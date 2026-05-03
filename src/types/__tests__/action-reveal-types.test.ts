import { describe, it, expect } from "vitest";
import { MessageType } from "../protocol";
import type { ActionRevealEntry, ActionRevealStatus } from "../payloads";

describe("ActionReveal types", () => {
  it("MessageType.ACTION_REVEAL exists", () => {
    expect(MessageType.ACTION_REVEAL).toBe("ACTION_REVEAL");
  });

  it("ActionRevealEntry carries status, action, aside, seq, round", () => {
    const entry: ActionRevealEntry = {
      player_id: "p1",
      character_name: "Alex",
      status: "composing" as ActionRevealStatus,
      action: "I sneak in",
      aside: false,
      seq: 3,
      round: 7,
    };
    expect(entry.status).toBe("composing");
    expect(entry.seq).toBe(3);
    expect(entry.aside).toBe(false);
    expect(entry.round).toBe(7);
  });

  it("ActionRevealStatus union covers all three lifecycle states", () => {
    const composing: ActionRevealStatus = "composing";
    const submitted: ActionRevealStatus = "submitted";
    const cleared: ActionRevealStatus = "cleared";
    expect([composing, submitted, cleared]).toEqual([
      "composing",
      "submitted",
      "cleared",
    ]);
  });

  it("submitted entry preserves original character_name + action contract", () => {
    const entry: ActionRevealEntry = {
      player_id: "p1",
      character_name: "Alex",
      status: "submitted",
      action: "I draw my sword",
      aside: false,
      seq: 4,
      round: 7,
    };
    // Existing fields stay required, no shape regression.
    expect(entry.character_name).toBe("Alex");
    expect(entry.action).toBe("I draw my sword");
  });
});
