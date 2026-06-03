/**
 * ConnectScreen reference surface integration tests.
 *
 * These tests verify that ReferenceLinks is wired into ConnectScreen and
 * responds correctly to lobby state. The harness mirrors ConnectScreen.test.tsx
 * exactly — same GENRES fixture, same fetch mock, same MemoryRouter wrapper.
 *
 * Note on "pack selected, world unselected" state: ConnectScreen's world
 * picker (`handleSelectWorld`) always derives both genreSlug and worldSlug
 * from the same composite "genre/world" string in a single setState pair.
 * There is no UI path that produces a pack-without-world state, so the
 * "enabled Rules, disabled Lore" branch is covered by the ReferenceLinks
 * unit tests (ReferenceLinks.disabled.test.tsx) but cannot be exercised
 * through ConnectScreen interaction — that test case is intentionally absent
 * here.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ConnectScreen } from "@/screens/ConnectScreen";
import type { GenresResponse } from "@/types/genres";

const STORAGE_KEY = "sidequest-connect";

const GENRES: GenresResponse = {
  low_fantasy: {
    name: "Low Fantasy",
    description: "Gritty medieval adventures.",
    worlds: [
      {
        slug: "greyhawk",
        name: "Greyhawk",
        description: "The Flanaess, a continent of warring kingdoms.",
        era: null,
        setting: null,
        inspirations: [],
        axis_snapshot: {},
        hero_image: null,
        navigation_mode: null,
      },
      {
        slug: "forgotten_realms",
        name: "Forgotten Realms",
        description: "Faerûn — a world of high fantasy.",
        era: null,
        setting: null,
        inspirations: [],
        axis_snapshot: {},
        hero_image: null,
        navigation_mode: null,
      },
    ],
  },
  road_warrior: {
    name: "Road Warrior",
    description: "Vehicular post-apocalypse.",
    worlds: [
      {
        slug: "wasteland",
        name: "Wasteland",
        description: "Nothing but dust and engines.",
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

function renderConnect(props: Parameters<typeof ConnectScreen>[0]) {
  return render(
    <MemoryRouter>
      <ConnectScreen {...props} />
    </MemoryRouter>,
  );
}

describe("ConnectScreen reference surface", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.startsWith("/api/sessions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
      }
      if (typeof url === "string" && url === "/api/games" && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ slug: "test-slug", mode: "solo" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  });

  it("renders ReferenceLinks (both disabled) before any world is selected", () => {
    renderConnect({ genres: GENRES });

    // The wrapping div is always present.
    expect(screen.getByTestId("reference-links")).toBeInTheDocument();

    // No real links — both are disabled spans.
    expect(screen.queryByRole("link", { name: /rules/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /lore/i })).toBeNull();

    expect(screen.getByText(/^Rules$/i).closest('[aria-disabled="true"]')).not.toBeNull();
    expect(screen.getByText(/^Lore$/i).closest('[aria-disabled="true"]')).not.toBeNull();
  });

  // "Pack selected, world unselected" state is unreachable through ConnectScreen
  // interaction — handleSelectWorld always sets both genreSlug and worldSlug
  // simultaneously. That branch is tested in ReferenceLinks.disabled.test.tsx.

  it("shows both Rules and Lore enabled once a world is selected", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

    const rules = screen.getByRole("link", { name: /rules/i });
    const lore = screen.getByRole("link", { name: /lore/i });
    expect(rules).toHaveAttribute("href", "/reference/rules/low_fantasy");
    expect(lore).toHaveAttribute("href", "/reference/lore/low_fantasy/greyhawk");
  });

  it("clicking a reference link does not dispatch a websocket message", async () => {
    // Pre-select a world so both links are enabled.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        playerName: "Rincewind",
        genre: "low_fantasy",
        world: "greyhawk",
      }),
    );

    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    const rules = screen.getByRole("link", { name: /rules/i });
    expect(rules).toBeInTheDocument();

    // ConnectScreen does not hold a WebSocket connection — it uses fetch
    // only. Verify that fetch is NOT called with a WebSocket-style endpoint
    // (no /ws path) when the user interacts with the reference link. The
    // link itself opens a new tab (target="_blank"); in jsdom that is a
    // no-op, but we can assert no new fetch calls were made.
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;

    await user.click(rules);

    // No additional fetch calls were triggered by clicking the link.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});
