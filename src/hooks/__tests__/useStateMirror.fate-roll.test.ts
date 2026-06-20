/**
 * Story 118-6 (ADR-144 F3f): state-mirror tests for FATE_ROLL (RED).
 *
 * FATE_ROLL is an EVENT (the DICE_RESULT analog, not a change-gated snapshot):
 * the server emits one resolved 4dF roll the moment a PC acts, and the client
 * keeps the LATEST as `latestFateRoll` so the Fate conflict surface can hand it
 * to the FateDiceTray (118-3). The slice is shared with the Character→Stats roll
 * tray (118-7 F3g): one mirror field, two consumers (the conflict surface here,
 * and the Character→Stats non-conflict roll tray).
 *
 * No-Silent-Fallbacks: a malformed payload (dice not a 4-tuple) degrades to null
 * rather than storing garbage the tray throws on — mirrors the FATE_STATE
 * boundary guard in useStateMirror.fate.test.ts.
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  GameStateProvider,
  useGameState,
} from "../../providers/GameStateProvider";
import { useStateMirror } from "../../hooks/useStateMirror";
import { MessageType, type GameMessage } from "../../types/protocol";
import type { FateRollPayload } from "../../types/payloads";

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
  throw_params: { velocity: [1, 2, -0.5], angular: [0.5, 0.5, 0.5], position: [0.5, 0.5] },
  seed: 4242,
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
  throw_params: { velocity: [-2, 1, 3], angular: [-1, 2, -0.5], position: [0.7, 0.3] },
  seed: 2002,
};

describe("useStateMirror — FATE_ROLL (Story 118-6 / ADR-144 F3f)", () => {
  it("starts with the fate roll null", () => {
    const result = mirror([]);
    expect(result.current.state.latestFateRoll).toBeNull();
  });

  it("populates latestFateRoll from a FATE_ROLL message", () => {
    const result = mirror([rollMsg(SUCCEED)]);
    const roll = result.current.state.latestFateRoll;
    expect(roll?.tier).toBe("Succeed");
    expect(roll?.dice).toEqual([1, 1, 0, -1]);
    expect(roll?.ladder_name).toBe("Great");
  });

  it("a later FATE_ROLL replaces the prior roll (latest-wins event, like DICE_RESULT)", () => {
    const result = mirror([rollMsg(SUCCEED), rollMsg(STYLE)]);
    const roll = result.current.state.latestFateRoll;
    expect(roll?.tier).toBe("SucceedWithStyle");
    expect(roll?.succeeded_with_style).toBe(true);
  });

  it("degrades a malformed FATE_ROLL (dice not a 4-tuple) to null", () => {
    const malformed = { ...SUCCEED, dice: "nope" } as unknown as FateRollPayload;
    const result = mirror([rollMsg(malformed)]);
    expect(result.current.state.latestFateRoll).toBeNull();
  });
});
