/**
 * Story 118-7 (ADR-144 F3g): state-mirror tests for the FATE_ROLL event (RED).
 *
 * 118-3 shipped the FATE_ROLL message + FateDiceTray, but nothing routes the
 * roll into client state, so the tray has no production consumer. This wires it:
 * FATE_ROLL (detected via `isFateRoll`) threads the latest roll onto state as
 * `latestFateRoll`.
 *
 * UNLIKE FATE_STATE (a snapshot — full replace, always mirrored), FATE_ROLL is
 * an EVENT: each message is the latest roll, the most recent wins, and it starts
 * null until the first roll arrives (and only ever arrives on a ruleset=='fate'
 * pack — the server gate).
 *
 * No-Silent-Fallbacks: a malformed roll (no `dice` tuple) must NOT reach the
 * tray, whose `roll.dice.map(...)` would throw and white-screen the panel — the
 * mirror drops it and leaves `latestFateRoll` unchanged. Mirrors the FATE_STATE
 * boundary guard in useStateMirror.ts.
 *
 * Drives the REAL hook via renderHook over a GameStateProvider wrapper —
 * identical harness to useStateMirror.fate.test.ts.
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

function rollMsg(payload: FateRollPayload, playerId = "p1"): GameMessage {
  return {
    type: MessageType.FATE_ROLL,
    payload: payload as unknown as Record<string, unknown>,
    player_id: playerId,
  };
}

function roll(ladderTotal: number, tier: string): FateRollPayload {
  return {
    dice: [1, 1, 0, -1],
    roll_total: 1,
    ladder_total: ladderTotal,
    ladder_name: tier === "SucceedWithStyle" ? "Fantastic" : "Great",
    opposition: 2,
    shifts: 2,
    tier,
    succeeded_with_style: tier === "SucceedWithStyle",
  };
}

describe("useStateMirror — FATE_ROLL (Story 118-7 / ADR-144 F3g)", () => {
  it("starts with the latest fate roll null", () => {
    const result = mirror([]);
    // Assert directly (no `?? null`) so a missing EMPTY_GAME_STATE default —
    // undefined, not null — is caught.
    expect(result.current.state.latestFateRoll).toBeNull();
  });

  it("populates latestFateRoll from a FATE_ROLL message", () => {
    const result = mirror([rollMsg(roll(4, "Succeed"))]);
    expect(result.current.state.latestFateRoll).not.toBeNull();
    expect(result.current.state.latestFateRoll?.tier).toBe("Succeed");
    expect(result.current.state.latestFateRoll?.dice).toHaveLength(4);
  });

  it("a later FATE_ROLL replaces the prior one (event — latest wins)", () => {
    const result = mirror([
      rollMsg(roll(4, "Succeed")),
      rollMsg(roll(6, "SucceedWithStyle")),
    ]);
    expect(result.current.state.latestFateRoll?.tier).toBe("SucceedWithStyle");
    expect(result.current.state.latestFateRoll?.succeeded_with_style).toBe(true);
  });

  // No-Silent-Fallbacks: a malformed roll (missing the dice tuple) would crash
  // the tray's `roll.dice.map(...)`. The mirror must drop it, not store garbage.
  it("drops a malformed FATE_ROLL (missing dice) rather than storing it", () => {
    const malformed = { tier: "Succeed" } as unknown as FateRollPayload;
    const result = mirror([rollMsg(malformed)]);
    expect(result.current.state.latestFateRoll).toBeNull();
  });

  it("keeps a valid roll after a malformed one is rejected", () => {
    const malformed = { tier: "Fail" } as unknown as FateRollPayload;
    const result = mirror([
      rollMsg(roll(4, "Succeed")),
      rollMsg(malformed),
    ]);
    // The malformed roll is ignored; the last VALID roll stands.
    expect(result.current.state.latestFateRoll?.tier).toBe("Succeed");
  });
});
