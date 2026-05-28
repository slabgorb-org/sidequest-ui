/**
 * Story 71-4 — Player-action transcript: own-echo contrast bump + peer-action
 * persistence (ADR-036 collaborative visibility, ADR-104/105 perception firewall).
 *
 * This file holds the INTERFACE-INDEPENDENT red-phase tests:
 *   - AC1: own-action contrast bump (renderSegment player-action treatment).
 *   - AC2 firewall guard: peer action text from a BROADER source than the
 *     perception-filtered reveals map must never reach the transcript.
 *
 * The AC2 persistence happy-path test (revealed peer action survives
 * TURN_STATUS{resolved}) is held pending the Architect ruling on the
 * snapshot→persist interface (buildSegments param vs NarrationCards prop), and
 * lands in the end-to-end wiring test once that signature is fixed.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderSegment, type RenderSegmentOpts } from "@/components/narrativeRenderers";
import { NarrationCards } from "@/components/NarrationCards";
import { MessageType, type GameMessage } from "@/types/protocol";

// renderSegment learns own-vs-peer via an optional flag. The field does not
// exist on RenderSegmentOpts yet (that is the point of the red phase); cast so
// the test compiles against the documented contract before Dev adds it.
type OwnAwareOpts = RenderSegmentOpts & { isOwnAction?: boolean };

function renderPlayerAction(text: string, isOwnAction: boolean | undefined) {
  render(
    <>{renderSegment({ kind: "player-action", text }, 0, { isOwnAction } as OwnAwareOpts)}</>,
  );
  return screen.getByTestId("player-action").className;
}

describe("71-4 AC1 — own-action contrast bump", () => {
  it("renders an OWN player-action at higher contrast than the muted default", () => {
    const cls = renderPlayerAction("I kick the door open", true);
    // The current treatment is text-muted-foreground/70 for every action.
    // An own action must escape that low-contrast token entirely...
    expect(cls).not.toMatch(/text-muted-foreground/);
    // ...and use the high-contrast foreground token (WCAG AA 4.5:1 body text).
    expect(cls).toMatch(/text-foreground/);
  });

  it("keeps a PEER player-action at the lower-contrast muted treatment", () => {
    const cls = renderPlayerAction("I draw my blaster", false);
    expect(cls).toMatch(/text-muted-foreground/);
  });

  it("renders own and peer player-actions with distinct contrast classes (own > peer)", () => {
    render(
      <>
        {renderSegment({ kind: "player-action", text: "OWN" }, 0, { isOwnAction: true } as OwnAwareOpts)}
        {renderSegment({ kind: "player-action", text: "PEER" }, 1, { isOwnAction: false } as OwnAwareOpts)}
      </>,
    );
    const nodes = screen.getAllByTestId("player-action");
    const own = nodes.find((n) => n.textContent === "OWN");
    const peer = nodes.find((n) => n.textContent === "PEER");
    expect(own).toBeDefined();
    expect(peer).toBeDefined();
    // The two must be visually distinguishable — same class = no hierarchy.
    expect(own!.className).not.toEqual(peer!.className);
    expect(own!.className).toMatch(/text-foreground/);
    expect(peer!.className).toMatch(/text-muted-foreground/);
  });
});

describe("71-4 AC2 — peer-action persistence firewall (ADR-104/105)", () => {
  it("never surfaces peer action text carried by a broader frame (TURN_STATUS) outside the filtered reveals", () => {
    // The broadcast-layer firewall (ADR-105) means the client's reveals map is
    // the authoritative visible set. Persisted peer text must derive ONLY from
    // that filtered stream — never from a broader origin such as a TURN_STATUS
    // roster that happens to carry action text. Here p2's action arrives ONLY
    // inside a TURN_STATUS payload (never as a visible ACTION_REVEAL), so it
    // must not appear in the transcript.
    const HIDDEN = "I plant the charge in the reactor core";
    const messages = [
      {
        type: MessageType.PLAYER_ACTION,
        payload: { action: "I open the bridge door" },
        player_id: "p1",
      },
      {
        type: MessageType.TURN_STATUS,
        payload: {
          player_id: "p2",
          character_name: "Bob",
          status: "resolved",
          action: HIDDEN,
        },
        player_id: "p2",
      },
    ] as unknown as GameMessage[];

    render(<NarrationCards messages={messages} />);

    // The own action still renders normally.
    expect(screen.getByText("I open the bridge door")).toBeInTheDocument();
    // The peer's TURN_STATUS-borne action text must be absent — sourcing peer
    // text from anything but the filtered reveals map is a firewall regression.
    expect(screen.queryByText(HIDDEN)).not.toBeInTheDocument();
    expect(screen.queryByText(/charge in the reactor/)).not.toBeInTheDocument();
  });
});
