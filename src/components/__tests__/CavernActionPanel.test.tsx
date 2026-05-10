import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CavernActionPanel } from "@/components/CavernActionPanel";

describe("CavernActionPanel", () => {
  const props = {
    tokenName: "Keith",
    className: "fighter, lvl 4",
    hp: { current: 32, max: 36 },
    ac: 16,
    speed: 30,
    position: { x: 7, y: 9 },
  };

  it("renders the character header", () => {
    render(<CavernActionPanel {...props} onAction={vi.fn()} />);
    expect(screen.getByText(/Keith — fighter, lvl 4/)).toBeInTheDocument();
  });

  it("renders stat rows", () => {
    render(<CavernActionPanel {...props} onAction={vi.fn()} />);
    expect(screen.getByText("32 / 36")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText("30 ft")).toBeInTheDocument();
    expect(screen.getByText("[7,9]")).toBeInTheDocument();
  });

  it("calls onAction with the action id when a button is clicked", () => {
    const onAction = vi.fn();
    render(<CavernActionPanel {...props} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /move/i }));
    expect(onAction).toHaveBeenCalledWith("move");
  });

  it("renders all six standard actions plus end-turn", () => {
    render(<CavernActionPanel {...props} onAction={vi.fn()} />);
    for (const label of ["Move", "Dash", "Attack", "Cast", "Object", "Dodge", "End turn"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });
});
