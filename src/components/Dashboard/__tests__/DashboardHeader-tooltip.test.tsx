import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardHeader } from "../DashboardHeader";

describe("DashboardHeader", () => {
  it("uses a non-stale refresh tooltip (no 'Rust')", () => {
    render(
      <DashboardHeader
        connected
        turnCount={0}
        errorCount={0}
        p95="—"
        paused={false}
        onTogglePause={() => {}}
        onClear={() => {}}
        onRefreshState={() => {}}
      />,
    );
    const btn = screen.getByTitle(/Refresh game state from server/i);
    expect(btn).toBeInTheDocument();
    expect(screen.queryByTitle(/Rust/i)).toBeNull();
  });

  it("renders the Inspector header name", () => {
    render(
      <DashboardHeader
        connected
        turnCount={0}
        errorCount={0}
        p95="—"
        paused={false}
        onTogglePause={() => {}}
        onClear={() => {}}
        onRefreshState={() => {}}
      />,
    );
    expect(screen.getByText(/Inspector/)).toBeInTheDocument();
  });
});
