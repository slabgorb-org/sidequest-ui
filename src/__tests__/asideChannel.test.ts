// ADR-107 — ASIDE_ANSWER UI routing + gm-aside segment (RED, story 50-25).
//
// Plan: docs/superpowers/plans/2026-05-17-aside-channel.md Tasks 6 & 7.
//
// Adapted from the plan's test stub: the real exported segment builder is
// `buildSegments(messages: GameMessage[])` (not the plan's placeholder
// `messageToSegments(single)`) — the plan explicitly instructed to grep
// narrativeSegments.ts and bind to the real name. Casts keep the file
// runnable under vitest AND tolerant of `tsc --noEmit` while the
// MessageType const member and the "gm-aside" segment kind do not yet
// exist; both assertions still fail RED on real behaviour.
//
// Fails until: Dev adds MessageType.ASIDE_ANSWER (Task 6), routes it into
// the narrative stream in App.tsx (Task 6), and emits a "gm-aside"
// segment in narrativeSegments.ts (Task 7).

import { describe, it, expect } from "vitest";
import { MessageType, type GameMessage } from "../types/protocol";
import { buildSegments } from "../lib/narrativeSegments";

describe("ASIDE_ANSWER", () => {
  it("is a known message type", () => {
    expect((MessageType as Record<string, string>).ASIDE_ANSWER).toBe(
      "ASIDE_ANSWER",
    );
  });

  it("renders as a gm-aside segment, not narration text", () => {
    const msg = {
      type: "ASIDE_ANSWER",
      payload: {
        asker_id: "Hiken",
        question: "can I wade?",
        answer: "Knee-deep — wade, no carry.",
        grounded_on: ["character.size"],
        round: 7,
      },
      player_id: "Hiken",
    } as unknown as GameMessage;

    const segs = buildSegments([msg]);

    expect(segs.some((s) => (s.kind as string) === "gm-aside")).toBe(true);
    expect(segs.every((s) => s.kind !== "text")).toBe(true);
  });
});
