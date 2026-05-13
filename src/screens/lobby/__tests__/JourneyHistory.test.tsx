import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { JourneyHistory } from "@/screens/lobby/JourneyHistory";
import { modeBadge } from "@/screens/lobby/modeBadge";
import { appendHistory, loadHistory } from "@/screens/lobby/historyStore";

describe("JourneyHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const prettyGenre = (slug: string) => slug.replace(/_/g, " ");
  const prettyWorld = (_genre: string, slug: string) => slug.replace(/_/g, " ");

  it("renders nothing when history is empty", () => {
    const { container } = render(
      <JourneyHistory
        onSelect={vi.fn()}
        prettyGenre={prettyGenre}
        prettyWorld={prettyWorld}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per stored entry, newest first", () => {
    appendHistory({
      player_name: "Older",
      genre: "tea_and_murder",
      world: "albion",
    });
    // Force a millisecond gap so timestamps differ.
    appendHistory({
      player_name: "Newer",
      genre: "spaghetti_western",
      world: "dust_and_lead",
    });

    render(
      <JourneyHistory
        onSelect={vi.fn()}
        prettyGenre={prettyGenre}
        prettyWorld={prettyWorld}
      />,
    );

    const buttons = screen.getAllByRole("button");
    // The first button (excluding the X buttons inside) is "Newer".
    expect(buttons[0]).toHaveTextContent(/Newer/);
    expect(buttons[0]).toHaveTextContent(/spaghetti western/);
  });

  it("calls onSelect with the entry when a row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    appendHistory({
      player_name: "Keith",
      genre: "tea_and_murder",
      world: "albion",
    });

    render(
      <JourneyHistory
        onSelect={onSelect}
        prettyGenre={prettyGenre}
        prettyWorld={prettyWorld}
      />,
    );

    await user.click(screen.getByText(/Keith/).closest("button")!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      player_name: "Keith",
      genre: "tea_and_murder",
      world: "albion",
    });
  });

  it("removes the entry from localStorage when X is clicked", async () => {
    const user = userEvent.setup();
    appendHistory({
      player_name: "Keith",
      genre: "tea_and_murder",
      world: "albion",
    });
    appendHistory({
      player_name: "Sam",
      genre: "spaghetti_western",
      world: "dust_and_lead",
    });

    render(
      <JourneyHistory
        onSelect={vi.fn()}
        prettyGenre={prettyGenre}
        prettyWorld={prettyWorld}
      />,
    );

    // Find the X button for Keith via aria-label.
    const forgetKeith = screen.getByRole("button", { name: /forget keith/i });
    await user.click(forgetKeith);

    const remaining = loadHistory();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].player_name).toBe("Sam");
  });

  it("X click does not also trigger row select", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    appendHistory({
      player_name: "Keith",
      genre: "tea_and_murder",
      world: "albion",
    });

    render(
      <JourneyHistory
        onSelect={onSelect}
        prettyGenre={prettyGenre}
        prettyWorld={prettyWorld}
      />,
    );

    const forgetBtn = screen.getByRole("button", { name: /forget keith/i });
    await user.click(forgetBtn);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders a mode icon per row (solo / multiplayer / unknown legacy)", () => {
    appendHistory({
      player_name: "SoloKid",
      genre: "tea_and_murder",
      world: "albion",
      mode: "solo",
    });
    appendHistory({
      player_name: "MPKid",
      genre: "tea_and_murder",
      world: "albion",
      mode: "multiplayer",
    });
    appendHistory({
      player_name: "LegacyKid",
      genre: "tea_and_murder",
      world: "albion",
      // No mode — simulates a pre-2026-04-24 entry.
    });

    render(
      <JourneyHistory
        onSelect={vi.fn()}
        prettyGenre={prettyGenre}
        prettyWorld={prettyWorld}
      />,
    );

    // Each row carries a mode-tagged span. Use data-mode to avoid coupling
    // to the literal glyph (so we can swap ◈/⚑/◇ later without breaking).
    const soloBadge = screen
      .getByText("SoloKid")
      .closest("button")!
      .querySelector('[data-mode="solo"]');
    const mpBadge = screen
      .getByText("MPKid")
      .closest("button")!
      .querySelector('[data-mode="multiplayer"]');
    const legacyBadge = screen
      .getByText("LegacyKid")
      .closest("button")!
      .querySelector('[data-mode="unknown"]');

    expect(soloBadge).not.toBeNull();
    expect(mpBadge).not.toBeNull();
    expect(legacyBadge).not.toBeNull();
    expect(soloBadge!.textContent).toBe("◈");
    expect(mpBadge!.textContent).toBe("⚑");
    expect(legacyBadge!.textContent).toBe("◇");
    // aria-label gives screen-reader users the same signal Alex gets visually.
    expect(soloBadge!.getAttribute("aria-label")).toMatch(/solo/i);
    expect(mpBadge!.getAttribute("aria-label")).toMatch(/multiplayer/i);
    expect(legacyBadge!.getAttribute("aria-label")).toMatch(/unknown/i);
  });

  it("modeBadge maps each mode value to its glyph + label", () => {
    expect(modeBadge("solo")).toEqual({
      glyph: "◈",
      label: "solo session",
    });
    expect(modeBadge("multiplayer")).toEqual({
      glyph: "⚑",
      label: "multiplayer session",
    });
    expect(modeBadge(undefined)).toEqual({
      glyph: "◇",
      label: "unknown mode (legacy entry)",
    });
  });

  it("hides itself after the last entry is removed", async () => {
    const user = userEvent.setup();
    appendHistory({
      player_name: "Keith",
      genre: "tea_and_murder",
      world: "albion",
    });

    const { container } = render(
      <JourneyHistory
        onSelect={vi.fn()}
        prettyGenre={prettyGenre}
        prettyWorld={prettyWorld}
      />,
    );

    const forgetBtn = screen.getByRole("button", { name: /forget keith/i });
    await user.click(forgetBtn);

    expect(container).toBeEmptyDOMElement();
  });
});
