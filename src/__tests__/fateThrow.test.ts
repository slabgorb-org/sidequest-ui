// Story 126-7 (ADR-148): the FATE_THROW client→server message builder.
//
// A proactive Fate roll verb now sends FATE_THROW carrying the authoritative
// 4 settled dF faces + the throw gesture (the Fate analog of DICE_THROW), not
// the intent-only FATE_ACTION. This pins the wire shape the App send path uses.
import { describe, it, expect } from "vitest";
import { MessageType } from "../types/protocol";
import { makeFateThrowMessage } from "../lib/fateThrow";

describe("FATE_THROW", () => {
  it("builds a wire message with authoritative faces + gesture", () => {
    const msg = makeFateThrowMessage({
      request_id: "r1",
      action: "overcome",
      skill: "Athletics",
      throw_params: { velocity: [0, 4, -1], angular: [0.5, 0.5, 0.5], position: [0.5, 0.5] },
      face: [1, 0, -1, 1],
    });
    expect(msg.type).toBe(MessageType.FATE_THROW);
    expect(msg.payload.face).toEqual([1, 0, -1, 1]);
    expect(msg.payload.action).toBe("overcome");
    expect(msg.payload.throw_params.velocity).toEqual([0, 4, -1]);
  });

  it("defaults player_id to empty when not supplied", () => {
    const msg = makeFateThrowMessage({
      request_id: "r2",
      action: "attack",
      skill: "Fight",
      throw_params: { velocity: [0, 4, -1], angular: [0, 0, 0], position: [0.5, 0.5] },
      face: [1, 1, 1, 0],
    });
    expect(msg.player_id).toBe("");
  });
});
