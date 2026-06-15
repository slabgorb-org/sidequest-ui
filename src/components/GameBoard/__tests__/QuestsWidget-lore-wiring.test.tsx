/**
 * Story 117-7: end-to-end wiring for quest-related lore.
 *
 * The mandatory wiring test — proves the related_lore the server projects
 * (117-5, server #876) survives the production data path and reaches the player,
 * not just that a component renders it in isolation. The path under test:
 *
 *   QUESTS wire message (with related_lore)
 *     → useStateMirror  (the REAL hook; full-replace snapshot threads the rich
 *                         payload onto questsData — must not drop related_lore)
 *     → QuestsWidget     (the production GameBoard consumer adapter)
 *     → QuestsPanel      (renders the "what I've learned" lore block)
 *
 * If any link in that chain thins the shape, this test fails. Mirrors the
 * harness in useStateMirror.quests.test.ts.
 */
import { describe, expect, it } from "vitest";
import { render, renderHook, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  GameStateProvider,
  useGameState,
} from "@/providers/GameStateProvider";
import { useStateMirror } from "@/hooks/useStateMirror";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { QuestsPayload } from "@/types/payloads";
import { QuestsWidget } from "@/components/GameBoard/widgets/QuestsWidget";

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

const wirePayload: QuestsPayload = {
  quest_log: [
    {
      quest_id: "q_detective",
      title: "Run the floor boss to ground",
      objective: "Find proof of the skim",
      status: "active",
      anchor_id: "back_office",
      related_lore: [
        {
          fact_id: "clue_ledger",
          content: "The floor boss keeps a second ledger in the back office.",
        },
      ],
    },
  ],
  quest_anchors: [
    { anchor_id: "back_office", quest_id: "q_detective", resolution: null },
  ],
  active_stakes: "The skim is escalating",
};

describe("QuestsWidget lore wiring (Story 117-7, mirror → widget → panel)", () => {
  it("the mirror preserves related_lore through its full-replace snapshot", () => {
    const result = mirror([questsMsg(wirePayload)]);
    const lore = result.current.state.questsData?.quest_log[0].related_lore;
    expect(lore).toHaveLength(1);
    expect(lore?.[0].fact_id).toBe("clue_ledger");
    expect(lore?.[0].content).toBe(
      "The floor boss keeps a second ledger in the back office.",
    );
  });

  it("renders the lore block from the production widget fed by mirrored state", () => {
    const result = mirror([questsMsg(wirePayload)]);
    const questsData = result.current.state.questsData;
    // The widget is GameBoard's real consumer; feeding it the mirrored snapshot
    // exercises the same data the dock renders at runtime.
    render(<QuestsWidget data={questsData} />);
    const lore = screen.getByTestId("quests-lore");
    expect(lore).toHaveTextContent(/what i've learned/i);
    expect(
      within(lore).getByText(
        /the floor boss keeps a second ledger in the back office\./i,
      ),
    ).toBeInTheDocument();
  });
});
