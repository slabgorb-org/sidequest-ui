import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettlementRoomView } from "@/components/SettlementRoomView";

describe("SettlementRoomView", () => {
  const props = {
    name: "The Confessional",
    description: "A small house keyed to humility, against pride.",
    exits: [
      { to: "sunden_square", label: "out to the square" },
      { to: "the_wall", label: "to the Wall of Names" },
    ],
  };

  it("renders the room name as a heading", () => {
    render(<SettlementRoomView {...props} />);
    expect(screen.getByRole("heading", { name: "The Confessional" })).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(<SettlementRoomView {...props} />);
    expect(screen.getByText(/keyed to humility/)).toBeInTheDocument();
  });

  it("renders one exit per item with label", () => {
    render(<SettlementRoomView {...props} />);
    expect(screen.getByText("out to the square")).toBeInTheDocument();
    expect(screen.getByText("to the Wall of Names")).toBeInTheDocument();
  });

  it("renders empty exits gracefully", () => {
    render(<SettlementRoomView {...props} exits={[]} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
