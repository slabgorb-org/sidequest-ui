import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ConnectScreen } from "@/screens/ConnectScreen";
import { appendHistory } from "@/screens/lobby/historyStore";
import type { GenresResponse } from "@/types/genres";

/**
 * Wiring test for the [BUG-LOW] Past Journeys mode-icon fix
 * (sq-playtest-pingpong.md, 2026-04-26).
 *
 * Per CLAUDE.md "Every Test Suite Needs a Wiring Test" — the unit tests
 * in `lobby/__tests__/JourneyHistory.test.tsx` prove the icon renders
 * when JourneyHistory is mounted directly. That's not enough: we also
 * need to prove the lobby (`ConnectScreen`) actually mounts JourneyHistory
 * AND that the mode badge survives the full production render path
 * (provider chain, prop wiring, conditional rendering).
 *
 * If someone deletes `<JourneyHistory />` from ConnectScreen or stops
 * passing the entry's mode field through, this test fails.
 */
const GENRES: GenresResponse = {
  tea_and_murder: {
    name: "Tea & Murder",
    description: "Cosy Edwardian village mystery.",
    worlds: [
      {
        slug: "albion",
        name: "Albion",
        description: "Foggy streets.",
        era: null,
        setting: null,
        inspirations: [],
        axis_snapshot: {},
        hero_image: null,
        navigation_mode: null,
      },
    ],
  },
};

describe("past-journeys mode icon — lobby wiring", () => {
  beforeEach(() => {
    localStorage.clear();
    // ConnectScreen polls /api/sessions on mount via useSessions.
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.startsWith("/api/sessions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessions: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  });

  it("renders solo, multiplayer, and unknown-mode icons in the lobby past-journeys list", () => {
    // Seed three entries — one of each mode flavor — exactly the way the
    // production code seeds them via appendHistory after a successful start.
    appendHistory({
      player_name: "SoloRider",
      genre: "tea_and_murder",
      world: "albion",
      mode: "solo",
    });
    appendHistory({
      player_name: "MPRider",
      genre: "tea_and_murder",
      world: "albion",
      mode: "multiplayer",
    });
    appendHistory({
      player_name: "LegacyRider",
      genre: "tea_and_murder",
      world: "albion",
      // No `mode` — pre-2026-04-24 entry shape.
    });

    render(
      <MemoryRouter>
        <ConnectScreen genres={GENRES} />
      </MemoryRouter>,
    );

    // The lobby must surface all three rows with distinguishable mode badges.
    // Locate each row by its player-name text, then assert its row contains
    // a mode-tagged span. data-mode is the contract; the literal glyph is
    // an implementation detail re-asserted below for the visual spec.
    const soloRow = screen.getByText("SoloRider").closest("button")!;
    const mpRow = screen.getByText("MPRider").closest("button")!;
    const legacyRow = screen.getByText("LegacyRider").closest("button")!;

    const soloBadge = soloRow.querySelector('[data-mode="solo"]');
    const mpBadge = mpRow.querySelector('[data-mode="multiplayer"]');
    const legacyBadge = legacyRow.querySelector('[data-mode="unknown"]');

    expect(soloBadge).not.toBeNull();
    expect(mpBadge).not.toBeNull();
    expect(legacyBadge).not.toBeNull();

    // Visual spec — locks the chosen glyphs to the playtest report's spec
    // (◈ solo, ⚑ MP) plus the legacy ◇ choice documented in modeBadge().
    expect(soloBadge!.textContent).toBe("◈");
    expect(mpBadge!.textContent).toBe("⚑");
    expect(legacyBadge!.textContent).toBe("◇");
  });
});
