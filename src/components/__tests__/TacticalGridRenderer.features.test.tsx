import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TacticalGridRenderer } from "@/components/TacticalGridRenderer";
import type { TacticalGridData } from "@/types/tactical";

const grid: TacticalGridData = {
  room_id: "r", room_name: "r", room_type: "cavern",
  mask: "###\n#.#\n###", cavern_image_url: "/x.png", cell_size: 28, cellular: null,
  derived: { floor_count: 1, exits: { north: [1, 0] }, pois: [[1, 1]] },
  tokens: [],
  features: [{ feature_type: "water", cell: { x: 1, y: 1 }, label: "black water" }],
};

describe("TacticalGridRenderer features", () => {
  it("renders a feature marker with its label as title", () => {
    render(<TacticalGridRenderer grid={grid} />);
    const marker = screen.getByTestId("feature-water-1-1");
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveAttribute("title", "black water");
  });

  it("renders a legend entry for present feature types", () => {
    render(<TacticalGridRenderer grid={grid} />);
    expect(screen.getByTestId("legend-water")).toBeInTheDocument();
  });

  it("renders an exit marker", () => {
    render(<TacticalGridRenderer grid={grid} />);
    expect(screen.getByTestId("exit-north")).toBeInTheDocument();
  });

  it("renders a POI marker", () => {
    render(<TacticalGridRenderer grid={grid} />);
    expect(screen.getByTestId("poi-1-1")).toBeInTheDocument();
  });
});
