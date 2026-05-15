import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PeerRevealList } from "../PeerRevealList";
import type { PeerReveal } from "@/hooks/usePeerReveals";

const reveal = (over: Partial<PeerReveal>): PeerReveal => ({
  player_id: "p2",
  character_name: "Bob",
  status: "composing",
  action: "I draw my sword",
  aside: false,
  seq: 1,
  round: 1,
  ...over,
});

const partyOrder = ["p1", "p2", "p3"];

describe("PeerRevealList", () => {
  it("renders nothing when reveals empty", () => {
    const { container } = render(
      <PeerRevealList reveals={new Map()} partyOrder={partyOrder} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a composing row with header + action text", () => {
    const map = new Map([["p2", reveal({ action: "I creep" })]]);
    render(<PeerRevealList reveals={map} partyOrder={partyOrder} />);
    expect(screen.getByText(/Bob is composing/)).toBeInTheDocument();
    expect(screen.getByText(/I creep/)).toBeInTheDocument();
  });

  it("renders a submitted row with check + action text", () => {
    const map = new Map([
      ["p2", reveal({ status: "submitted", action: "I draw my pistol" })],
    ]);
    render(<PeerRevealList reveals={map} partyOrder={partyOrder} />);
    expect(screen.getByText(/Bob.*submitted/)).toBeInTheDocument();
    expect(screen.getByText(/I draw my pistol/)).toBeInTheDocument();
  });

  it("renders rows in partyOrder, not insertion order", () => {
    const map = new Map([
      ["p3", reveal({ player_id: "p3", character_name: "Carol", action: "z" })],
      ["p2", reveal({ player_id: "p2", character_name: "Bob", action: "y" })],
    ]);
    render(<PeerRevealList reveals={map} partyOrder={partyOrder} />);
    const headers = screen.getAllByTestId("peer-reveal-header");
    expect(headers[0].textContent).toMatch(/Bob/);
    expect(headers[1].textContent).toMatch(/Carol/);
  });

  it("aside flag adds the OOC visual marker", () => {
    const map = new Map([
      ["p2", reveal({ aside: true, action: "looks like a trap" })],
    ]);
    render(<PeerRevealList reveals={map} partyOrder={partyOrder} />);
    const row = screen.getByTestId("peer-reveal-row-p2");
    expect(row.querySelector("[data-aside='true']")).not.toBeNull();
  });

  it("renders multiple peers stacked", () => {
    const map = new Map([
      ["p2", reveal({ player_id: "p2", character_name: "Bob", action: "step left" })],
      [
        "p3",
        reveal({
          player_id: "p3",
          character_name: "Carol",
          action: "draw blade",
          status: "submitted",
        }),
      ],
    ]);
    render(<PeerRevealList reveals={map} partyOrder={partyOrder} />);
    expect(screen.getByText(/Bob is composing/)).toBeInTheDocument();
    expect(screen.getByText(/Carol.*submitted/)).toBeInTheDocument();
    expect(screen.getByText(/step left/)).toBeInTheDocument();
    expect(screen.getByText(/draw blade/)).toBeInTheDocument();
  });

  it("peers not in partyOrder still render (appended last)", () => {
    const map = new Map([
      ["pX", reveal({ player_id: "pX", character_name: "Mystery", action: "?" })],
      ["p2", reveal({ action: "y" })],
    ]);
    render(<PeerRevealList reveals={map} partyOrder={["p1", "p2"]} />);
    const headers = screen.getAllByTestId("peer-reveal-header");
    expect(headers[0].textContent).toMatch(/Bob/);
    expect(headers[1].textContent).toMatch(/Mystery/);
  });

  // sq-playtest 2026-05-15 [UX] two-banner mismatch:
  // when ACTION_REVEAL drops the composing→submitted transition but the
  // sealed-letter barrier already recorded the seal, PeerRevealList should
  // trust the server-authoritative seal state, not the stale stream entry.
  it("renders peer as submitted when in sealedPlayerIds, even if status is composing", () => {
    const map = new Map([
      ["p2", reveal({ status: "composing", action: "I draw my torch" })],
    ]);
    render(
      <PeerRevealList
        reveals={map}
        partyOrder={partyOrder}
        sealedPlayerIds={new Set(["p2"])}
      />,
    );
    expect(screen.getByText(/Bob.*submitted/)).toBeInTheDocument();
    expect(screen.queryByText(/Bob is composing/)).not.toBeInTheDocument();
    expect(screen.getByText(/I draw my torch/)).toBeInTheDocument();
    const row = screen.getByTestId("peer-reveal-row-p2");
    expect(row.getAttribute("data-effective-submitted")).toBe("true");
    expect(row.getAttribute("data-status")).toBe("composing");
  });

  it("keeps composing label when sealedPlayerIds does not include the peer", () => {
    const map = new Map([
      ["p2", reveal({ status: "composing", action: "I creep" })],
    ]);
    render(
      <PeerRevealList
        reveals={map}
        partyOrder={partyOrder}
        sealedPlayerIds={new Set(["p3"])}
      />,
    );
    expect(screen.getByText(/Bob is composing/)).toBeInTheDocument();
    const row = screen.getByTestId("peer-reveal-row-p2");
    expect(row.getAttribute("data-effective-submitted")).toBe("false");
  });
});
