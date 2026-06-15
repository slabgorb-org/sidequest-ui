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
  QuestLoreEntry,
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
      related_lore: [],
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

/**
 * Story 117-7: the QuestLogEntry must carry the related_lore the server has
 * projected since 117-5 (server #876). Server source of truth:
 * sidequest-server/sidequest/protocol/models.py
 *   QuestLoreEntry(fact_id: str, content: str)            # model_config extra=forbid
 *   QuestLogEntry(..., related_lore: list[QuestLoreEntry] = [])  # never None
 *
 * Constructing the typed literals below is the compile-time guard: if the dev
 * omits the related_lore field or the QuestLoreEntry type, this file does not
 * compile. At runtime it asserts the nested {fact_id, content} shape is present
 * and addressable — a thin Record<string,string> could not carry it.
 */
describe("QuestLogEntry carries related_lore (Story 117-7, mirrors 117-5 server)", () => {
  it("types a quest's related_lore as a list of {fact_id, content} fragments", () => {
    const lore: QuestLoreEntry = {
      fact_id: "clue_ledger_001",
      content: "The floor boss keeps a second ledger in the back office.",
    };
    const entry: QuestLogEntry = {
      quest_id: "q_detective",
      title: "Run the floor boss to ground",
      objective: "Find proof of the skim",
      status: "active",
      anchor_id: "back_office",
      related_lore: [lore],
    };

    expect(entry.related_lore).toHaveLength(1);
    expect(entry.related_lore[0].fact_id).toBe("clue_ledger_001");
    expect(entry.related_lore[0].content).toBe(
      "The floor boss keeps a second ledger in the back office.",
    );
  });

  it("permits an empty related_lore list (nothing learned yet — never None)", () => {
    const entry: QuestLogEntry = {
      quest_id: "q_fresh",
      title: "A brand-new lead",
      objective: "Ask around",
      status: "active",
      anchor_id: null,
      related_lore: [],
    };
    expect(entry.related_lore).toEqual([]);
  });

  it("threads related_lore through a full QuestsPayload", () => {
    const payload: QuestsPayload = {
      quest_log: [
        {
          quest_id: "q_detective",
          title: "Run the floor boss to ground",
          objective: "Find proof of the skim",
          status: "active",
          anchor_id: "back_office",
          related_lore: [
            { fact_id: "f1", content: "A guard takes a cut on Thursdays." },
          ],
        },
      ],
      quest_anchors: [
        { anchor_id: "back_office", quest_id: "q_detective", resolution: null },
      ],
      active_stakes: "The skim is escalating",
    };
    expect(payload.quest_log[0].related_lore[0].content).toBe(
      "A guard takes a cut on Thursdays.",
    );
  });
});
