import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortraitPanel } from "../PortraitPanel";

describe("PortraitPanel", () => {
  const portraits = [
    {
      slug: "picker_a",
      portrait_url: "/a.png",
      culture: "heg",
      archetype: "ruler",
      sex: "female",
      role: "Officer",
    },
    {
      slug: "picker_b",
      portrait_url: "/b.png",
      culture: "drift",
      archetype: "outlaw",
      sex: "male",
      role: "Miner",
    },
  ];

  it("renders a grid tile per portrait", () => {
    render(
      <PortraitPanel
        portraits={portraits}
        suggestArchetype={null}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByTestId("portrait-tile-picker_a")).toBeInTheDocument();
    expect(screen.getByTestId("portrait-tile-picker_b")).toBeInTheDocument();
  });

  it("calls onConfirm with chosen slug on confirm button click", () => {
    const onConfirm = vi.fn();
    render(
      <PortraitPanel
        portraits={portraits}
        suggestArchetype={null}
        onConfirm={onConfirm}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("portrait-tile-picker_b"));
    fireEvent.click(screen.getByTestId("portrait-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("picker_b");
  });

  it("calls onSkip when skip button clicked", () => {
    const onSkip = vi.fn();
    render(
      <PortraitPanel
        portraits={portraits}
        suggestArchetype={null}
        onConfirm={vi.fn()}
        onSkip={onSkip}
      />,
    );
    fireEvent.click(screen.getByTestId("portrait-skip"));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("soft-suggest: archetype-matching portrait appears first in grid", () => {
    render(
      <PortraitPanel
        portraits={portraits}
        suggestArchetype="outlaw"
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    const tiles = screen.getAllByTestId(/^portrait-tile-/);
    expect(tiles[0]).toHaveAttribute("data-testid", "portrait-tile-picker_b");
    expect(tiles[1]).toHaveAttribute("data-testid", "portrait-tile-picker_a");
  });

  it("empty portraits: shows portrait-empty message and skip button", () => {
    render(
      <PortraitPanel
        portraits={[]}
        suggestArchetype={null}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByTestId("portrait-empty")).toBeInTheDocument();
    expect(screen.getByTestId("portrait-skip")).toBeInTheDocument();
  });

  // sq-playtest 2026-06-16: the picker fetch is async. `null` is the loading
  // sentinel — while the roster is in flight the panel must show a loading
  // status (with Skip), NEVER the permanent "No sample portraits" empty-state.
  it("loading (null portraits): shows portrait-loading, NOT the empty-state", () => {
    render(
      <PortraitPanel
        portraits={null}
        suggestArchetype={null}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByTestId("portrait-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("portrait-empty")).not.toBeInTheDocument();
    // Skip stays reachable so a slow or failed fetch never traps the player.
    expect(screen.getByTestId("portrait-skip")).toBeInTheDocument();
  });

  it("loading then resolved: a null→[items] transition replaces loading with the grid", () => {
    const { rerender } = render(
      <PortraitPanel
        portraits={null}
        suggestArchetype={null}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByTestId("portrait-loading")).toBeInTheDocument();
    rerender(
      <PortraitPanel
        portraits={portraits}
        suggestArchetype={null}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("portrait-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("portrait-tile-picker_a")).toBeInTheDocument();
  });
});
