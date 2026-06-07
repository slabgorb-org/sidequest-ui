/**
 * Ping-pong 2026-06-07 — "[UX] STALE player-action quote pinned at the BOTTOM
 * of the narrative column" (perseus_cloud MP, ship_combat round 3).
 *
 * Operator screenshot: Chico's BERTH-NEGOTIATION action ("Free fix. We lift
 * tonight.", ~6 turns old) rendered BELOW the latest ship-combat narration.
 *
 * Two compounding gaps in the 71-10 round-anchor design:
 *  1. The only round anchor was the local player's own PLAYER_ACTION round —
 *     dice-driven turns (combat beat commits ride DICE_THROW, never
 *     PLAYER_ACTION) carry no anchor, so their captured peer rounds NEVER
 *     match a NARRATION_END and fall through to…
 *  2. …the trailing fallback, which appends EVERY unanchored round after all
 *     narration — i.e. pins stale quotes below the newest card.
 *
 * Fix under test:
 *  - NARRATION_END now carries `round` (server stamps the resolved round,
 *    pre-record_interaction bump) and buildSegments anchors by it — works for
 *    every turn shape including dice turns.
 *  - The trailing fallback only appends rounds NEWER than the last anchored
 *    round (the legit "just-resolved, NARRATION_END not yet in messages"
 *    case). Stale older orphans are dropped, never pinned at the bottom.
 */
import { describe, it, expect } from "vitest";
import { buildSegments, type NarrativeSegment } from "@/lib/narrativeSegments";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { ActionRevealEntry } from "@/types/payloads";

type PeerSeg = NarrativeSegment & { is_peer?: boolean; character_name?: string };

/** A dice-driven turn: NO own PLAYER_ACTION (beat commits ride DICE_THROW);
 * the only round carrier is NARRATION_END. */
function diceTurn(round: number, narration: string): GameMessage[] {
  return [
    { type: MessageType.NARRATION, payload: { text: narration } },
    { type: MessageType.NARRATION_END, payload: { round } },
  ] as unknown as GameMessage[];
}

/** A typed turn: own PLAYER_ACTION with round + NARRATION_END carrying it too. */
function typedTurn(round: number, ownText: string, narration: string): GameMessage[] {
  return [
    { type: MessageType.PLAYER_ACTION, payload: { action: ownText, round }, player_id: "p1" },
    { type: MessageType.NARRATION, payload: { text: narration } },
    { type: MessageType.NARRATION_END, payload: { round } },
  ] as unknown as GameMessage[];
}

function submittedReveal(
  overrides: Partial<ActionRevealEntry> &
    Pick<ActionRevealEntry, "player_id" | "action" | "round">,
): ActionRevealEntry {
  return {
    character_name: overrides.character_name ?? overrides.player_id,
    status: "submitted",
    aside: false,
    seq: 1,
    ...overrides,
  } as ActionRevealEntry;
}

// Narration segments carry `html`; player-action segments carry `text`.
const idxOfText = (segs: NarrativeSegment[], needle: string): number =>
  segs.findIndex((s) => `${s.text ?? ""}${s.html ?? ""}`.includes(needle));

const peerSegs = (segs: NarrativeSegment[]): PeerSeg[] =>
  segs.filter((s) => s.kind === "player-action" && (s as PeerSeg).is_peer) as PeerSeg[];

describe("stale peer quote — dice turns anchor by NARRATION_END round", () => {
  it("anchors a dice-turn's peer quote inside its own turn, not at the bottom", () => {
    const messages = [
      ...diceTurn(7, "Round seven resolves in laser fire."),
      ...diceTurn(8, "Round eight: the hull groans."),
    ];
    const peers = new Map<number, ActionRevealEntry[]>([
      [7, [submittedReveal({ player_id: "p2", character_name: "Chico", action: "PEER SEVEN", round: 7 })]],
    ]);

    const segs = buildSegments(messages, peers);

    // The round-7 quote belongs inside turn 7 — before round 8's narration.
    expect(idxOfText(segs, "PEER SEVEN")).toBeGreaterThan(
      idxOfText(segs, "Round seven resolves"),
    );
    expect(idxOfText(segs, "PEER SEVEN")).toBeLessThan(
      idxOfText(segs, "Round eight"),
    );
  });

  it("NARRATION_END round wins over a stale own-action round from a prior turn", () => {
    // Turn 3 was typed (own action carries round 3); turn 4 is dice-driven
    // (no own action). Pre-fix, currentRound stays 3 at turn 4's
    // NARRATION_END and round 4's peers never anchor.
    const messages = [
      ...typedTurn(3, "OWN THREE", "The deal sours."),
      ...diceTurn(4, "Blasters out — round four."),
      ...diceTurn(5, "Round five: evasive maneuvers."),
    ];
    const peers = new Map<number, ActionRevealEntry[]>([
      [4, [submittedReveal({ player_id: "p2", character_name: "Chico", action: "PEER FOUR", round: 4 })]],
    ]);

    const segs = buildSegments(messages, peers);

    expect(idxOfText(segs, "PEER FOUR")).toBeGreaterThan(
      idxOfText(segs, "round four"),
    );
    // Anchored INSIDE turn 4 — not trailed below round 5 (pre-fix: the own
    // round stuck at 3, round 4 never anchored, the quote pinned at the bottom).
    expect(idxOfText(segs, "PEER FOUR")).toBeLessThan(
      idxOfText(segs, "Round five"),
    );
    expect(peerSegs(segs)).toHaveLength(1);
  });
});

describe("stale peer quote — trailing fallback never pins old rounds at the bottom", () => {
  it("drops an unanchored round OLDER than the last anchored round (the screenshot bug)", () => {
    // The negotiation-era capture (round 2) never matched an anchor — e.g.
    // captured under a drifted round key. The transcript has moved on to
    // rounds 7-8. Pre-fix the trailing pass pinned "Free fix. We lift
    // tonight." below round 8's narration.
    const messages = [
      ...diceTurn(7, "Round seven resolves in laser fire."),
      ...diceTurn(8, "Round eight: the hull groans."),
    ];
    const peers = new Map<number, ActionRevealEntry[]>([
      [2, [submittedReveal({ player_id: "p2", character_name: "Chico", action: "Free fix. We lift tonight.", round: 2 })]],
    ]);

    const segs = buildSegments(messages, peers);

    expect(idxOfText(segs, "Free fix")).toBe(-1);
  });

  it("still trails the JUST-RESOLVED round whose NARRATION_END isn't in messages yet", () => {
    // Round 9 just resolved (captured at TURN_STATUS{resolved}) but its
    // NARRATION_END hasn't landed in `messages` — the legit trailing case
    // the 71-10 fallback exists for. Must still append.
    const messages = [...diceTurn(8, "Round eight: the hull groans.")];
    const peers = new Map<number, ActionRevealEntry[]>([
      [9, [submittedReveal({ player_id: "p2", character_name: "Chico", action: "PEER NINE", round: 9 })]],
    ]);

    const segs = buildSegments(messages, peers);

    expect(idxOfText(segs, "PEER NINE")).toBeGreaterThan(
      idxOfText(segs, "Round eight"),
    );
  });

  it("keeps the no-narration harness shape: with no anchored rounds, all rounds append", () => {
    // The e2e wiring harness builds transcripts with no narration frames at
    // all — the fallback must keep emitting everything (no anchor baseline).
    const peers = new Map<number, ActionRevealEntry[]>([
      [1, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "PEER ONE", round: 1 })]],
      [2, [submittedReveal({ player_id: "p3", character_name: "Cy", action: "PEER TWO", round: 2 })]],
    ]);

    const segs = buildSegments([] as unknown as GameMessage[], peers);

    expect(idxOfText(segs, "PEER ONE")).toBeGreaterThanOrEqual(0);
    expect(idxOfText(segs, "PEER TWO")).toBeGreaterThan(idxOfText(segs, "PEER ONE"));
  });
});
