/**
 * Story 118-2 (ADR-144 F3b): state-mirror tests for the Fate spine (RED).
 *
 * FATE_STATE is a snapshot message (the RELATIONSHIPS / QUESTS analog): every
 * message is a FULL replace of the projected Fate state (no incremental
 * accumulation), matching the LOCATION_DESCRIPTION / RELATIONSHIPS / QUESTS
 * snapshot contract. It threads onto state as `fateState`.
 *
 * No-Silent-Fallbacks: the mirror validates the payload at the boundary so a
 * malformed wire payload (version skew, serialization bug) degrades to null —
 * and the panel renders its empty state — rather than storing garbage that
 * throws in the render path. Mirrors the QUESTS boundary guard in
 * useStateMirror.ts (and the fact_id guard alongside it).
 *
 * Mirrors the harness in useStateMirror.quests.test.ts — drives the REAL hook
 * via renderHook over a GameStateProvider wrapper.
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
import type { FateStatePayload } from "../../types/payloads";

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

function fateMsg(payload: FateStatePayload): GameMessage {
  return {
    type: MessageType.FATE_STATE,
    payload: payload as unknown as Record<string, unknown>,
    player_id: "",
  };
}

function payload(name: string, fatePoints: number): FateStatePayload {
  return {
    characters: [
      {
        name,
        fate_points: fatePoints,
        refresh: 3,
        skills: [{ name: "Investigate", rating: 4, ladder: "Great" }],
        aspects: [
          {
            text: "Hard-boiled detective",
            kind: "high_concept",
            free_invokes: 0,
          },
        ],
        stress: { physical: [{ value: 1, checked: false }], mental: [] },
        consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
      },
    ],
    scene_aspects: [
      { text: "Rain-slicked streets", kind: "situation", free_invokes: 0 },
    ],
    conflict: null,
  };
}

describe("useStateMirror — FATE_STATE (Story 118-2 / ADR-144 F3b)", () => {
  it("starts with the fate projection null", () => {
    const result = mirror([]);
    // Assert directly (no `?? null` coercion) so a misspelled field or a missing
    // EMPTY_GAME_STATE default — undefined, not null — is caught.
    expect(result.current.state.fateState).toBeNull();
  });

  it("populates fateState from a FATE_STATE message", () => {
    const result = mirror([fateMsg(payload("Sam Spadework", 3))]);
    expect(result.current.state.fateState?.characters).toHaveLength(1);
    expect(result.current.state.fateState?.characters[0].name).toBe(
      "Sam Spadework",
    );
    expect(result.current.state.fateState?.characters[0].fate_points).toBe(3);
  });

  it("a later FATE_STATE message fully replaces the prior projection (snapshot)", () => {
    const result = mirror([
      fateMsg(payload("Sam Spadework", 3)),
      fateMsg(payload("Effie Perine", 1)),
    ]);
    expect(result.current.state.fateState?.characters).toHaveLength(1);
    expect(result.current.state.fateState?.characters[0].name).toBe(
      "Effie Perine",
    );
    expect(result.current.state.fateState?.characters[0].fate_points).toBe(1);
  });

  // No-Silent-Fallbacks: a malformed payload (missing the characters array)
  // must degrade to null — the panel then renders its empty state — rather than
  // storing garbage that throws on render. Boundary validation is the project
  // idiom (cf. the QUESTS guard in useStateMirror.ts).
  it("degrades a malformed FATE_STATE payload (missing characters) to null", () => {
    const malformed = { scene_aspects: [], conflict: null } as unknown as FateStatePayload;
    const result = mirror([fateMsg(malformed)]);
    expect(result.current.state.fateState).toBeNull();
  });

  it("degrades a FATE_STATE payload whose characters is not an array to null", () => {
    const malformed = {
      characters: "nope",
      scene_aspects: [],
      conflict: null,
    } as unknown as FateStatePayload;
    const result = mirror([fateMsg(malformed)]);
    expect(result.current.state.fateState).toBeNull();
  });

  it("degrades a FATE_STATE payload with a non-array scene_aspects to null", () => {
    const malformed = {
      characters: [],
      scene_aspects: null,
      conflict: null,
    } as unknown as FateStatePayload;
    const result = mirror([fateMsg(malformed)]);
    expect(result.current.state.fateState).toBeNull();
  });

  it("keeps a valid projection after a malformed one is rejected", () => {
    const malformed = { conflict: null } as unknown as FateStatePayload;
    const result = mirror([
      fateMsg(malformed),
      fateMsg(payload("Sam Spadework", 2)),
    ]);
    expect(result.current.state.fateState?.characters).toHaveLength(1);
    expect(result.current.state.fateState?.characters[0].fate_points).toBe(2);
  });
});
