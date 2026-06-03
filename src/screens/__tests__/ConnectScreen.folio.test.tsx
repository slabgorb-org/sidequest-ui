/**
 * Standing Folio structural tests (story 83-1).
 *
 * Covers the new-structure acceptance criteria that the redesign introduces
 * on top of the preserved behavior in ConnectScreen.test.tsx:
 *   - AC1 masthead "opening ritual" (wordmark + tagline + name ritual)
 *   - AC2 eyebrow world/genre count derived from real data
 *   - AC4 cinematic preview populated from real WorldMeta, with graceful
 *         fallbacks when optional fields are absent
 *   - AC6 below-the-fold scene library wired to /dev/scenes
 *   - AC7 subtle per-genre accent shift via [data-genre]
 *
 * Contract test-hooks the implementation must expose (kept minimal and
 * documented in the TEA assessment):
 *   - data-testid="lobby-folio"      — the two-pane folio card root
 *   - data-testid="lobby-world-count"— the index eyebrow (holds N + M genres)
 *   - data-testid="lobby-hero"       — the cinematic hero region (placeholder
 *                                       art; carries the selected world's
 *                                       genre label placard)
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ConnectScreen } from "@/screens/ConnectScreen";
import type { GenresResponse } from "@/types/genres";

/**
 * Two genres. `tea_and_murder/avely` carries the full optional surface (era,
 * setting, inspirations, tone axes) so the preview renders every section;
 * `tea_and_murder/bare` is intentionally sparse (all optional fields empty)
 * to exercise the graceful-fallback path.
 */
const GENRES: GenresResponse = {
  tea_and_murder: {
    name: "Tea & Murder",
    description: "Cosy mysteries with a body in the rose garden.",
    worlds: [
      {
        slug: "avely",
        name: "Avely",
        description: "A country weekend, a guest list of suspects, and a corpse.",
        era: "Edwardian England · c. 1908",
        setting: "A country house",
        inspirations: ["Agatha Christie", "Knives Out"],
        axis_snapshot: { cosy: 0.9, gore: 0.1 },
        hero_image: null,
        navigation_mode: null,
      },
      {
        slug: "bare",
        name: "Bare Hollow",
        description: "A plain village with nothing else declared.",
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

function mockFetch(scenes: unknown[] = []) {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.startsWith("/api/sessions")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
    }
    if (typeof url === "string" && url === "/dev/scenes") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(scenes) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

describe("Standing Folio — masthead ritual (AC1)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch();
  });

  it("renders the SideQuest wordmark and a tagline", () => {
    renderConnect({ genres: GENRES });
    expect(
      screen.getByRole("heading", { name: /sidequest/i }),
    ).toBeInTheDocument();
    // The name ritual prompt is the opening question.
    expect(
      screen.getByLabelText(/what name shall be yours/i),
    ).toBeInTheDocument();
  });

  it("keeps the Player name accessible label so App-level wiring still resolves it", () => {
    renderConnect({ genres: GENRES });
    // App.test.tsx asserts ConnectScreen via getByLabelText(/player name/i);
    // the redesigned input must preserve that accessible name.
    expect(screen.getByLabelText(/player name/i)).toBeInTheDocument();
  });
});

describe("Standing Folio — index eyebrow count (AC2)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch();
  });

  it("shows the world and genre counts derived from the real catalogue", () => {
    renderConnect({ genres: GENRES });
    // 3 worlds (avely, bare, wasteland) across 2 genres.
    const eyebrow = screen.getByTestId("lobby-world-count");
    expect(eyebrow).toHaveTextContent(/3/);
    expect(eyebrow).toHaveTextContent(/2 genres/i);
  });
});

describe("Standing Folio — cinematic preview (AC4)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch();
  });

  it("populates the preview from real WorldMeta on selection", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    // tea_and_murder is the default-open genre (sorts before road_warrior).
    await user.click(screen.getByRole("radio", { name: /avely/i }));

    // Title, era, blurb, tone chip, inspirations all render from real data.
    expect(screen.getByRole("heading", { name: /^avely$/i })).toBeInTheDocument();
    expect(screen.getByText(/edwardian england/i)).toBeInTheDocument();
    expect(
      screen.getByText(/a guest list of suspects/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/high cosy/i)).toBeInTheDocument();
    expect(screen.getByText(/agatha christie/i)).toBeInTheDocument();
  });

  it("shows a hero placeholder region carrying the selected genre's label", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    await user.click(screen.getByRole("radio", { name: /avely/i }));

    // Hero is a placeholder (no hero_image), but the region must exist and
    // surface the genre label as its placard.
    const hero = screen.getByTestId("lobby-hero");
    expect(within(hero).getByText(/tea & murder/i)).toBeInTheDocument();
  });

  it("degrades gracefully when optional WorldMeta fields are absent", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    // "Bare Hollow" has no era, no inspirations, no tone axes.
    await user.click(screen.getByRole("radio", { name: /bare hollow/i }));

    // Title + blurb still render…
    expect(
      screen.getByRole("heading", { name: /bare hollow/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/a plain village with nothing else declared/i),
    ).toBeInTheDocument();
    // …and the optional sections are omitted, not faked.
    expect(screen.queryByText(/inspired by/i)).toBeNull();
    expect(screen.queryByText(/edwardian england/i)).toBeNull();
  });
});

describe("Standing Folio — per-genre accent shift (AC7)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch();
  });

  it("sets the [data-genre] accent hook to the selected world's genre", async () => {
    const user = userEvent.setup();
    const { container } = renderConnect({ genres: GENRES });

    // No selection yet → no tea_and_murder accent scope committed by a pick.
    await user.click(screen.getByRole("radio", { name: /avely/i }));
    expect(
      container.querySelector('[data-genre="tea_and_murder"]'),
    ).not.toBeNull();

    // Switching to a road_warrior world retargets the accent.
    await user.click(screen.getByRole("button", { name: /road warrior/i }));
    await user.click(screen.getByRole("radio", { name: /wasteland/i }));
    expect(
      container.querySelector('[data-genre="road_warrior"]'),
    ).not.toBeNull();
  });
});

describe("Standing Folio — below-the-fold scene library (AC6)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders dev scene fixtures fetched from /dev/scenes", async () => {
    mockFetch([
      {
        name: "rose-garden-body",
        genre: "tea_and_murder",
        world: "avely",
        description: "Open on the corpse among the roses.",
      },
    ]);

    renderConnect({ genres: GENRES });

    expect(
      await screen.findByText(/rose-garden-body/i),
    ).toBeInTheDocument();
  });

  it("renders no scene buttons when the dev endpoint yields none", async () => {
    mockFetch([]);
    renderConnect({ genres: GENRES });

    // Give the /dev/scenes effect a tick to settle, then assert nothing
    // fabricated a fixture row.
    await screen.findByRole("heading", { name: /sidequest/i });
    expect(screen.queryByText(/rose-garden-body/i)).toBeNull();
  });
});
