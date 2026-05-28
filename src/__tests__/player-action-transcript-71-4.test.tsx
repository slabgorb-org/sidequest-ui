/**
 * Story 71-4 — Player-action transcript: own-echo contrast bump + peer-action
 * persistence (ADR-036 collaborative visibility, ADR-104/105 perception firewall).
 *
 * Pinned to the Architect-locked interface (ruling A1):
 *   - buildSegments(messages, peerActions) gains a 2nd param:
 *       peerActions: Map<round, ActionRevealEntry[]>  (per-round accumulator).
 *   - Peer actions reuse the EXISTING "player-action" segment kind with an
 *     `is_peer: true` discriminator. Own action = is_peer false/absent
 *     (AC1 high contrast); peer = is_peer true (AC3 lower contrast).
 *     One render path, flag-differentiated.
 *   - Placement: round-N peer segments drop at round N's turn boundary
 *     (after the narration), anchored on the boundary — not interleaved.
 *   - Focus-mode: a peer (is_peer) player-action must NOT start a new turn page.
 *
 * The full ACTION_REVEAL → TURN_STATUS{resolved} → persisted-segment flow
 * through the real component lives in the end-to-end wiring test.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderSegment } from "@/components/narrativeRenderers";
import { buildSegments, buildTurnPages, type NarrativeSegment } from "@/lib/narrativeSegments";
import { NarrationCards } from "@/components/NarrationCards";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { ActionRevealEntry } from "@/types/payloads";

// The `is_peer` discriminator does not exist on NarrativeSegment yet (that is
// the point of the red phase). Cast through this shape to assert against the
// locked contract before Dev adds the field.
type PeerSeg = NarrativeSegment & { is_peer?: boolean };

// buildSegments gains a 2nd param in GREEN. Cast so the test compiles against
// the locked signature now; the real (optional-2nd-param) signature stays
// assignable to this type post-impl.
type PeerAwareBuild = (
  messages: GameMessage[],
  peerActions?: Map<number, ActionRevealEntry[]>,
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
// AC1 — own-action contrast bump (renderSegment branches on seg.is_peer)
// ---------------------------------------------------------------------------

describe("71-4 AC1 — own-action contrast bump", () => {
  function classFor(seg: PeerSeg): string {
    render(<>{renderSegment(seg, 0)}</>);
    return screen.getByTestId("player-action").className;
  }

  it("renders an OWN player-action (is_peer absent) at higher contrast than the muted default", () => {
    const cls = classFor({ kind: "player-action", text: "I kick the door open" });
    // The current treatment is text-muted-foreground/70 for every action. An
    // own action must escape that low-contrast token...
    expect(cls).not.toMatch(/text-muted-foreground/);
    // ...and use the high-contrast foreground token (WCAG AA 4.5:1 body text).
    expect(cls).toMatch(/text-foreground/);
  });

  it("keeps a PEER player-action (is_peer:true) at the lower-contrast muted treatment", () => {
    const cls = classFor({ kind: "player-action", text: "I draw my blaster", is_peer: true });
    expect(cls).toMatch(/text-muted-foreground/);
  });

  it("renders own and peer player-actions with distinct contrast classes (own > peer)", () => {
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
    // Same class = no hierarchy. Own must be the higher-contrast token.
    expect(own!.className).not.toEqual(peer!.className);
    expect(own!.className).toMatch(/text-foreground/);
    expect(peer!.className).toMatch(/text-muted-foreground/);
  });
});

// ---------------------------------------------------------------------------
// AC2 — peer-action persistence via the buildSegments accumulator
// ---------------------------------------------------------------------------

describe("71-4 AC2 — peer-action persistence (buildSegments accumulator)", () => {
  it("persists a submitted peer reveal as an is_peer player-action segment at the turn boundary", () => {
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "I open the door" }, player_id: "p1" },
      { type: MessageType.NARRATION, payload: { text: "The door creaks open." } },
      { type: MessageType.NARRATION_END, payload: {} },
    ] as unknown as GameMessage[];
    const peerActions = new Map<number, ActionRevealEntry[]>([
      [1, [submittedReveal({ player_id: "p2", character_name: "Bob", action: "I cover the hallway", round: 1, seq: 2 })]],
    ]);

    const segments = buildWithPeers(messages, peerActions) as PeerSeg[];
    const peerSegs = segments.filter((s) => s.kind === "player-action" && s.is_peer === true);

    // The peer's submitted action survives into the persistent transcript.
    expect(peerSegs).toHaveLength(1);
    expect(peerSegs[0].text).toContain("I cover the hallway");

    // It anchors at the turn boundary — AFTER the own action of that round,
    // not before it (placement: round boundary, not interleaved).
    const ownIdx = segments.findIndex((s) => s.kind === "player-action" && !s.is_peer);
    const peerIdx = segments.indexOf(peerSegs[0]);
    expect(ownIdx).toBeGreaterThanOrEqual(0);
    expect(peerIdx).toBeGreaterThan(ownIdx);
  });

  it("does NOT persist a peer action absent from the peerActions map, even if its text rides in a broader frame (firewall)", () => {
    // ADR-104/105: persisted peer text derives ONLY from the perception-filtered
    // peerActions accumulator. A peer whose action was never revealed (absent
    // from the map) must not appear — even though its text is present here in a
    // TURN_STATUS payload (a broader, unfiltered source).
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
    const peerActions = new Map<number, ActionRevealEntry[]>(); // nothing was visibly revealed

    const segments = buildWithPeers(messages, peerActions) as PeerSeg[];

    expect(segments.some((s) => (s.text ?? "").includes(HIDDEN))).toBe(false);
    expect(segments.filter((s) => s.kind === "player-action" && s.is_peer === true)).toHaveLength(0);
  });

  it("leaves single-player behavior unchanged when no peerActions map is supplied", () => {
    const messages = [
      { type: MessageType.PLAYER_ACTION, payload: { action: "I light the torch" }, player_id: "p1" },
      { type: MessageType.NARRATION, payload: { text: "Shadows retreat." } },
    ] as unknown as GameMessage[];

    const segments = buildWithPeers(messages) as PeerSeg[];
    // No peer segments appear without an accumulator.
    expect(segments.filter((s) => s.kind === "player-action" && s.is_peer === true)).toHaveLength(0);
    // The own action and narration still render.
    expect(segments.some((s) => s.kind === "player-action" && s.text === "I light the torch")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2 — Focus-mode pagination guard
// ---------------------------------------------------------------------------

describe("71-4 AC2 — peer action does not start a new turn page", () => {
  it("keeps a peer (is_peer) player-action in the same turn page as the own action", () => {
    const ownSeg: PeerSeg = { kind: "player-action", text: "I open the door" };
    const narration: NarrativeSegment = { kind: "text", html: "<p>The door opens.</p>" };
    const peerSeg: PeerSeg = { kind: "player-action", text: "Bob: I cover the hall", is_peer: true };

    const pages = buildTurnPages([ownSeg, narration, peerSeg]);

    // A peer action is NOT a turn starter — the whole turn stays one page.
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
