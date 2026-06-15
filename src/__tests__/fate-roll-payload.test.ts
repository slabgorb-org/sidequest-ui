/**
 * RED tests for Story 118-3 (ADR-144 F3c) — the UI half of the 4dF roll wire
 * contract. The client must be able to ROUTE a FATE_ROLL frame: a typed
 * `FateRollPayload`, a `FateRollMessage` in the `TypedGameMessage` union, a
 * `MessageType.FATE_ROLL` enum value, and an `isFateRoll` guard (mirrors the
 * DICE_RESULT pattern at payloads.ts).
 *
 * FAIL today: there is no Fate message anywhere in the UI types
 * (`TypedGameMessage` has no FATE_STATE either — F3b never landed). The guard
 * and enum are runtime values, so their absence fails these assertions cleanly.
 */
import { describe, it, expect } from "vitest";
import { MessageType } from "@/types/protocol";
import { isFateRoll, type FateRollMessage, type FateRollPayload } from "@/types/payloads";

const PAYLOAD: FateRollPayload = {
  dice: [1, 1, 0, -1],
  roll_total: 1,
  ladder_total: 4,
  ladder_name: "Great",
  opposition: 2,
  shifts: 2,
  tier: "Succeed",
  succeeded_with_style: false,
};

const FATE_ROLL_MSG: FateRollMessage = {
  type: MessageType.FATE_ROLL,
  player_id: "",
  payload: PAYLOAD,
};

describe("FATE_ROLL wire contract (UI)", () => {
  it("MessageType.FATE_ROLL is defined and equals 'FATE_ROLL'", () => {
    expect(MessageType.FATE_ROLL).toBe("FATE_ROLL");
  });

  it("isFateRoll narrows a FATE_ROLL message", () => {
    expect(isFateRoll(FATE_ROLL_MSG)).toBe(true);
  });

  it("isFateRoll rejects a non-FATE_ROLL message", () => {
    const other = { type: MessageType.DICE_RESULT, player_id: "" } as never;
    expect(isFateRoll(other)).toBe(false);
  });
});
