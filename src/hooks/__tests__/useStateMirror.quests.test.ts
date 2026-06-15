/**
 * Story 77-5 / ADR-137: state-mirror tests for the player-facing quest spine.
 *
 * QUESTS is a snapshot message (the RELATIONSHIPS analog): every message is a
 * FULL replace of the projected quest spine (no incremental accumulation),
 * matching the LOCATION_DESCRIPTION / RELATIONSHIPS snapshot contract.
 *
 * The rich projection threads onto state as `questsData` — a SEPARATE field
 * from the legacy `quests: Record<string,string>` (which was never populated
 * and stays only for old-save compatibility). Do not conflate the two: the
 * rich QuestsPayload is the source of truth.
 *
 * Mirrors the harness in useStateMirror.relationships.test.ts — drives the REAL
 * hook via renderHook over a GameStateProvider wrapper.
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
import type { QuestsPayload } from "../../types/payloads";

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

function questsMsg(payload: QuestsPayload): GameMessage {
  return {
    type: MessageType.QUESTS,
    payload: payload as unknown as Record<string, unknown>,
    player_id: "",
  };
}

function payload(title: string, stakes: string): QuestsPayload {
  return {
    quest_log: [
      {
        quest_id: title.toLowerCase().replace(/\s+/g, "_"),
        title,
        objective: `Pursue: ${title}`,
        status: "active",
        anchor_id: "anchor_a",
        related_lore: [],
      },
    ],
    quest_anchors: [
      { anchor_id: "anchor_a", quest_id: null, resolution: null },
    ],
    active_stakes: stakes,
  };
}

describe("useStateMirror — QUESTS (Story 77-5 / ADR-137)", () => {
  it("starts with the quests projection null", () => {
    const result = mirror([]);
    // Assert directly (no `?? null` coercion) so a misspelled field or a
    // missing EMPTY_GAME_STATE default — undefined, not null — is caught.
    expect(result.current.state.questsData).toBeNull();
  });

  it("populates questsData from a QUESTS message", () => {
    const result = mirror([questsMsg(payload("Find a way home", "high"))]);
    expect(result.current.state.questsData?.quest_log).toHaveLength(1);
    expect(result.current.state.questsData?.quest_log[0].title).toBe(
      "Find a way home",
    );
    expect(result.current.state.questsData?.active_stakes).toBe("high");
  });

  it("a later QUESTS message fully replaces the prior projection (snapshot)", () => {
    const result = mirror([
      questsMsg(payload("Find a way home", "low")),
      questsMsg(payload("Foment a Munchkin revolution", "dire")),
    ]);
    expect(result.current.state.questsData?.quest_log).toHaveLength(1);
    expect(result.current.state.questsData?.quest_log[0].title).toBe(
      "Foment a Munchkin revolution",
    );
    expect(result.current.state.questsData?.active_stakes).toBe("dire");
  });

  it("does not write the rich projection into the legacy quests Record", () => {
    const result = mirror([questsMsg(payload("Find a way home", "high"))]);
    // The legacy Record<string,string> stays untouched — the rich payload
    // travels on questsData, never back-filled into the thin field.
    expect(result.current.state.quests).toEqual({});
  });

  // Review round-trip 1 (Reviewer REJECT, 2026-06-04). No-Silent-Fallbacks:
  // validate the QUESTS payload at the mirror boundary so a malformed wire
  // payload (version skew, serialization bug) degrades to null — and the panel
  // renders its empty state — rather than storing garbage that throws in the
  // render path (AC2: "does not white-screen or throw on missing/undefined
  // fields"). Boundary validation is the project idiom (cf. the fact_id guard
  // in useStateMirror.ts).
  it("degrades a malformed QUESTS payload (missing arrays) to null", () => {
    const malformed = { active_stakes: "oops" } as unknown as QuestsPayload;
    const result = mirror([questsMsg(malformed)]);
    expect(result.current.state.questsData).toBeNull();
  });

  it("degrades a QUESTS payload with a non-string active_stakes to null", () => {
    const malformed = {
      quest_log: [],
      quest_anchors: [],
      active_stakes: null,
    } as unknown as QuestsPayload;
    const result = mirror([questsMsg(malformed)]);
    expect(result.current.state.questsData).toBeNull();
  });

  it("keeps a valid projection after a malformed one is rejected", () => {
    const malformed = { active_stakes: "oops" } as unknown as QuestsPayload;
    const result = mirror([
      questsMsg(malformed),
      questsMsg(payload("Find a way home", "high")),
    ]);
    expect(result.current.state.questsData?.quest_log).toHaveLength(1);
    expect(result.current.state.questsData?.active_stakes).toBe("high");
  });
});
