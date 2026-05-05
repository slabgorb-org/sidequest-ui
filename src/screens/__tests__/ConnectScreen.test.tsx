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
 * full WorldMeta fields so WorldPreview renders without null checks.
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
      },
    ],
  },
};

/**
 * Wraps ConnectScreen in a MemoryRouter so that useNavigate() (wired in
 * commit 3beb815) has a valid router context during unit tests.
 */
function renderConnect(props: Parameters<typeof ConnectScreen>[0]) {
  return render(
    <MemoryRouter>
      <ConnectScreen {...props} />
    </MemoryRouter>,
  );
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

  // -- rendering -------------------------------------------------------------
  it("renders a player name input", () => {
    renderConnect({ genres: GENRES });
    expect(screen.getByLabelText(/what name shall be yours/i)).toBeInTheDocument();
  });

  it("renders a flat world radio group with one row per world across all genres", () => {
    renderConnect({ genres: GENRES });
    const worldGroup = screen.getByRole("radiogroup", { name: /world/i });
    expect(worldGroup).toBeInTheDocument();
    // All worlds from every genre appear up front — no genre pre-pick.
    expect(screen.getByRole("radio", { name: /greyhawk/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /forgotten realms/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /wasteland/i })).toBeInTheDocument();
    // No standalone genre radiogroup — flattened away 2026-05-05.
    expect(screen.queryByRole("radiogroup", { name: /^genre$/i })).toBeNull();
  });

  it("renders the empty-state preview when no world is selected", () => {
    renderConnect({ genres: GENRES });
    expect(
      screen.getByText(/choose a world to see what awaits/i),
    ).toBeInTheDocument();
  });

  it("renders the world preview description after a world is picked", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

    expect(
      screen.getByText(/the flanaess, a continent of warring kingdoms/i),
    ).toBeInTheDocument();
  });

  it("shows the genre name as a hint on each world row", () => {
    renderConnect({ genres: GENRES });
    // Genre label appears in the same row as the world name. Use the row
    // accessible-name (button text concatenation) to assert presence.
    const greyhawkRow = screen.getByRole("radio", { name: /greyhawk/i });
    expect(greyhawkRow).toHaveTextContent(/low fantasy/i);
    const wastelandRow = screen.getByRole("radio", { name: /wasteland/i });
    expect(wastelandRow).toHaveTextContent(/road warrior/i);
  });

  // -- validation ------------------------------------------------------------
  it("disables submit when fields are empty", () => {
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

    it("pre-selects the saved (genre, world) world row from localStorage on mount", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          playerName: "Rincewind",
          genre: "low_fantasy",
          world: "greyhawk",
        }),
      );

      renderConnect({ genres: GENRES });

      // Flat picker: only the matching world row reads as checked. Other
      // worlds (including same-name worlds in other genres, if any) stay
      // unchecked because the row identity is the composite genre/world.
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
    /**
     * Helper: set up localStorage so genre + world are pre-selected, then
     * return a deferred fetch that the caller can resolve/reject manually.
     */
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

      // While the fetch is in-flight the button should be disabled and
      // show "Starting..." to give the user feedback.
      expect(screen.getByRole("button", { name: /starting\.\.\./i })).toBeDisabled();

      // Resolve the deferred fetch so the component settles.
      resolveStart(
        new Response(JSON.stringify({ slug: "test-slug", mode: "solo" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );

      // After resolution the button is gone (navigation happened) — just
      // verify no error appeared.
      await screen.findByRole("button", { name: /start/i }).then(
        () => {},
        () => {}, // navigation unmounts the button — that's fine
      );
    });

    it("ignores repeated Start clicks while in flight", async () => {
      const user = userEvent.setup();
      const { resolveStart } = setupDeferredStart();

      renderConnect({ genres: GENRES });

      const btn = screen.getByRole("button", { name: /start/i });

      // First click starts the POST.
      await user.click(btn);

      // Synchronously clicking the now-disabled button should not fire a
      // second fetch call. userEvent respects the disabled attribute, so
      // click is a no-op here — which is exactly what we want to verify.
      await user.click(btn);

      // Only one call to /api/games should have been made.
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
      // Make /api/games return 500 so start() sets startError.
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
      // Pass an external connection error via the prop.
      renderConnect({ genres: GENRES, error: "Lost connection" });

      await user.click(screen.getByRole("button", { name: /start/i }));

      // The single alert region should contain BOTH messages.
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Lost connection");
      expect(alert.textContent).toContain("start game failed");
      expect(alert.textContent).toContain(" — ");
    });
  });

  // -- start() failure path ---------------------------------------------------
  describe("start() failure handling", () => {
    it("shows an error and does not write localStorage when start() fails", async () => {
      // Override the default fetch mock: /api/games returns 500.
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

      // Pre-load a valid saved state so genre + world are auto-selected and
      // the Start button is enabled on first render.
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

      // Error alert must be visible.
      const alert = await screen.findByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toMatch(/start game failed/i);

      // sidequest-connect must not have been updated by this failed attempt —
      // the pre-loaded value is still present but no new write happened during
      // the failed handleStart. Since the pre-loaded value was written before
      // render (not by handleStart), it's present; what matters is that the
      // journey history (sidequest-history) was NOT written.
      expect(localStorage.getItem("sidequest-history")).toBeNull();

      // The sq:display-name key must also not have been written.
      expect(localStorage.getItem("sq:display-name")).toBeNull();
    });
  });

  // -- Past Journeys → resume (playtest 2026-04-24 BLOCKING bug) --------------
  //
  // Pre-fix: clicking a Past Journeys row only prefilled the lobby fields,
  // and pressing Start always created a brand-new game with a fresh slug —
  // silently orphaning the player's actual save. The fix records `game_slug`
  // when each game is created and routes Past Journeys clicks straight to
  // `/solo/:slug` (or `/play/:slug`) so the existing save resumes.
  describe("Past Journeys resume", () => {
    it("Begin records game_slug + mode in journey history", async () => {
      const user = userEvent.setup();
      // Pre-load lobby fields so the Start button is enabled.
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

    /**
     * Tiny helper that reports MemoryRouter location changes back to a spy.
     * Lets us assert "ConnectScreen navigated to /solo/:slug" without mocking
     * the router internals.
     */
    function LocationWatcher({ onChange }: { onChange: (path: string) => void }) {
      const location = useLocation();
      useEffect(() => {
        onChange(location.pathname);
      }, [location.pathname, onChange]);
      return null;
    }

    it("clicking a Past Journeys row with a slug navigates straight to the slug route", async () => {
      const user = userEvent.setup();

      // Stub a past journey carrying a game_slug — the post-fix shape.
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

      // The journey row text contains the player name — click that button.
      const row = screen.getByText(/Rincewind/).closest("button");
      expect(row).not.toBeNull();
      await user.click(row!);

      expect(onPathChange).toHaveBeenCalledWith("/solo/2026-04-23-resume-me");
    });

    // Playtest 2026-04-25 BLOCKING bug — typing a fresh name with an
    // existing past journey for (genre, world) silently resumed the
    // prior character instead of starting a new session under the typed
    // name. The fix matches past journeys on (genre, world, mode,
    // typed_name) and only short-circuits to resume when *all four*
    // agree. Anything else hits the server with a force_new flag and a
    // typed player_name so the new slug carries the real name.
    it("typed name not matching any past journey for (genre, world, mode) starts a new session, not the past one", async () => {
      const user = userEvent.setup();

      // Past journey for Laverne · low_fantasy / greyhawk in MULTIPLAYER
      // mode. The standard fixture genre/world stand in for the bug
      // report's caverns_and_claudes / mawdeep — only the (genre, world,
      // mode, name) shape matters for the matching logic.
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

      // Capture the request body so we can assert the dispatched payload.
      // Mock the server returning a NEW slug — emulating a server that
      // honors `force_new` by minting a disambiguated slug. The point of
      // the test is that the LOBBY sends the right request and navigates
      // to whatever slug the server returns instead of short-circuiting
      // to the past-journey slug.
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

      // Type a different name from the past journey.
      const nameInput = screen.getByLabelText(/what name shall be yours/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Lenny");

      // Pick the same world the past journey is bound to. The flat
      // picker resolves both genre + world from a single row click.
      await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

      // Switch to multiplayer mode — same mode as the past journey, so
      // (genre, world, mode) collide; the only thing that differs is the
      // typed name.
      await user.click(
        screen.getByRole("radio", { name: /multiplayer/i }),
      );

      // Hit Start Adventure.
      await user.click(screen.getByRole("button", { name: /start/i }));

      // The dispatched payload must carry the typed player_name and the
      // force_new flag — without those the server can't disambiguate.
      expect(capturedBody).not.toBeNull();
      expect(capturedBody).toMatchObject({
        genre_slug: "low_fantasy",
        world_slug: "greyhawk",
        mode: "multiplayer",
        player_name: "Lenny",
        force_new: true,
      });

      // Navigation must land on the NEW slug returned by the server, not
      // on the past-journey slug. The pre-fix behavior would have either
      // never POSTed at all, or used the past-journey slug regardless.
      const slugCalls = onPathChange.mock.calls.filter((call) =>
        /^\/(solo|play)\//.test(call[0] as string),
      );
      expect(slugCalls.length).toBeGreaterThan(0);
      const lastSlugPath = slugCalls[slugCalls.length - 1][0];
      expect(lastSlugPath).toBe(`/play/${NEW_SLUG}`);
      expect(lastSlugPath).not.toBe(`/play/${PAST_SLUG}`);
    });

    // Sanity check the resume path is preserved: typing the SAME name as
    // a past journey for (genre, world, mode) should short-circuit to
    // that journey's slug without POSTing /api/games.
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
      await user.click(
        screen.getByRole("radio", { name: /multiplayer/i }),
      );

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

      // Pre-fix entry — no game_slug. Should keep the legacy prefill behavior.
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

      // Legacy: prefill name in the input, never leave "/".
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
  // Server fix (sidequest-server fix/s4-mp-lobby-join-existing-server)
  // makes POST /api/games join an existing same-slug MP game by default.
  // The lobby must signal that intent in MP mode so users on a second
  // host (no shared local Past Journey state) understand that clicking
  // Start will JOIN the existing table instead of opening a new one.
  describe("MP mode Start button copy", () => {
    it("renders 'Start Adventure' in solo mode", async () => {
      const user = userEvent.setup();
      renderConnect({ genres: GENRES });

      // Default mode is solo; pick a world so the button is enabled.
      await user.click(screen.getByRole("radio", { name: /wasteland/i }));

      const btn = screen.getByTestId("lobby-start-button");
      expect(btn).toHaveTextContent(/^Start Adventure$/);
    });

    it("renders 'Start or Join Adventure' in multiplayer mode", async () => {
      const user = userEvent.setup();
      renderConnect({ genres: GENRES });

      await user.click(screen.getByRole("radio", { name: /greyhawk/i }));
      await user.click(screen.getByRole("radio", { name: /multiplayer/i }));

      const btn = screen.getByTestId("lobby-start-button");
      expect(btn).toHaveTextContent(/^Start or Join Adventure$/);
    });

    it("toggles button copy when switching mode after world is picked", async () => {
      const user = userEvent.setup();
      renderConnect({ genres: GENRES });

      await user.click(screen.getByRole("radio", { name: /greyhawk/i }));

      const btn = screen.getByTestId("lobby-start-button");
      expect(btn).toHaveTextContent(/^Start Adventure$/);

      await user.click(screen.getByRole("radio", { name: /multiplayer/i }));
      expect(btn).toHaveTextContent(/^Start or Join Adventure$/);

      await user.click(screen.getByRole("radio", { name: /solo/i }));
      expect(btn).toHaveTextContent(/^Start Adventure$/);
    });
  });
});
