import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatArrangePanel } from "../StatArrangePanel";

describe("StatArrangePanel", () => {
  const baseProps = {
    pool: [12, 9, 15, 8, 14, 11],
    assignment: { STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null },
    statOrder: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
    classRequirements: [
      { name: "Fighter", requirementLabel: "STR 9+" },
      { name: "Mage", requirementLabel: "INT 9+" },
      { name: "Cleric", requirementLabel: "WIS 9+" },
      { name: "Thief", requirementLabel: "DEX 9+" },
    ],
    qualifyingClasses: [],
    onAssign: vi.fn(),
    onClear: vi.fn(),
    onConfirm: vi.fn(),
    onReject: vi.fn(),
    confirmEnabled: false,
  };

  it("renders six pool values", () => {
    render(<StatArrangePanel {...baseProps} />);
    expect(screen.getByTestId("arrange-pool-value-0")).toHaveTextContent("12");
    expect(screen.getByTestId("arrange-pool-value-5")).toHaveTextContent("11");
  });

  it("renders six empty stat slots", () => {
    render(<StatArrangePanel {...baseProps} />);
    ["STR", "DEX", "CON", "INT", "WIS", "CHA"].forEach((s) => {
      expect(screen.getByTestId(`arrange-slot-${s}`)).toHaveTextContent("—");
    });
  });

  it("highlights pool value on click", () => {
    render(<StatArrangePanel {...baseProps} />);
    fireEvent.click(screen.getByTestId("arrange-pool-value-0"));
    expect(screen.getByTestId("arrange-pool-value-0")).toHaveAttribute("data-selected", "true");
  });

  it("calls onAssign when pool then slot is tapped", () => {
    const onAssign = vi.fn();
    render(<StatArrangePanel {...baseProps} onAssign={onAssign} />);
    fireEvent.click(screen.getByTestId("arrange-pool-value-2"));
    fireEvent.click(screen.getByTestId("arrange-slot-STR"));
    expect(onAssign).toHaveBeenCalledWith({ stat: "STR", value: 15 });
  });

  it("calls onClear when filled slot is tapped", () => {
    const onClear = vi.fn();
    const filled = { ...baseProps, assignment: { ...baseProps.assignment, STR: 14 } };
    render(<StatArrangePanel {...filled} onClear={onClear} />);
    fireEvent.click(screen.getByTestId("arrange-slot-STR"));
    expect(onClear).toHaveBeenCalledWith({ stat: "STR" });
  });

  it("renders class requirements with checkmarks for qualifying classes", () => {
    const props = { ...baseProps, qualifyingClasses: ["Fighter", "Thief"] };
    render(<StatArrangePanel {...props} />);
    expect(screen.getByTestId("arrange-class-Fighter")).toHaveAttribute("data-qualifies", "true");
    expect(screen.getByTestId("arrange-class-Mage")).toHaveAttribute("data-qualifies", "false");
  });

  it("disables confirm button when confirmEnabled is false", () => {
    render(<StatArrangePanel {...baseProps} />);
    expect(screen.getByTestId("arrange-confirm")).toBeDisabled();
  });

  it("enables confirm button when confirmEnabled is true", () => {
    render(<StatArrangePanel {...baseProps} confirmEnabled />);
    expect(screen.getByTestId("arrange-confirm")).toBeEnabled();
  });

  it("calls onReject when reject button is clicked", () => {
    const onReject = vi.fn();
    render(<StatArrangePanel {...baseProps} onReject={onReject} />);
    fireEvent.click(screen.getByTestId("arrange-reject"));
    expect(onReject).toHaveBeenCalledOnce();
  });
});
