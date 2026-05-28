/**
 * Story 71-4 — Player-action transcript: own-echo contrast bump + peer-action
 * persistence (ADR-036 collaborative visibility, ADR-104/105 perception firewall).
 *
 * Pinned to the Architect CORRECTED-FINAL contract:
 *   - NarrativeSegment gains `is_peer?: boolean` (snake; peer=true, own omits)
 *     and `character_name?: string` (peer attribution = ActionRevealEntry.character_name).
 *   - buildSegments(messages, peerActionsByRound?: Map<number, ActionRevealEntry[]>)
 *     — positional 2nd param. Own player-action segs come from PLAYER_ACTION
 *     messages (is_peer omitted). Peer segs come ONLY from peerActionsByRound
 *     (is_peer:true, text=entry.action, character_name=entry.character_name).
 *   - Empty/absent peerActionsByRound → byte-identical to today's output.
 *   - Own renders class `text-foreground` + `data-peer="false"`; peer renders
 *     `text-muted-foreground` + `data-peer="true"`. The `/70` opacity is DELETED.
 *   - Placement: sort keys asc; i-th own player-action gets i-th round's peer
 *     group appended AFTER it. Peer is NOT a turn-page/card starter.
 *
 * own-vs-peer is by SOURCE, not player-id — selfPlayerId is intentionally absent.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderSegment } from "@/components/narrativeRenderers";
import { buildSegments, buildTurnPages, type NarrativeSegment } from "@/lib/narrativeSegments";
import { NarrationCards } from "@/components/NarrationCards";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { ActionRevealEntry } from "@/types/payloads";

// is_peer / character_name don't exist on NarrativeSegment yet (the red phase).
// Cast through this shape to assert against the locked contract before Dev adds them.
type PeerSeg = NarrativeSegment & { is_peer?: boolean; character_name?: string };

// buildSegments gains a positional 2nd param in GREEN. Cast so the test compiles
// against the locked signature now (the real optional-2nd-param signature stays
// assignable to this type post-impl).
type PeerAwareBuild = (
  messages: GameMessage[],
  peerActionsByRound?: Map<number, ActionRevealEntry[]>,
) => NarrativeSegment[];
const buildWithPeers = buildSegments as PeerAwareBuild;

function submittedReveal(
  overrides: Partial<ActionRevealEntry> & Pick<ActionRevealEntry, "player_id" | "action" | "round">,
): ActionRevealEntry {
  return {
    character_name: overrides.character_name ?? overrides.player_id,
    status: "submitted",
    aside: false,
    seq: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC1 — own-action contrast bump (renderSegment branches on seg.is_peer,
// exposes data-peer; own = text-foreground, peer = text-muted-foreground)
// ---------------------------------------------------------------------------

describe("71-4 AC1 — own-action contrast bump", () => {
  function renderPlayerAction(seg: PeerSeg): HTMLElement {
    render(<>{renderSegment(seg, 0)}</>);
    return screen.getByTestId("player-action");
  }

  it("renders an OWN player-action (is_peer omitted) with data-peer=false and the high-contrast token", () => {
    const el = renderPlayerAction({ kind: "player-action", text: "I kick the door open" });
    expect(el.getAttribute("data-peer")).toBe("false");
    expect(el.className).toMatch(/text-foreground/);
    // The low-contrast muted token (and its /70 opacity drag — the AC1 bug) are gone.
    expect(el.className).not.toMatch(/text-muted-foreground/);
    expect(el.className).not.toMatch(/\/70/);
  });

  it("renders a PEER player-action (is_peer:true) with data-peer=true and the muted token", () => {
    const el = renderPlayerAction({ kind: "player-action", text: "I draw my blaster", is_peer: true });
    expect(el.getAttribute("data-peer")).toBe("true");
    expect(el.className).toMatch(/text-muted-foreground/);
  });

  it("renders own and peer player-actions with distinct markers and contrast (own > peer)", () => {
    render(
      <>
        {renderSegment({ kind: "player-action", text: "OWN" } as PeerSeg, 0)}
        {renderSegment({ kind: "player-action", text: "PEER", is_peer: true } as PeerSeg, 1)}
      </>,
    );
    const nodes = screen.getAllByTestId("player-action");
    const own = nodes.find((n) => n.textContent?.includes("OWN"));
    const peer = nodes.find((n) => n.textContent?.includes("PEER"));
    expect(own).toBeDefined();
    expect(peer).toBeDefined();
    // Distinct marker...
    expect(own!.getAttribute("data-peer")).toBe("false");
    expect(peer!.getAttribute("data-peer")).toBe("true");
    // ...and distinct contrast, own the stronger token.
    expect(own!.className).not.toEqual(peer!.className);
    expect(own!.className).toMatch(/text-foreground/);
    expect(peer!.className).toMatch(/text-muted-foreground/);
  });
});

// ---------------------------------------------------------------------------
// AC2 — peer-action persistence via the buildSegments accumulator
// ---------------------------------------------------------------------------

describe("71-4 AC2 — peer-action persistence (buildSegments accumulator)", () => {
  it("persists a submitted peer reveal as an is_peer player-action with character_name, after the own action", () => {
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "I open the door" }, player_id: "p1" },
      { type: MessageType.NARRATION, payload: { text: "The door creaks open." } },
      { type: MessageType.NARRATION_END, payload: {} },
    ] as unknown as GameMessage[];
    const peerActionsByRound = new Map<number, ActionRevealEntry[]>([
      [1, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "I cover the hallway", round: 1, seq: 2 })]],
    ]);

    const segments = buildWithPeers(messages, peerActionsByRound) as PeerSeg[];
    const peerSegs = segments.filter((s) => s.kind === "player-action" && s.is_peer === true);

    expect(peerSegs).toHaveLength(1);
    expect(peerSegs[0].text).toContain("I cover the hallway");
    expect(peerSegs[0].character_name).toBe("Bob");

    // Placement: peer group appears AFTER the own action of its round.
    const ownIdx = segments.findIndex((s) => s.kind === "player-action" && !s.is_peer);
    const peerIdx = segments.indexOf(peerSegs[0]);
    expect(ownIdx).toBeGreaterThanOrEqual(0);
    expect(peerIdx).toBeGreaterThan(ownIdx);
  });

  it("orders multiple submitted peers within a round by seq", () => {
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "I take point" }, player_id: "p1" },
      { type: MessageType.NARRATION_END, payload: {} },
    ] as unknown as GameMessage[];
    const peerActionsByRound = new Map<number, ActionRevealEntry[]>([
      [1, [
        submittedReveal({ player_id: "p3", character_name: "Cy", action: "second", round: 1, seq: 5 }),
        submittedReveal({ player_id: "p2", character_name: "Bob", action: "first", round: 1, seq: 2 }),
      ]],
    ]);

    const segments = buildWithPeers(messages, peerActionsByRound) as PeerSeg[];
    const peerTexts = segments
      .filter((s) => s.kind === "player-action" && s.is_peer === true)
      .map((s) => s.text);
    expect(peerTexts).toHaveLength(2);
    expect(peerTexts[0]).toContain("first");
    expect(peerTexts[1]).toContain("second");
  });

  it("does NOT persist a peer action absent from peerActionsByRound, even if its text rides a broader frame (firewall)", () => {
    const HIDDEN = "I slice the captain's comms";
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "I hold position" }, player_id: "p1" },
      {
        type: MessageType.TURN_STATUS,
        payload: { player_id: "p3", character_name: "Cy", status: "resolved", action: HIDDEN },
        player_id: "p3",
      },
      { type: MessageType.NARRATION_END, payload: {} },
    ] as unknown as GameMessage[];
    const peerActionsByRound = new Map<number, ActionRevealEntry[]>(); // nothing was visibly revealed

    const segments = buildWithPeers(messages, peerActionsByRound) as PeerSeg[];

    expect(segments.some((s) => (s.text ?? "").includes(HIDDEN))).toBe(false);
    expect(segments.filter((s) => s.kind === "player-action" && s.is_peer === true)).toHaveLength(0);
  });

  it("produces byte-identical output for an empty map vs no 2nd arg (single-player regression)", () => {
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "I light the torch" }, player_id: "p1" },
      { type: MessageType.NARRATION, payload: { text: "Shadows retreat." } },
    ] as unknown as GameMessage[];

    const base = buildSegments(messages);
    const withEmpty = buildWithPeers(messages, new Map());
    expect(withEmpty).toEqual(base);
    expect(withEmpty.filter((s) => (s as PeerSeg).is_peer === true)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC2 — turn grouping: peer action is not a starter (both gates)
// ---------------------------------------------------------------------------

describe("71-4 AC2 — peer action does not start a new turn page/card", () => {
  it("buildTurnPages keeps a peer (is_peer) player-action in the same page as the own action", () => {
    const ownSeg: PeerSeg = { kind: "player-action", text: "I open the door" };
    const narration: NarrativeSegment = { kind: "text", html: "<p>The door opens.</p>" };
    const peerSeg: PeerSeg = { kind: "player-action", text: "I cover the hall", is_peer: true, character_name: "Bob" };

    const pages = buildTurnPages([ownSeg, narration, peerSeg]);

    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain(peerSeg);
  });
});

// ---------------------------------------------------------------------------
// AC2 firewall — behavioral guard at the real component boundary
// ---------------------------------------------------------------------------

describe("71-4 AC2 — perception firewall at the component boundary", () => {
  it("NarrationCards never surfaces peer action text carried by a TURN_STATUS frame", () => {
    const HIDDEN = "I plant the charge in the reactor core";
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "I open the bridge door" }, player_id: "p1" },
      {
        type: MessageType.TURN_STATUS,
        payload: { player_id: "p2", character_name: "Bob", status: "resolved", action: HIDDEN },
        player_id: "p2",
      },
    ] as unknown as GameMessage[];

    render(<NarrationCards messages={messages} />);

    expect(screen.getByText("I open the bridge door")).toBeInTheDocument();
    expect(screen.queryByText(HIDDEN)).not.toBeInTheDocument();
    expect(screen.queryByText(/charge in the reactor/)).not.toBeInTheDocument();
  });
});
