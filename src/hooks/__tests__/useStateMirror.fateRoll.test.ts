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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    throw_params: { velocity: [1, 2, -0.5], angular: [0.5, 0.5, 0.5], position: [0.5, 0.5] },
    seed: 4242,
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

// Story 125-5 (ADR-144 F3g, deferred from 118-7): the guard must reject a
// payload that has the right SHAPE (4-element dice tuple) but an out-of-range
// FACE. A Fudge die face is only ever -1, 0, or +1; a 2 or -5 means the wire
// payload is corrupt/replayed and would render a wrong glyph (FateDiceTray's
// faceGlyph degrades any out-of-range value to '0'). Drop it loudly, same as
// the missing/wrong-length case — No-Silent-Fallbacks.
describe("useStateMirror — FATE_ROLL face-value boundary (Story 125-5)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function rollWithDice(dice: number[]): FateRollPayload {
    return { ...roll(4, "Succeed"), dice };
  }

  it("rejects a FATE_ROLL with a face of 2 (out of range), not storing it", () => {
    const result = mirror([rollMsg(rollWithDice([2, 1, 0, -1]))]);
    expect(result.current.state.latestFateRoll).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("rejects a FATE_ROLL with a face of -5 (out of range), not storing it", () => {
    const result = mirror([rollMsg(rollWithDice([-5, 0, 1, 1]))]);
    expect(result.current.state.latestFateRoll).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("accepts a FATE_ROLL with all faces in {-1,0,1} and stores it", () => {
    const result = mirror([rollMsg(rollWithDice([-1, 0, 0, 1]))]);
    expect(result.current.state.latestFateRoll).not.toBeNull();
    expect(result.current.state.latestFateRoll?.dice).toEqual([-1, 0, 0, 1]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("keeps the prior valid roll when a face-range violation is rejected", () => {
    const result = mirror([
      rollMsg(rollWithDice([0, 0, 1, -1])),
      rollMsg(rollWithDice([3, 0, 0, 0])),
    ]);
    // The out-of-range second roll is dropped; the last VALID roll stands.
    expect(result.current.state.latestFateRoll?.dice).toEqual([0, 0, 1, -1]);
  });
});
