import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ConnectScreen } from "@/screens/ConnectScreen";
import type { GenresResponse } from "@/types/genres";

const STORAGE_KEY = "sidequest-connect";

/**
 * Shared fixture matching the enriched `/api/genres` shape.
 *
 * Two genres: `low_fantasy` (two worlds) and `road_warrior` (one world,
 * to exercise the auto-select-single-world path). Both worlds carry the
 * full WorldMeta fields so the preview renders without null checks.
 *
 * Story 83-1 (Standing Folio): the flat all-worlds-visible radiogroup was
 * replaced by a single-open genre ACCORDION. By contract the genre holding
 * the current selection is open by default; with no selection the FIRST
 * genre in render order (alphabetical by label) is open. With this fixture
 * "Low Fantasy" sorts before "Road Warrior", so `low_fantasy` is open on a
 * fresh mount and `greyhawk` / `forgotten_realms` are immediately reachable,
 * while `wasteland` (road_warrior) requires expanding its genre first.
 */
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

/**
 * Accordion helper: ensure the genre header for `label` is expanded.
 * The genre header is a button whose accessible name contains the genre
 * label (chevron + world-count are aria-hidden / trailing). Idempotent —
 * a no-op if the genre is already open.
 */
async function expandGenre(
  user: ReturnType<typeof userEvent.setup>,
  label: string | RegExp,
) {
  const matcher = typeof label === "string" ? new RegExp(label, "i") : label;
  const header = screen.getByRole("button", { name: matcher });
  if (header.getAttribute("aria-expanded") !== "true") {
    await user.click(header);
  }
  return header;
}

/** Expand the world's genre (if needed) then click the world radio. */
async function selectWorld(
  user: ReturnType<typeof userEvent.setup>,
  genreLabel: string | RegExp,
  worldName: string | RegExp,
) {
  await expandGenre(user, genreLabel);
  const worldMatcher =
    typeof worldName === "string" ? new RegExp(worldName, "i") : worldName;
  const radio = screen.getByRole("radio", { name: worldMatcher });
  await user.click(radio);
  return radio;
}

describe("ConnectScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    // ConnectScreen uses `useSessions` which polls /api/sessions on mount,
    // and `useStartGame` which POSTs /api/games on Start. In jsdom stub both
    // with a minimal successful response.
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

  // -- masthead --------------------------------------------------------------
  it("renders a player name input", () => {
    renderConnect({ genres: GENRES });
    expect(screen.getByLabelText(/what name shall be yours/i)).toBeInTheDocument();
  });

  // -- accordion structure (replaces the flat all-worlds radiogroup) --------
  it("renders a genre accordion: each genre is an expandable header button", () => {
    renderConnect({ genres: GENRES });
    const lowFantasy = screen.getByRole("button", { name: /low fantasy/i });
    const roadWarrior = screen.getByRole("button", { name: /road warrior/i });
    expect(lowFantasy).toHaveAttribute("aria-expanded");
    expect(roadWarrior).toHaveAttribute("aria-expanded");
    // The old single flat "World" radiogroup spanning every genre is gone.
    expect(screen.queryByRole("radiogroup", { name: /^world$/i })).toBeNull();
  });

  it("hides a genre's worlds until its header is expanded", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    // road_warrior is NOT the default-open genre, so its world is hidden.
    expect(screen.queryByRole("radio", { name: /wasteland/i })).toBeNull();

    await expandGenre(user, "Road Warrior");
    expect(screen.getByRole("radio", { name: /wasteland/i })).toBeInTheDocument();
  });

  it("opens the first genre by default so its worlds are immediately reachable", () => {
    renderConnect({ genres: GENRES });
    // low_fantasy sorts first → open on mount → its worlds present.
    expect(screen.getByRole("radio", { name: /greyhawk/i })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /forgotten realms/i }),
    ).toBeInTheDocument();
  });

  it("is single-open: expanding a second genre collapses the first", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    const lowFantasy = screen.getByRole("button", { name: /low fantasy/i });
    expect(lowFantasy).toHaveAttribute("aria-expanded", "true");

    await expandGenre(user, "Road Warrior");

    // Opening Road Warrior collapses Low Fantasy.
    expect(
      screen.getByRole("button", { name: /low fantasy/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: /road warrior/i }),
    ).toHaveAttribute("aria-expanded", "true");
    // And Low Fantasy's worlds are no longer in the tree.
    expect(screen.queryByRole("radio", { name: /greyhawk/i })).toBeNull();
  });

  it("worlds in an expanded genre are radios inside a per-genre radiogroup", () => {
    renderConnect({ genres: GENRES });
    const group = screen.getByRole("radiogroup", { name: /low fantasy worlds/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /greyhawk/i })).toBeInTheDocument();
  });

  // -- preview ---------------------------------------------------------------
  it("renders the empty-state preview when no world is selected", () => {
    renderConnect({ genres: GENRES });
    expect(
      screen.getByText(/choose a world to see what awaits/i),
    ).toBeInTheDocument();
  });

  it("renders the world preview description after a world is picked", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    await selectWorld(user, "Low Fantasy", "Greyhawk");

    expect(
      screen.getByText(/the flanaess, a continent of warring kingdoms/i),
    ).toBeInTheDocument();
  });

  it("marks the chosen world radio aria-checked and leaves siblings unchecked", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    await selectWorld(user, "Low Fantasy", "Greyhawk");

    expect(screen.getByRole("radio", { name: /greyhawk/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radio", { name: /forgotten realms/i }),
    ).toHaveAttribute("aria-checked", "false");
  });

  // -- validation ------------------------------------------------------------
  it("disables submit when no world is chosen", () => {
    renderConnect({ genres: GENRES });
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
  });

  it("auto-selects the sole world when the catalog has exactly one world", () => {
    const SINGLE: GenresResponse = {
      road_warrior: {
        ...GENRES.road_warrior,
      },
    };
    renderConnect({ genres: SINGLE });

    // The only genre is open by default and its sole world is auto-checked.
    const wastelandRadio = screen.getByRole("radio", { name: /wasteland/i });
    expect(wastelandRadio).toHaveAttribute("aria-checked", "true");
  });

  // -- loading state ---------------------------------------------------------
  it("shows a connecting indicator during connection", () => {
    renderConnect({ genres: GENRES, isConnecting: true });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // -- error state -----------------------------------------------------------
  it("shows an error message on connection failure", () => {
    renderConnect({
      genres: GENRES,
      error: "Connection refused",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/connection refused/i);
  });

  it("shows a retry button when genres failed to load", async () => {
    const user = userEvent.setup();
    const onRetryGenres = vi.fn();
    renderConnect({
      genres: {},
      genreError: true,
      onRetryGenres,
    });

    const retry = screen.getByRole("button", { name: /retry/i });
    await user.click(retry);
    expect(onRetryGenres).toHaveBeenCalled();
  });

  // -- localStorage persistence -----------------------------------------------
  describe("localStorage persistence", () => {
    it("pre-fills player name from localStorage on mount", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ playerName: "Rincewind", genre: "", world: "" }),
      );

      renderConnect({ genres: GENRES });
      expect(
        screen.getByLabelText(/what name shall be yours/i),
      ).toHaveValue("Rincewind");
    });

    it("pre-selects the saved (genre, world) — its genre is open and the row is checked", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          playerName: "Rincewind",
          genre: "low_fantasy",
          world: "greyhawk",
        }),
      );

      renderConnect({ genres: GENRES });

      // The saved world's genre is open by default and only the matching
      // row reads as checked.
      const greyhawkRadio = screen.getByRole("radio", { name: /greyhawk/i });
      expect(greyhawkRadio).toHaveAttribute("aria-checked", "true");
      const forgottenRealms = screen.getByRole("radio", {
        name: /forgotten realms/i,
      });
      expect(forgottenRealms).toHaveAttribute("aria-checked", "false");
    });

    it("renders with empty fields when localStorage is empty", () => {
      renderConnect({ genres: GENRES });
      expect(
        screen.getByLabelText(/what name shall be yours/i),
      ).toHaveValue("");
    });

    it("fields remain editable after pre-fill", async () => {
      const user = userEvent.setup();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ playerName: "Rincewind", genre: "", world: "" }),
      );

      renderConnect({ genres: GENRES });

      const nameInput = screen.getByLabelText(/what name shall be yours/i);
      expect(nameInput).toHaveValue("Rincewind");

      await user.clear(nameInput);
      await user.type(nameInput, "Twoflower");
      expect(nameInput).toHaveValue("Twoflower");
    });

    it("saves to localStorage on submit", async () => {
      const user = userEvent.setup();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          playerName: "Rincewind",
          genre: "low_fantasy",
          world: "greyhawk",
        }),
      );

      renderConnect({ genres: GENRES });

      await user.click(screen.getByRole("button", { name: /start/i }));

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored).toEqual({
        playerName: "Rincewind",
        genre: "low_fantasy",
        world: "greyhawk",
      });
    });

    it("handles corrupted localStorage gracefully", () => {
      localStorage.setItem(STORAGE_KEY, "not-valid-json{{{");
      renderConnect({ genres: GENRES });
      expect(
        screen.getByLabelText(/what name shall be yours/i),
      ).toHaveValue("");
    });
  });

  // -- in-flight spinner + double-click guard ---------------------------------
  describe("isStarting guard", () => {
    function setupDeferredStart() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          playerName: "Rincewind",
          genre: "low_fantasy",
          world: "greyhawk",
        }),
      );

      let resolveStart!: (r: Response) => void;
      const deferred = new Promise<Response>((resolve) => {
        resolveStart = resolve;
      });

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/sessions")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
        }
        if (typeof url === "string" && url === "/api/games" && opts?.method === "POST") {
          return deferred;
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }) as unknown as typeof fetch;

      return { resolveStart };
    }

    it("disables Start button while POST /api/games is in flight", async () => {
      const user = userEvent.setup();
      const { resolveStart } = setupDeferredStart();

      renderConnect({ genres: GENRES });

      const btn = screen.getByRole("button", { name: /start/i });
      await user.click(btn);

      expect(screen.getByRole("button", { name: /starting\.\.\./i })).toBeDisabled();

      resolveStart(
        new Response(JSON.stringify({ slug: "test-slug", mode: "solo" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );

      await screen.findByRole("button", { name: /start/i }).then(
        () => {},
        () => {},
      );
    });

    it("ignores repeated Start clicks while in flight", async () => {
      const user = userEvent.setup();
      const { resolveStart } = setupDeferredStart();

      renderConnect({ genres: GENRES });

      const btn = screen.getByRole("button", { name: /start/i });

      await user.click(btn);
      await user.click(btn);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const gameCalls = fetchMock.mock.calls.filter((call) => {
        const url = call[0] as string;
        const opts = call[1] as RequestInit | undefined;
        return url === "/api/games" && opts?.method === "POST";
      });
      expect(gameCalls).toHaveLength(1);

      resolveStart(
        new Response(JSON.stringify({ slug: "test-slug", mode: "solo" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    });
  });

  // -- combined error display --------------------------------------------------
  describe("combined error display", () => {
    it("shows both external error and startError together", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/sessions")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
        }
        if (typeof url === "string" && url === "/api/games" && opts?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }) as unknown as typeof fetch;

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          playerName: "Rincewind",
          genre: "low_fantasy",
          world: "greyhawk",
        }),
      );

      const user = userEvent.setup();
      renderConnect({ genres: GENRES, error: "Lost connection" });

      await user.click(screen.getByRole("button", { name: /start/i }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Lost connection");
      expect(alert.textContent).toContain("start game failed");
      expect(alert.textContent).toContain(" — ");
    });
  });

  // -- start() failure path ---------------------------------------------------
  describe("start() failure handling", () => {
    it("shows an error and does not write localStorage when start() fails", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/sessions")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
        }
        if (typeof url === "string" && url === "/api/games" && opts?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }) as unknown as typeof fetch;

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

      await user.click(screen.getByRole("button", { name: /start/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toMatch(/start game failed/i);

      expect(localStorage.getItem("sidequest-history")).toBeNull();
      expect(localStorage.getItem("sq:display-name")).toBeNull();
    });
  });

  // -- Past Journeys → resume (playtest 2026-04-24/25 BLOCKING bugs) ----------
  describe("Past Journeys resume", () => {
    it("Begin records game_slug + mode in journey history", async () => {
      const user = userEvent.setup();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          playerName: "Rincewind",
          genre: "low_fantasy",
          world: "greyhawk",
        }),
      );

      renderConnect({ genres: GENRES });
      await user.click(screen.getByRole("button", { name: /start/i }));

      const stored = JSON.parse(localStorage.getItem("sidequest-history") ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        player_name: "Rincewind",
        genre: "low_fantasy",
        world: "greyhawk",
        game_slug: "test-slug",
        mode: "solo",
      });
    });

    function LocationWatcher({ onChange }: { onChange: (path: string) => void }) {
      const location = useLocation();
      useEffect(() => {
        onChange(location.pathname);
      }, [location.pathname, onChange]);
      return null;
    }

    it("clicking a Past Journeys row with a slug navigates straight to the slug route", async () => {
      const user = userEvent.setup();

      localStorage.setItem(
        "sidequest-history",
        JSON.stringify([
          {
            player_name: "Rincewind",
            genre: "low_fantasy",
            world: "greyhawk",
            last_played_iso: new Date().toISOString(),
            game_slug: "2026-04-23-resume-me",
            mode: "solo",
          },
        ]),
      );

      const onPathChange = vi.fn();
      render(
        <MemoryRouter initialEntries={["/"]}>
          <ConnectScreen genres={GENRES} />
          <LocationWatcher onChange={onPathChange} />
        </MemoryRouter>,
      );

      const row = screen.getByText(/Rincewind/).closest("button");
      expect(row).not.toBeNull();
      await user.click(row!);

      expect(onPathChange).toHaveBeenCalledWith("/solo/2026-04-23-resume-me");
    });

    it("typed name not matching any past journey for (genre, world, mode) starts a new session, not the past one", async () => {
      const user = userEvent.setup();

      const PAST_SLUG = "2026-04-25-greyhawk-mp";
      localStorage.setItem(
        "sidequest-history",
        JSON.stringify([
          {
            player_name: "Laverne",
            genre: "low_fantasy",
            world: "greyhawk",
            last_played_iso: new Date().toISOString(),
            game_slug: PAST_SLUG,
            mode: "multiplayer",
          },
        ]),
      );

      const NEW_SLUG = "2026-04-25-greyhawk-mp-2";
      let capturedBody: Record<string, unknown> | null = null;
      globalThis.fetch = vi
        .fn()
        .mockImplementation((url: string, opts?: RequestInit) => {
          if (typeof url === "string" && url.startsWith("/api/sessions")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ sessions: [] }),
            });
          }
          if (
            typeof url === "string" &&
            url === "/api/games" &&
            opts?.method === "POST"
          ) {
            capturedBody = JSON.parse(opts.body as string);
            return Promise.resolve({
              ok: true,
              status: 201,
              json: () =>
                Promise.resolve({
                  slug: NEW_SLUG,
                  mode: "multiplayer",
                  genre_slug: "low_fantasy",
                  world_slug: "greyhawk",
                  resumed: false,
                }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }) as unknown as typeof fetch;

      const onPathChange = vi.fn();
      render(
        <MemoryRouter initialEntries={["/"]}>
          <ConnectScreen genres={GENRES} />
          <LocationWatcher onChange={onPathChange} />
        </MemoryRouter>,
      );

      const nameInput = screen.getByLabelText(/what name shall be yours/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Lenny");

      // Pick the same world the past journey is bound to (low_fantasy is the
      // default-open genre, so greyhawk is reachable directly).
      await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

      await user.click(screen.getByRole("radio", { name: /multiplayer/i }));

      await user.click(screen.getByRole("button", { name: /start/i }));

      expect(capturedBody).not.toBeNull();
      expect(capturedBody).toMatchObject({
        genre_slug: "low_fantasy",
        world_slug: "greyhawk",
        mode: "multiplayer",
        player_name: "Lenny",
        force_new: true,
      });

      const slugCalls = onPathChange.mock.calls.filter((call) =>
        /^\/(solo|play)\//.test(call[0] as string),
      );
      expect(slugCalls.length).toBeGreaterThan(0);
      const lastSlugPath = slugCalls[slugCalls.length - 1][0];
      expect(lastSlugPath).toBe(`/play/${NEW_SLUG}`);
      expect(lastSlugPath).not.toBe(`/play/${PAST_SLUG}`);
    });

    it("typed name matching a past journey for (genre, world, mode) resumes without POST", async () => {
      const user = userEvent.setup();

      const PAST_SLUG = "2026-04-25-greyhawk-resume";
      localStorage.setItem(
        "sidequest-history",
        JSON.stringify([
          {
            player_name: "Laverne",
            genre: "low_fantasy",
            world: "greyhawk",
            last_played_iso: new Date().toISOString(),
            game_slug: PAST_SLUG,
            mode: "multiplayer",
          },
        ]),
      );

      const postSpy = vi.fn();
      globalThis.fetch = vi
        .fn()
        .mockImplementation((url: string, opts?: RequestInit) => {
          if (typeof url === "string" && url.startsWith("/api/sessions")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ sessions: [] }),
            });
          }
          if (
            typeof url === "string" &&
            url === "/api/games" &&
            opts?.method === "POST"
          ) {
            postSpy();
            return Promise.resolve({
              ok: true,
              status: 201,
              json: () =>
                Promise.resolve({
                  slug: "should-not-be-used",
                  mode: "multiplayer",
                  genre_slug: "low_fantasy",
                  world_slug: "greyhawk",
                  resumed: false,
                }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }) as unknown as typeof fetch;

      const onPathChange = vi.fn();
      render(
        <MemoryRouter initialEntries={["/"]}>
          <ConnectScreen genres={GENRES} />
          <LocationWatcher onChange={onPathChange} />
        </MemoryRouter>,
      );

      const nameInput = screen.getByLabelText(/what name shall be yours/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Laverne");
      await user.click(screen.getByRole("radio", { name: /greyhawk/i }));
      await user.click(screen.getByRole("radio", { name: /multiplayer/i }));

      await user.click(screen.getByRole("button", { name: /start/i }));

      expect(postSpy).not.toHaveBeenCalled();
      const slugCalls = onPathChange.mock.calls.filter((call) =>
        /^\/(solo|play)\//.test(call[0] as string),
      );
      expect(slugCalls.length).toBeGreaterThan(0);
      expect(slugCalls[slugCalls.length - 1][0]).toBe(`/play/${PAST_SLUG}`);
    });

    it("clicking a legacy Past Journeys row (no slug) falls back to prefill (no slug navigate)", async () => {
      const user = userEvent.setup();

      localStorage.setItem(
        "sidequest-history",
        JSON.stringify([
          {
            player_name: "OldEntry",
            genre: "low_fantasy",
            world: "greyhawk",
            last_played_iso: new Date().toISOString(),
          },
        ]),
      );

      const onPathChange = vi.fn();
      render(
        <MemoryRouter initialEntries={["/"]}>
          <ConnectScreen genres={GENRES} />
          <LocationWatcher onChange={onPathChange} />
        </MemoryRouter>,
      );

      const row = screen.getByText(/OldEntry/).closest("button");
      await user.click(row!);

      expect(screen.getByLabelText(/what name shall be yours/i)).toHaveValue(
        "OldEntry",
      );
      const slugCalls = onPathChange.mock.calls.filter((call) =>
        /^\/(solo|play)\//.test(call[0] as string),
      );
      expect(slugCalls).toHaveLength(0);
    });
  });

  // -- MP join affordance (playtest 2026-04-26 S4-UX) -----------------------
  describe("Start button copy", () => {
    it("renders the solo Start label in solo mode", async () => {
      const user = userEvent.setup();
      renderConnect({ genres: GENRES });

      // Default mode is solo; pick a world so the button is enabled. Wasteland
      // lives in road_warrior which must be expanded first.
      await selectWorld(user, "Road Warrior", "Wasteland");

      const btn = screen.getByTestId("lobby-start-button");
      expect(btn).toHaveTextContent(/^start adventure$/i);
    });

    it("renders a Start-or-Join label in multiplayer mode", async () => {
      const user = userEvent.setup();
      renderConnect({ genres: GENRES });

      await user.click(screen.getByRole("radio", { name: /greyhawk/i }));
      await user.click(screen.getByRole("radio", { name: /multiplayer/i }));

      const btn = screen.getByTestId("lobby-start-button");
      expect(btn).toHaveTextContent(/join/i);
    });

    it("toggles button copy when switching mode after world is picked", async () => {
      const user = userEvent.setup();
      renderConnect({ genres: GENRES });

      await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

      const btn = screen.getByTestId("lobby-start-button");
      expect(btn).toHaveTextContent(/^start adventure$/i);

      await user.click(screen.getByRole("radio", { name: /multiplayer/i }));
      expect(btn).toHaveTextContent(/join/i);

      await user.click(screen.getByRole("radio", { name: /solo/i }));
      expect(btn).toHaveTextContent(/^start adventure$/i);
    });
  });
});
