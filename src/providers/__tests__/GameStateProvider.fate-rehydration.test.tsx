/**
 * Story 125-6 (AC2) — fateState is excluded from sessionStorage rehydration (RED).
 *
 * [LOW][SEC] CONFIRMED in the 118-2 Reviewer pass, never filed until the
 * 2026-06-16 Fate deferred-cleanup triage. GameStateProvider persists the WHOLE
 * ClientGameState (including `fateState`) to sessionStorage for HMR survival and
 * rehydrates it in the useState initializer (loadGameStateFromStorage). That
 * rehydration's ONLY guard is `typeof parsed.location === 'string'` — it does NOT
 * re-run the FATE_STATE boundary guard that lives in useStateMirror
 * (Array.isArray(p.characters) && Array.isArray(p.scene_aspects)). So a once-
 * malformed fateState that reached state and got persisted SURVIVES a refresh,
 * bypassing the boundary guard and reaching the Fate surfaces as wire garbage.
 *
 * This is the `JSON.parse(...) as T` without runtime validation antipattern (TS
 * lang-review #10). The fix excludes `fateState` from the rehydration path so a
 * malformed value cannot re-enter on reload — it re-enters ONLY via a fresh
 * FATE_STATE message through the useStateMirror guard.
 *
 * Harness mirrors useStateMirror.fate.test.ts / GameStateProvider.test.tsx —
 * drives the REAL provider + hook via renderHook over a GameStateProvider wrapper
 * (the production state path; this doubles as the wiring test).
 */
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement, type ReactNode } from "react";
import {
  GameStateProvider,
  useGameState,
  type ClientGameState,
} from "../GameStateProvider";
import { useStateMirror } from "../../hooks/useStateMirror";
import { MessageType, type GameMessage } from "../../types/protocol";
import type { FateStatePayload } from "@/types/payloads";

// Mirrors the module-private GAME_STATE_STORAGE_KEY in GameStateProvider.tsx.
// Seeding the raw key simulates a value written by a PRIOR session — the exact
// "a once-malformed payload survives a refresh" scenario AC2 closes. (test-setup
// clears sessionStorage before every test, so each seed starts clean.)
const GAME_STATE_STORAGE_KEY = "sq_game_state";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(GameStateProvider, null, children);
}

// A malformed Fate payload: `characters` is a string, not an array — EXACTLY what
// the FATE_STATE boundary guard in useStateMirror rejects. Cast through `unknown`
// because the fixture deliberately violates FateStatePayload (it is wire garbage),
// the established idiom in useStateMirror.fate.test.ts.
const MALFORMED_FATE = {
  characters: "boom",
  scene_aspects: null,
  conflict: null,
} as unknown as FateStatePayload;

const VALID_FATE: FateStatePayload = {
  characters: [
    {
      name: "Dorothy",
      fate_points: 3,
      refresh: 3,
      skills: [],
      aspects: [],
      stress: {},
      consequences: [],
    },
  ],
  scene_aspects: [],
  conflict: null,
};

/** Seed sessionStorage with a JSON ClientGameState. `location` is a string so the
 *  rehydration's own guard (typeof parsed.location === 'string') passes — the
 *  malformed fateState rides in on a payload that otherwise looks valid. */
function seedSessionStorage(partial: Partial<ClientGameState>): void {
  const seeded = {
    location: "The Yellow Brick Road",
    quests: {},
    characters: [],
    knowledge: [],
    ...partial,
  };
  sessionStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(seeded));
}

function fateMsg(payload: FateStatePayload): GameMessage {
  return {
    type: MessageType.FATE_STATE,
    payload: payload as unknown as Record<string, unknown>,
    player_id: "",
  };
}

describe("GameStateProvider — fateState sessionStorage exclusion (Story 125-6 AC2)", () => {
  it("does NOT rehydrate a malformed fateState from sessionStorage on mount", () => {
    seedSessionStorage({ fateState: MALFORMED_FATE });
    const { result } = renderHook(() => useGameState(), { wrapper });
    // RED: current code rehydrates the malformed object (bypassing the FATE_STATE
    // boundary guard). GREEN: fateState is excluded from rehydration → null.
    expect(result.current.state.fateState).toBeNull();
  });

  it("rehydrates non-fate state (location, characters) while excluding fateState (surgical)", () => {
    seedSessionStorage({
      location: "Emerald City",
      characters: [
        {
          name: "Dorothy",
          hp: 5,
          max_hp: 5,
          statuses: [],
          inventory: ["Ruby Slippers"],
        },
      ],
      fateState: MALFORMED_FATE,
    });
    const { result } = renderHook(() => useGameState(), { wrapper });
    // The HMR-survival rehydration still works for the rest of the state...
    expect(result.current.state.location).toBe("Emerald City");
    expect(result.current.state.characters[0]?.name).toBe("Dorothy");
    // ...but fateState specifically is dropped (RED: it rehydrates as garbage).
    expect(result.current.state.fateState).toBeNull();
  });

  it("re-enters fateState only via a fresh FATE_STATE message through the boundary guard", () => {
    // A malformed value is sitting in sessionStorage from a prior session...
    seedSessionStorage({ fateState: MALFORMED_FATE });
    const { result } = renderHook(
      () => {
        useStateMirror([fateMsg(VALID_FATE)]);
        return useGameState();
      },
      { wrapper },
    );
    // ...and a valid FATE_STATE message (which passes the guard) repopulates it.
    // The legitimate path is unaffected by the exclusion — fateState recovers.
    expect(result.current.state.fateState).not.toBeNull();
    expect(result.current.state.fateState?.characters[0]?.name).toBe("Dorothy");
  });
});
