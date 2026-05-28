/**
 * Story 71-10 (RED) — Peer-action transcript anchors by EXACT round, not position.
 *
 * Story 71-4 persisted peer actions into the transcript but anchored them
 * positionally: the i-th captured round drops at the i-th NARRATION_END
 * boundary (`turnBoundaryIndex` in buildSegments). The 2026-05-27 coyote_star
 * MP playtest surfaced the drift — any skipped/empty/out-of-order/late round
 * shifts every later peer block onto the wrong turn.
 *
 * 71-10 carries the exact `round` on PLAYER_ACTION and anchors each captured
 * round's peers under the turn whose own action shares that round. These tests
 * pin that behavior against the locked 71-4 accumulator shape
 * (`buildSegments(messages, Map<number, ActionRevealEntry[]>)`).
 *
 * RED: the production buildSegments still anchors positionally, so the gap /
 * single-high-round / out-of-order / mismatched-seq cases mis-place the peer
 * block and these assertions fail.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { buildSegments, type NarrativeSegment } from "@/lib/narrativeSegments";
import { NarrationCards } from "@/components/NarrationCards";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { ActionRevealEntry } from "@/types/payloads";

type PeerSeg = NarrativeSegment & { is_peer?: boolean; character_name?: string };

type PeerAwareBuild = (
  messages: GameMessage[],
  peerActionsByRound?: Map<number, ActionRevealEntry[]>,
) => NarrativeSegment[];
const buildWithPeers = buildSegments as PeerAwareBuild;

const NarrationCardsWithPeers = NarrationCards as unknown as (props: {
  messages: GameMessage[];
  peerActionsByRound?: Map<number, ActionRevealEntry[]>;
}) => React.ReactElement;

// A full turn: own PLAYER_ACTION carrying its exact round, the narrator's reply,
// and the NARRATION_END boundary that closes the turn.
function turn(round: number, ownText: string): GameMessage[] {
  return [
    { type: MessageType.PLAYER_ACTION, payload: { action: ownText, round }, player_id: "p1" },
    { type: MessageType.NARRATION, payload: { text: `narration r${round}: ${ownText}` } },
    { type: MessageType.NARRATION_END, payload: {} },
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
  };
}

const idxOfText = (segs: NarrativeSegment[], needle: string): number =>
  segs.findIndex((s) => (s.text ?? "").includes(needle));

// ---------------------------------------------------------------------------
// AC-3 — anchor by exact round (the positional-drift failure cases)
// ---------------------------------------------------------------------------

describe("71-10 AC-3 — peers anchor by exact round, not position", () => {
  it("skips an empty middle round without shifting later peers (gap case)", () => {
    const messages = [
      ...turn(1, "OWN ONE"),
      ...turn(2, "OWN TWO"),
      ...turn(3, "OWN THREE"),
    ];
    // Round 2 has NO submitted peers; rounds 1 and 3 do.
    const peers = new Map<number, ActionRevealEntry[]>([
      [1, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "PEER ONE", round: 1 })]],
      [3, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "PEER THREE", round: 3 })]],
    ]);

    const segs = buildWithPeers(messages, peers);

    // Round-1 peer lands inside turn 1 (after OWN ONE, before OWN TWO).
    expect(idxOfText(segs, "PEER ONE")).toBeGreaterThan(idxOfText(segs, "OWN ONE"));
    expect(idxOfText(segs, "PEER ONE")).toBeLessThan(idxOfText(segs, "OWN TWO"));

    // Round-3 peer lands inside turn 3 (after OWN THREE) — NOT under turn 2,
    // which is what positional anchoring does when round 2 is empty.
    expect(idxOfText(segs, "PEER THREE")).toBeGreaterThan(idxOfText(segs, "OWN THREE"));

    // Nothing peer-shaped sits between OWN TWO and OWN THREE (round 2 is empty).
    const peerSegs = segs.filter((s) => s.kind === "player-action" && (s as PeerSeg).is_peer);
    expect(peerSegs).toHaveLength(2);
  });

  it("anchors a single high round to its own turn, not the first boundary", () => {
    const messages = [
      ...turn(1, "OWN ONE"),
      ...turn(2, "OWN TWO"),
      ...turn(3, "OWN THREE"),
    ];
    const peers = new Map<number, ActionRevealEntry[]>([
      [3, [submittedReveal({ player_id: "p2", character_name: "Cy", action: "PEER THREE", round: 3 })]],
    ]);

    const segs = buildWithPeers(messages, peers);

    // Positional anchoring would drop this at the FIRST NARRATION_END (turn 1).
    // Round anchoring puts it under turn 3.
    expect(idxOfText(segs, "PEER THREE")).toBeGreaterThan(idxOfText(segs, "OWN THREE"));
    expect(idxOfText(segs, "PEER THREE")).toBeGreaterThan(idxOfText(segs, "OWN TWO"));
  });

  it("anchors by round regardless of map INSERTION order (out-of-order arrival)", () => {
    const messages = [
      ...turn(1, "OWN ONE"),
      ...turn(2, "OWN TWO"),
      ...turn(3, "OWN THREE"),
    ];
    // Insert the higher round first — a later-arriving capture must not change
    // where each round anchors.
    const peers = new Map<number, ActionRevealEntry[]>();
    peers.set(3, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "PEER THREE", round: 3 })]);
    peers.set(1, [submittedReveal({ player_id: "p3", character_name: "Cy", action: "PEER ONE", round: 1 })]);

    const segs = buildWithPeers(messages, peers);

    expect(idxOfText(segs, "PEER ONE")).toBeGreaterThan(idxOfText(segs, "OWN ONE"));
    expect(idxOfText(segs, "PEER ONE")).toBeLessThan(idxOfText(segs, "OWN TWO"));
    expect(idxOfText(segs, "PEER THREE")).toBeGreaterThan(idxOfText(segs, "OWN THREE"));
  });

  it("keeps within-round seq order while anchoring to the matching turn", () => {
    const messages = [...turn(1, "OWN ONE"), ...turn(2, "OWN TWO")];
    // Only round 2 has peers, and they arrive out of seq order.
    const peers = new Map<number, ActionRevealEntry[]>([
      [2, [
        submittedReveal({ player_id: "p3", character_name: "Cy", action: "SECOND", round: 2, seq: 5 }),
        submittedReveal({ player_id: "p2", character_name: "Bob", action: "FIRST", round: 2, seq: 2 }),
      ]],
    ]);

    const segs = buildWithPeers(messages, peers);
    const peerTexts = segs
      .filter((s) => s.kind === "player-action" && (s as PeerSeg).is_peer)
      .map((s) => s.text ?? "");

    // Both peers under turn 2 (positional would drop them at turn 1's boundary).
    expect(idxOfText(segs, "FIRST")).toBeGreaterThan(idxOfText(segs, "OWN TWO"));
    // ...in seq order.
    expect(peerTexts).toEqual(["FIRST", "SECOND"]);
  });

  it("treats round 0 as a real, anchorable round (not a falsy 'missing')", () => {
    const messages = [...turn(0, "OPENING"), ...turn(1, "OWN ONE")];
    const peers = new Map<number, ActionRevealEntry[]>([
      [0, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "PEER ZERO", round: 0 })]],
    ]);

    const segs = buildWithPeers(messages, peers);

    expect(idxOfText(segs, "PEER ZERO")).toBeGreaterThan(idxOfText(segs, "OPENING"));
    expect(idxOfText(segs, "PEER ZERO")).toBeLessThan(idxOfText(segs, "OWN ONE"));
  });
});

// ---------------------------------------------------------------------------
// Regression guards — single-player and the no-NARRATION_END (just-resolved /
// e2e harness) paths must keep working under round anchoring.
// ---------------------------------------------------------------------------

describe("71-10 — no regression for the empty-map and trailing-append paths", () => {
  it("empty map is byte-identical to no 2nd arg (single-player)", () => {
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "I light the torch", round: 1 }, player_id: "p1" },
      { type: MessageType.NARRATION, payload: { text: "Shadows retreat." } },
    ] as unknown as GameMessage[];

    const base = buildSegments(messages);
    const withEmpty = buildWithPeers(messages, new Map());
    expect(withEmpty).toEqual(base);
    expect(withEmpty.filter((s) => (s as PeerSeg).is_peer === true)).toHaveLength(0);
  });

  it("a captured round whose NARRATION_END has not arrived yet still renders (trailing append)", () => {
    // The just-resolved turn: own action present, but its NARRATION_END is not
    // in `messages` yet. The peer must still surface (after the own action),
    // not vanish — preserving the e2e wiring harness behavior.
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "OWN TWO", round: 2 }, player_id: "p1" },
    ] as unknown as GameMessage[];
    const peers = new Map<number, ActionRevealEntry[]>([
      [2, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "PEER TWO", round: 2 })]],
    ]);

    const segs = buildWithPeers(messages, peers);
    expect(idxOfText(segs, "PEER TWO")).toBeGreaterThan(idxOfText(segs, "OWN TWO"));
  });
});

// ---------------------------------------------------------------------------
// AC-4 wiring — prop → buildSegments → rendered turn cards (real component).
// NarrationCards groups segments into per-turn cards; a round-anchored peer
// must land in its OWN round's card, proving the anchoring survives the real
// render path, not just the buildSegments unit.
// ---------------------------------------------------------------------------

describe("71-10 AC-4 — round anchoring through the real NarrationCards path", () => {
  it("renders a gap-round peer inside its own turn card, not the previous one", () => {
    const messages = [
      ...turn(1, "OWN ONE"),
      ...turn(2, "OWN TWO"),
      ...turn(3, "OWN THREE"),
    ];
    const peers = new Map<number, ActionRevealEntry[]>([
      [3, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "PEER THREE", round: 3 })]],
    ]);

    render(<NarrationCardsWithPeers messages={messages} peerActionsByRound={peers} />);

    const cards = screen.getAllByTestId("narration-card");
    const ownTwoCard = cards.find((c) => within(c).queryByText(/OWN TWO/));
    const ownThreeCard = cards.find((c) => within(c).queryByText(/OWN THREE/));
    expect(ownTwoCard).toBeDefined();
    expect(ownThreeCard).toBeDefined();

    // The round-3 peer belongs in turn 3's card...
    expect(within(ownThreeCard!).getByText(/PEER THREE/)).toBeInTheDocument();
    // ...and must NOT have leaked into turn 2's card (the positional bug).
    expect(within(ownTwoCard!).queryByText(/PEER THREE/)).not.toBeInTheDocument();
  });
});
