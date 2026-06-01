/**
 * ADR-136: state-mirror tests for the player-facing NPC relationship roster.
 *
 * RELATIONSHIPS is a snapshot message: every message is a FULL replace of
 * state.relationships (no incremental accumulation), matching the
 * LOCATION_DESCRIPTION snapshot contract.
 *
 * The mirror is a hook (`useStateMirror`) that replays the message list into
 * the GameStateProvider context on every render — there is no exported pure
 * `applyMessage`/`initialClientState`. So this test drives the REAL hook via
 * renderHook over a GameStateProvider wrapper, mirroring the harness in
 * useStateMirror-location.test.tsx.
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
import type {
  RelationshipEntryPayload,
  RelationshipsPayload,
} from "../../types/payloads";

// JSX-free wrapper so this stays a .ts file (per the Task 13 plan filename)
// while still mounting the real GameStateProvider.
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

function relMsg(payload: RelationshipsPayload): GameMessage {
  return {
    type: MessageType.RELATIONSHIPS,
    payload: payload as unknown as Record<string, unknown>,
    player_id: "",
  };
}

function entry(name: string): RelationshipEntryPayload {
  return {
    name,
    portrait_url: null,
    band: "Warm",
    disposition: 24,
    trend: "up",
    last_seen_turn: 6,
    last_seen_location: "parlor",
    beats: [],
    personality_read: null,
    ocean: null,
    claims: [],
  };
}

describe("useStateMirror — RELATIONSHIPS (ADR-136)", () => {
  it("starts with relationships null", () => {
    const result = mirror([]);
    expect(result.current.state.relationships ?? null).toBeNull();
  });

  it("replaces relationships from a RELATIONSHIPS message", () => {
    const result = mirror([relMsg({ entries: [entry("Tabitha")] })]);
    expect(result.current.state.relationships).toHaveLength(1);
    expect(result.current.state.relationships?.[0].name).toBe("Tabitha");
  });

  it("a later RELATIONSHIPS message fully replaces the prior roster", () => {
    const result = mirror([
      relMsg({ entries: [entry("Tabitha")] }),
      relMsg({ entries: [entry("Reuben"), entry("Maud")] }),
    ]);
    expect(result.current.state.relationships).toHaveLength(2);
    expect(result.current.state.relationships?.map((e) => e.name)).toEqual([
      "Reuben",
      "Maud",
    ]);
  });
});
