/**
 * Story 77-5 / ADR-137: protocol + payload parity for the quest spine (RED).
 *
 * The server (Story 77-8) emits a QUESTS snapshot carrying a rich QuestsPayload
 * (quest_log + quest_anchors + active_stakes), the RELATIONSHIPS analog. The
 * client must (a) define MessageType.QUESTS so the mirror can route it, and
 * (b) mirror the rich payload shape EXACTLY — not thin it into the legacy
 * `Record<string,string>` quests field.
 *
 * Server source of truth: sidequest-server/sidequest/protocol/models.py
 *   QuestLogEntry(quest_id, title, objective, status, anchor_id)
 *   QuestAnchorEntry(anchor_id, quest_id, resolution)
 *   QuestsPayload(quest_log, quest_anchors, active_stakes)
 */
import { describe, it, expect } from "vitest";
import { MessageType } from "../protocol";
import type {
  QuestsPayload,
  QuestLogEntry,
  QuestAnchorEntry,
} from "../payloads";

describe("Quests protocol completeness (Story 77-5)", () => {
  it("MessageType enum includes QUESTS", () => {
    expect(MessageType.QUESTS).toBe("QUESTS");
  });
});

describe("QuestsPayload mirrors the server shape exactly (no fabrication)", () => {
  it("carries the rich nested quest_log / quest_anchors / active_stakes fields", () => {
    // Constructing this literal is the guard: if the dev thinned the shape into
    // Record<string,string>, this typed fixture would not compile. At runtime
    // it asserts every rich field is present and addressable.
    const log: QuestLogEntry = {
      quest_id: "q_home",
      title: "Find a way home",
      objective: "Reach the Emerald City",
      status: "active",
      anchor_id: "emerald_city",
    };
    const anchor: QuestAnchorEntry = {
      anchor_id: "emerald_city",
      quest_id: "q_home",
      resolution: "Arrive at the throne room",
    };
    const payload: QuestsPayload = {
      quest_log: [log],
      quest_anchors: [anchor],
      active_stakes: "The cyclone could return",
    };

    expect(payload.quest_log[0].quest_id).toBe("q_home");
    expect(payload.quest_log[0].anchor_id).toBe("emerald_city");
    expect(payload.quest_anchors[0].resolution).toBe(
      "Arrive at the throne room",
    );
    expect(payload.active_stakes).toBe("The cyclone could return");
  });

  it("permits nullable anchor linkage (anchor with no owning quest)", () => {
    const orphan: QuestAnchorEntry = {
      anchor_id: "lone_anchor",
      quest_id: null,
      resolution: null,
    };
    expect(orphan.quest_id).toBeNull();
    expect(orphan.resolution).toBeNull();
  });
});
