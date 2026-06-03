/**
 * ConnectScreen reference surface integration tests.
 *
 * After the lobby redesign (story 80-1) the two reference links no longer sit
 * in one orphaned block: **Rules** (pack-scoped) lives on each genre header in
 * the grouped world picker, and **Lore** (world-scoped) lives in the
 * WorldPreview card header. The standalone `ReferenceLinks` block is gone from
 * the lobby (the component itself is retained for the in-game NarrativeWidget).
 * These tests verify the relocated links are wired into ConnectScreen.
 *
 * The harness mirrors ConnectScreen.test.tsx exactly — same GENRES fixture,
 * same fetch mock, same MemoryRouter wrapper.
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

  it("renders a pack-scoped Rules link on each genre header (no world selection needed)", () => {
    renderConnect({ genres: GENRES });

    // Rules is pack-scoped — present on every genre header regardless of
    // whether a world is selected yet.
    const rules = screen.getAllByRole("link", { name: /rules$/i });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toHaveAttribute("href", expect.stringMatching(/^\/reference\/rules\//));

    // The orphaned standalone link block is gone.
    expect(screen.queryByTestId("reference-links")).toBeNull();

    // Lore is world-scoped — absent until a world is picked (empty-state card).
    expect(screen.queryByRole("link", { name: /lore$/i })).toBeNull();
  });

  it("Rules sits on the matching genre header with the pack href", () => {
    renderConnect({ genres: GENRES });
    const lowFantasyRules = screen.getByRole("link", { name: "Low Fantasy rules" });
    expect(lowFantasyRules).toHaveAttribute("href", "/reference/rules/low_fantasy");
    const roadWarriorRules = screen.getByRole("link", { name: "Road Warrior rules" });
    expect(roadWarriorRules).toHaveAttribute("href", "/reference/rules/road_warrior");
  });

  it("surfaces the world-scoped Lore link in the preview card once a world is selected", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

    // Rules still on the header (pack-scoped); Lore now appears in the card.
    expect(screen.getByRole("link", { name: "Low Fantasy rules" })).toHaveAttribute(
      "href",
      "/reference/rules/low_fantasy",
    );
    const lore = screen.getByRole("link", { name: "Greyhawk lore" });
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

    // Grouped picker renders one Rules link per genre header, so target a
    // specific one rather than a fuzzy /rules/i match (which now multi-matches).
    const rules = screen.getByRole("link", { name: "Low Fantasy rules" });
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
