/**
 * Story 118-6 (ADR-144 F3f): state-mirror tests for FATE_ROLL (RED).
 *
 * FATE_ROLL is an EVENT (the DICE_RESULT analog, not a change-gated snapshot):
 * the server emits one resolved 4dF roll the moment a PC acts, and the client
 * keeps the LATEST as `fateRoll` so the Fate conflict surface can hand it to the
 * FateDiceTray (118-3, built but unmounted). Today the message type, the
 * `FateRollPayload`, and the `isFateRoll` guard all exist — but FATE_ROLL has NO
 * consumer in useStateMirror and `fateRoll` is not a ClientGameState field, so
 * the roll is orphaned (the dice tray has nothing to render). This wires it.
 *
 * No-Silent-Fallbacks: a malformed payload (dice not a 4-tuple) degrades to null
 * rather than storing garbage the tray throws on — mirrors the FATE_STATE
 * boundary guard in useStateMirror.fate.test.ts.
 *
 * RED today: `fateRoll` is undefined on the mirrored state (no field, no consumer).
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  GameStateProvider,
  useGameState,
  type ClientGameState,
} from "../../providers/GameStateProvider";
import { useStateMirror } from "../../hooks/useStateMirror";
import { MessageType, type GameMessage } from "../../types/protocol";
import type { FateRollPayload } from "../../types/payloads";

// `fateRoll` is not yet a ClientGameState field — widen at the read site so this
// RED test compiles before the field lands and stays correct after (the runtime
// RED signal is the missing consumer, not a type error).
type WithFateRoll = ClientGameState & { fateRoll?: FateRollPayload | null };

function wrapper({ children }: { children: ReactNode }) {
  return createElement(GameStateProvider, null, children);
}

function mirror(messages: GameMessage[]) {
  const { result } = renderHook(
    () => {
      useStateMirror(messages);
      return useGameState();
    },
    { wrapper },
  );
  return result;
}

function rollMsg(payload: FateRollPayload): GameMessage {
  return {
    type: MessageType.FATE_ROLL,
    payload: payload as unknown as Record<string, unknown>,
    player_id: "",
  };
}

const SUCCEED: FateRollPayload = {
  dice: [1, 1, 0, -1],
  roll_total: 1,
  ladder_total: 4,
  ladder_name: "Great",
  opposition: 2,
  shifts: 2,
  tier: "Succeed",
  succeeded_with_style: false,
};

const STYLE: FateRollPayload = {
  dice: [1, 1, 1, 0],
  roll_total: 3,
  ladder_total: 6,
  ladder_name: "Fantastic",
  opposition: 3,
  shifts: 3,
  tier: "SucceedWithStyle",
  succeeded_with_style: true,
};

describe("useStateMirror — FATE_ROLL (Story 118-6 / ADR-144 F3f)", () => {
  it("starts with the fate roll null", () => {
    const result = mirror([]);
    expect((result.current.state as WithFateRoll).fateRoll).toBeNull();
  });

  it("populates fateRoll from a FATE_ROLL message", () => {
    const result = mirror([rollMsg(SUCCEED)]);
    const roll = (result.current.state as WithFateRoll).fateRoll;
    expect(roll?.tier).toBe("Succeed");
    expect(roll?.dice).toEqual([1, 1, 0, -1]);
    expect(roll?.ladder_name).toBe("Great");
  });

  it("a later FATE_ROLL replaces the prior roll (latest-wins event, like DICE_RESULT)", () => {
    const result = mirror([rollMsg(SUCCEED), rollMsg(STYLE)]);
    const roll = (result.current.state as WithFateRoll).fateRoll;
    expect(roll?.tier).toBe("SucceedWithStyle");
    expect(roll?.succeeded_with_style).toBe(true);
  });

  it("degrades a malformed FATE_ROLL (dice not a 4-tuple) to null", () => {
    const malformed = { ...SUCCEED, dice: "nope" } as unknown as FateRollPayload;
    const result = mirror([rollMsg(malformed)]);
    expect((result.current.state as WithFateRoll).fateRoll).toBeNull();
  });
});
