/**
 * RED tests for Story 51-4 — Scene Library section on ConnectScreen.
 *
 * AC-5: Add "Scene Library" section to ConnectScreen.
 * AC-6: Fetch GET /dev/scenes on mount.
 * AC-7: Display fixture cards (name + description + genre badge).
 * AC-8: Click loads the scene and navigates to play.
 *
 * All tests currently RED — the ConnectScreen has no Scene Library section,
 * no /dev/scenes fetch, and no fixture cards.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ConnectScreen, type ConnectScreenProps } from "@/screens/ConnectScreen";
import type { GenresResponse } from "@/types/genres";

// Mock useDisplayName — ConnectScreen calls it for setName.
vi.mock("@/hooks/useDisplayName", () => ({
  useDisplayName: () => ({ name: null, setName: vi.fn() }),
}));

// Mock useStartGame — not under test here.
vi.mock("@/screens/lobby/useStartGame", () => ({
  useStartGame: () => ({ start: vi.fn() }),
}));

// Mock useSessions — not under test here.
vi.mock("@/screens/lobby/useSessions", () => ({
  useSessions: () => ({ sessions: [] }),
}));

// Track navigations
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_SCENES = [
  {
    name: "combat_brawl_wasteland",
    genre: "mutant_wasteland",
    world: "flickering_reach",
    description: null,
  },
  {
    name: "social_poker_wasteland",
    genre: "mutant_wasteland",
    world: "flickering_reach",
    description: "Four-hand card game with Brand.",
  },
  {
    name: "social_negotiation_tea",
    genre: "tea_and_murder",
    world: "glenross",
    description: "A closed-door sit-down with Mr. Cornelius Moreton.",
  },
];

const MINIMAL_GENRES: GenresResponse = {
  mutant_wasteland: {
    name: "Mutant Wasteland",
    description: "Post-apocalyptic adventures.",
    worlds: [
      {
        slug: "flickering_reach",
        name: "Flickering Reach",
        description: "A wasteland settlement.",
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

function renderConnectScreen(overrides: Partial<ConnectScreenProps> = {}) {
  const props: ConnectScreenProps = {
    genres: MINIMAL_GENRES,
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <ConnectScreen {...props} />
    </MemoryRouter>,
  );
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockNavigate.mockClear();
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/dev/scenes")) {
        return new Response(JSON.stringify(MOCK_SCENES), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Pass through other fetches (genres, sessions, etc.)
      return new Response(JSON.stringify({}), { status: 200 });
    },
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
});

// ── AC-5: Scene Library section exists ───────────────────────────────────────

describe("Scene Library section", () => {
  it("renders a Scene Library heading on ConnectScreen", async () => {
    renderConnectScreen();
    await waitFor(() => {
      expect(
        screen.getByText(/scene library/i),
      ).toBeInTheDocument();
    });
  });

  // ── AC-6: Fetches GET /dev/scenes on mount ─────────────────────────────

  it("fetches /dev/scenes on mount", async () => {
    renderConnectScreen();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/dev/scenes"),
      );
    });
  });

  // ── AC-7: Fixture cards with name, description, genre badge ────────────

  it("displays fixture cards with names", async () => {
    renderConnectScreen();
    await waitFor(() => {
      expect(
        screen.getByText(/combat_brawl_wasteland/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/social_poker_wasteland/i)).toBeInTheDocument();
    expect(screen.getByText(/social_negotiation_tea/i)).toBeInTheDocument();
  });

  it("displays description text on cards that have one", async () => {
    renderConnectScreen();
    await waitFor(() => {
      expect(
        screen.getByText(/four-hand card game with brand/i),
      ).toBeInTheDocument();
    });
  });

  it("displays genre badge on fixture cards", async () => {
    renderConnectScreen();
    await waitFor(() => {
      // Genre badges — the genre slug or display name should appear
      // near the fixture card. At minimum the genre text is visible.
      const badges = screen.getAllByText(/mutant.wasteland/i);
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
    // tea_and_murder genre should also appear
    expect(screen.getByText(/tea.and.murder/i)).toBeInTheDocument();
  });

  // ── AC-8: Click loads scene and navigates ──────────────────────────────

  it("clicking a fixture card navigates to load the scene", async () => {
    const user = userEvent.setup();
    renderConnectScreen();

    await waitFor(() => {
      expect(
        screen.getByText(/combat_brawl_wasteland/i),
      ).toBeInTheDocument();
    });

    // Click the fixture card
    const card = screen.getByText(/combat_brawl_wasteland/i).closest(
      "[role='button'], button, a, [data-testid]",
    );
    expect(card).toBeTruthy();
    await user.click(card!);

    // Should navigate with the scene name — either via ?scene=NAME or
    // by POSTing /dev/scene/NAME and navigating to the returned slug.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
    const navArg = mockNavigate.mock.calls[0][0] as string;
    expect(navArg).toContain("combat_brawl_wasteland");
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("handles empty scenes list gracefully", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/dev/scenes")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    renderConnectScreen();

    // Should still render the Scene Library section, just empty
    await waitFor(() => {
      expect(screen.getByText(/scene library/i)).toBeInTheDocument();
    });
  });

  it("handles fetch failure without crashing", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/dev/scenes")) {
        return new Response("Internal Server Error", { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    // Should not throw — the Scene Library section degrades gracefully
    renderConnectScreen();

    await waitFor(() => {
      expect(screen.getByText(/scene library/i)).toBeInTheDocument();
    });
  });
});
