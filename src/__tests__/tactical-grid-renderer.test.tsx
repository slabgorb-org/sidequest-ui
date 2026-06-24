import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TacticalGridRenderer } from "@/components/TacticalGridRenderer";
import type { TacticalGridData } from "@/types/tactical";

const FIXTURE: TacticalGridData = {
  room_id: "mouth",
  room_name: "The Mouth",
  room_type: "cavern",
  mask: ".....\n.....\n..#..\n.....\n.....",
  cavern_image_url: "/genre/test/mouth.cavern.png",
  cell_size: 28,
  cellular: { size: [5, 5], seed: 1, density: 0.55, cutoff: 5, passes: 4 },
  derived: { floor_count: 24, exits: { north: [2, 0], south: null, east: null, west: null }, pois: [[0, 0]] },
  features: [],
  tokens: [
    {
      id: "k", name: "Keith", initial: "K", faction: "player",
      cell: { x: 1, y: 1 }, hp: { current: 32, max: 36 }, ac: 16,
      className: "fighter, lvl 4", speed: 30,
    },
    {
      id: "g", name: "Goblin", initial: "g", faction: "hostile",
      cell: { x: 3, y: 3 }, hp: { current: 7, max: 7 }, ac: 13,
    },
  ],
};

describe("TacticalGridRenderer — image-mode rendering", () => {
  it("renders the cavern PNG as an <img>", () => {
    render(<TacticalGridRenderer grid={FIXTURE} />);
    const img = screen.getByTestId("cavern-floor") as HTMLImageElement;
    expect(img.src).toContain("/genre/test/mouth.cavern.png");
  });

  it("renders one token per fixture token at the correct pixel position", () => {
    render(<TacticalGridRenderer grid={FIXTURE} />);
    const keith = screen.getByTestId("token-k");
    expect(keith).toHaveStyle({ left: "28px", top: "28px" });  // (1,1) * 28
    const goblin = screen.getByTestId("token-g");
    expect(goblin).toHaveStyle({ left: "84px", top: "84px" });  // (3,3) * 28
  });

  it("does not show reach disc by default", () => {
    render(<TacticalGridRenderer grid={FIXTURE} />);
    expect(screen.queryByTestId("reach-disc")).not.toBeInTheDocument();
  });

  it("does not show action panel by default", () => {
    render(<TacticalGridRenderer grid={FIXTURE} />);
    expect(screen.queryByTestId("cavern-action-panel")).not.toBeInTheDocument();
  });
});

describe("TacticalGridRenderer — selected state", () => {
  it("shows reach disc + action panel when a player token is clicked", () => {
    render(<TacticalGridRenderer grid={FIXTURE} />);
    fireEvent.click(screen.getByTestId("token-k"));
    expect(screen.getByTestId("reach-disc")).toBeInTheDocument();
    expect(screen.getByTestId("cavern-action-panel")).toBeInTheDocument();
  });

  it("highlights cells within Chebyshev radius speed/5", () => {
    render(<TacticalGridRenderer grid={FIXTURE} />);
    fireEvent.click(screen.getByTestId("token-k"));
    // speed 30 / 5 = 6 cells radius. In a 5x5 mask, that's most of the floor.
    const highlighted = screen.getAllByTestId(/^reach-cell-/);
    expect(highlighted.length).toBeGreaterThan(0);
  });

  it("does not select hostile tokens", () => {
    render(<TacticalGridRenderer grid={FIXTURE} />);
    fireEvent.click(screen.getByTestId("token-g"));
    expect(screen.queryByTestId("cavern-action-panel")).not.toBeInTheDocument();
  });

  it("clears selection when the same token is clicked again", () => {
    render(<TacticalGridRenderer grid={FIXTURE} />);
    fireEvent.click(screen.getByTestId("token-k"));
    fireEvent.click(screen.getByTestId("token-k"));
    expect(screen.queryByTestId("cavern-action-panel")).not.toBeInTheDocument();
  });
});
