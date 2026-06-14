import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardTabs } from "../DashboardTabs";

describe("DashboardTabs", () => {
  it("includes a Mechanical tab", () => {
    render(<DashboardTabs activeTab={0} onTabChange={() => {}} turnCount={0} errorCount={0} />);
    expect(screen.getByText(/Mechanical/)).toBeInTheDocument();
  });
});
