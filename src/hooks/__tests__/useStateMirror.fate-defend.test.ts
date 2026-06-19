/**
 * Story 126-17 (ADR-148/149): state-mirror tests for the FATE_DEFEND_REQUEST
 * event (RED).
 *
 * The server (126-8) broadcasts a FATE_DEFEND_REQUEST when the round PARKS at the
 * DEFEND barrier, but nothing routes it into client state today, so the defend
 * tray has no production consumer and the message is dropped. This wires the
 * wire->mirror half: FATE_DEFEND_REQUEST threads the latest request onto state as
 * `latestFateDefendRequest`.
 *
 * Like FATE_ROLL (and UNLIKE the FATE_STATE snapshot), the request is an EVENT:
 * each message is the latest request, the most recent wins, and it starts null
 * until the first request arrives (only ever on a ruleset=='fate' pack — the
 * server gate). No-Silent-Fallbacks: a malformed request (no defender — the
 * routing key the surface filters on) must NOT overwrite the last valid one; the
 * mirror drops it and leaves the slice unchanged. Mirrors the FATE_ROLL /
 * FATE_STATE boundary guards in useStateMirror.ts.
 *
 * Drives the REAL hook via renderHook over a GameStateProvider wrapper — identical
 * harness to useStateMirror.fateRoll.test.ts.
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
import type { FateDefendRequestPayload } from "../../types/payloads";

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

function defendMsg(
  payload: Partial<FateDefendRequestPayload>,
  playerId = "p1",
): GameMessage {
  return {
    type: MessageType.FATE_DEFEND_REQUEST,
    payload: payload as unknown as Record<string, unknown>,
    player_id: playerId,
  };
}

function req(
  request_id: string,
  defender: string,
  attack_total: number,
): FateDefendRequestPayload {
  return {
    request_id,
    defender,
    attacker: "The Fat Man",
    attack_skill: "Shoot",
    attack_total,
    mental: false,
  };
}

describe("useStateMirror — FATE_DEFEND_REQUEST event (Story 126-17)", () => {
  it("starts null when no FATE_DEFEND_REQUEST has arrived", () => {
    const r = mirror([]);
    expect(r.current.state.latestFateDefendRequest).toBeNull();
  });

  it("threads the request onto state.latestFateDefendRequest", () => {
    const payload = req("d-1", "Sam Spadework", 5);
    const r = mirror([defendMsg(payload)]);
    expect(r.current.state.latestFateDefendRequest).toEqual(payload);
  });

  it("is an EVENT — the most recent request wins", () => {
    const r = mirror([
      defendMsg(req("d-1", "Sam Spadework", 4)),
      defendMsg(req("d-2", "Sam Spadework", 6)),
    ]);
    expect(r.current.state.latestFateDefendRequest?.request_id).toBe("d-2");
    expect(r.current.state.latestFateDefendRequest?.attack_total).toBe(6);
  });

  it("drops a malformed request (missing defender) and leaves the slice unchanged (No Silent Fallbacks)", () => {
    const r = mirror([
      defendMsg(req("d-1", "Sam Spadework", 5)),
      // No `defender` — the routing key the surface filters on. A defender-less
      // request must not overwrite the last valid one nor crash the surface.
      defendMsg({ request_id: "d-2", attacker: "X", attack_skill: "Shoot", attack_total: 9 }),
    ]);
    expect(r.current.state.latestFateDefendRequest?.request_id).toBe("d-1");
  });

  // Rework (Reviewer [HIGH] [SILENT][RULE], 2026-06-19): the guard must validate the
  // MECHANICAL fields too, not just the routing keys — a version-skewed payload with
  // valid request_id/defender but a missing attack_total renders a blank/wrong total on
  // the mechanics-first defend tray (118-5 anti-drift), a silent No-Silent-Fallbacks
  // corruption. Mirror the FATE_ROLL guard, which validates EVERY face value.
  it("drops a request missing attack_total and leaves the slice unchanged (No Silent Fallbacks)", () => {
    const r = mirror([
      defendMsg(req("d-1", "Sam Spadework", 5)),
      // request_id + defender present, but attack_total absent — the committed-attack
      // number the tray shows. Must not pass the guard.
      defendMsg({ request_id: "d-2", defender: "Sam Spadework", attacker: "X", attack_skill: "Shoot" }),
    ]);
    expect(r.current.state.latestFateDefendRequest?.request_id).toBe("d-1");
  });

  it("drops a request with a non-number attack_total", () => {
    const r = mirror([
      defendMsg(req("d-1", "Sam Spadework", 5)),
      defendMsg({
        request_id: "d-2",
        defender: "Sam Spadework",
        attacker: "X",
        attack_skill: "Shoot",
        attack_total: "lots" as unknown as number,
      }),
    ]);
    expect(r.current.state.latestFateDefendRequest?.request_id).toBe("d-1");
  });

  it("drops a request missing attacker", () => {
    const r = mirror([
      defendMsg(req("d-1", "Sam Spadework", 5)),
      defendMsg({ request_id: "d-2", defender: "Sam Spadework", attack_skill: "Shoot", attack_total: 9 }),
    ]);
    expect(r.current.state.latestFateDefendRequest?.request_id).toBe("d-1");
  });

  it("drops a request missing attack_skill", () => {
    const r = mirror([
      defendMsg(req("d-1", "Sam Spadework", 5)),
      defendMsg({ request_id: "d-2", defender: "Sam Spadework", attacker: "X", attack_total: 9 }),
    ]);
    expect(r.current.state.latestFateDefendRequest?.request_id).toBe("d-1");
  });

  // CRITICAL anti-regression for the fix: attack_total === 0 is a VALID Fate value (an
  // attack defended down to zero / a +0 ladder). The guard must check `typeof === 'number'`,
  // NOT truthiness — a truthiness check would silently drop a legitimate zero-total attack.
  it("KEEPS a request with attack_total === 0 (zero is a valid total — guard must use typeof, not truthiness)", () => {
    const zero = req("d-zero", "Sam Spadework", 0);
    const r = mirror([defendMsg(zero)]);
    expect(r.current.state.latestFateDefendRequest?.request_id).toBe("d-zero");
    expect(r.current.state.latestFateDefendRequest?.attack_total).toBe(0);
  });
});
