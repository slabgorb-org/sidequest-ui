/**
 * ConnectScreen reference surface integration tests.
 *
 * Story 83-1 (Standing Folio) relocates the reference links. In the prior
 * grouped-list lobby (story 80-1) **Rules** sat on every genre header
 * (pack-scoped, reachable without selecting a world). The Standing Folio
 * accordion has no room on a collapsed genre header, so Rules + Lore now
 * live in the preview / commit row, contextual to the SELECTED world:
 *   - **Rules** is pack-scoped → `/reference/rules/{genre}`
 *   - **Lore** is world-scoped → `/reference/lore/{genre}/{world}`
 * Both appear once a world is selected. Neither is a dead `href="#"` stub
 * (No Stubbing / No Silent Fallbacks).
 *
 * DEVIATION from story 80-1: Rules is no longer reachable before a world is
 * picked. Logged in the session file; flagged as a Delivery Finding for the
 * Reviewer to weigh against ADR-135 (reference pages as a public table tool).
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

  it("shows no world-scoped Lore link until a world is selected", () => {
    renderConnect({ genres: GENRES });
    // The orphaned standalone link block is gone.
    expect(screen.queryByTestId("reference-links")).toBeNull();
    // Lore is world-scoped — absent on the empty-state preview.
    expect(screen.queryByRole("link", { name: /lore$/i })).toBeNull();
  });

  it("surfaces pack-scoped Rules + world-scoped Lore once a world is selected", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    // low_fantasy is the default-open genre, so greyhawk is reachable directly.
    await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

    const rules = screen.getByRole("link", { name: /rules$/i });
    expect(rules).toHaveAttribute("href", "/reference/rules/low_fantasy");

    const lore = screen.getByRole("link", { name: /greyhawk lore/i });
    expect(lore).toHaveAttribute("href", "/reference/lore/low_fantasy/greyhawk");
  });

  it("retargets Rules + Lore to the newly-selected world's pack", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    // Switch to a world in a different genre.
    const roadWarrior = screen.getByRole("button", { name: /road warrior/i });
    await user.click(roadWarrior);
    await user.click(screen.getByRole("radio", { name: /wasteland/i }));

    expect(screen.getByRole("link", { name: /rules$/i })).toHaveAttribute(
      "href",
      "/reference/rules/road_warrior",
    );
    expect(screen.getByRole("link", { name: /wasteland lore/i })).toHaveAttribute(
      "href",
      "/reference/lore/road_warrior/wasteland",
    );
  });

  it("ships no dead href='#' reference link stubs", async () => {
    const user = userEvent.setup();
    const { container } = renderConnect({ genres: GENRES });

    await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

    // The design prototype used placeholder href="#" links; the real lobby
    // must wire real reference routes (No Stubbing / No Silent Fallbacks).
    expect(container.querySelectorAll('a[href="#"]')).toHaveLength(0);
  });

  it("clicking a reference link does not dispatch a fetch / websocket message", async () => {
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

    const rules = screen.getByRole("link", { name: /rules$/i });
    expect(rules).toBeInTheDocument();

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;

    await user.click(rules);

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});
