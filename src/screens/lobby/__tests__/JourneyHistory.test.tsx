import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  describe("self-eviction of stale entries (server 404)", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function makeResponse(status: number): Response {
      return new Response(null, { status });
    }

    it("evicts entries whose game_slug returns 404", async () => {
      appendHistory({
        player_name: "Narder",
        genre: "caverns_and_claudes",
        world: "caverns_sunden",
        game_slug: "2026-05-10-caverns_sunden-mp",
        mode: "multiplayer",
      });
      appendHistory({
        player_name: "Keith",
        genre: "victoria",
        world: "albion",
        game_slug: "2026-05-09-albion-solo",
        mode: "solo",
      });

      fetchMock.mockImplementation(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("2026-05-10-caverns_sunden-mp")) {
          return makeResponse(404);
        }
        return makeResponse(200);
      });

      render(
        <JourneyHistory
          onSelect={vi.fn()}
          prettyGenre={(s) => s}
          prettyWorld={(_, s) => s}
        />,
      );

      // Both rows initially present, then the 404 one self-evicts.
      expect(screen.getByText(/Narder/)).toBeInTheDocument();
      expect(screen.getByText(/Keith/)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText(/Narder/)).not.toBeInTheDocument();
      });

      // Surviving entry remains in DOM AND in localStorage.
      expect(screen.getByText(/Keith/)).toBeInTheDocument();
      const remaining = loadHistory();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].player_name).toBe("Keith");
    });

    it("keeps entries that return 200", async () => {
      appendHistory({
        player_name: "Keith",
        genre: "victoria",
        world: "albion",
        game_slug: "2026-05-09-albion-solo",
      });

      fetchMock.mockResolvedValue(makeResponse(200));

      render(
        <JourneyHistory
          onSelect={vi.fn()}
          prettyGenre={(s) => s}
          prettyWorld={(_, s) => s}
        />,
      );

      // Wait one tick for any pending validation to settle.
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      expect(screen.getByText(/Keith/)).toBeInTheDocument();
      expect(loadHistory()).toHaveLength(1);
    });

    it("does not validate legacy entries without game_slug", async () => {
      appendHistory({
        player_name: "Legacy",
        genre: "victoria",
        world: "albion",
        // No game_slug — pre-2026-04-24 entry.
      });

      fetchMock.mockResolvedValue(makeResponse(404));

      render(
        <JourneyHistory
          onSelect={vi.fn()}
          prettyGenre={(s) => s}
          prettyWorld={(_, s) => s}
        />,
      );

      // Give the effect a tick to run if it were going to.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText(/Legacy/)).toBeInTheDocument();
    });

    it("keeps entries on transient network failure (does not evict)", async () => {
      appendHistory({
        player_name: "Keith",
        genre: "victoria",
        world: "albion",
        game_slug: "2026-05-09-albion-solo",
      });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      render(
        <JourneyHistory
          onSelect={vi.fn()}
          prettyGenre={(s) => s}
          prettyWorld={(_, s) => s}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      // Network error is not a 404 — keep the entry.
      expect(screen.getByText(/Keith/)).toBeInTheDocument();
      expect(loadHistory()).toHaveLength(1);
    });

    it("keeps entries that return 5xx (server hiccup, not a definitive 'gone')", async () => {
      appendHistory({
        player_name: "Keith",
        genre: "victoria",
        world: "albion",
        game_slug: "2026-05-09-albion-solo",
      });

      fetchMock.mockResolvedValue(makeResponse(503));

      render(
        <JourneyHistory
          onSelect={vi.fn()}
          prettyGenre={(s) => s}
          prettyWorld={(_, s) => s}
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      expect(screen.getByText(/Keith/)).toBeInTheDocument();
      expect(loadHistory()).toHaveLength(1);
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
