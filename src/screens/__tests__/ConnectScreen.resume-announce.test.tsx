// Silent-MP-resume masquerade (sq-playtest 2026-06-07): a same-day same-world
// "Start or Join" re-attached a NEW player name to the existing morning
// session with NO resume signal — clean lobby, chargen origin scene, looks
// 100% like a new game; server truth was a third PC walking into the parked
// mid-combat table. Slug-collision-as-resume is documented design
// (game_slug.py) — the gap is PRESENTATION + INTENT.
//
// Server half (PR #754): POST /api/games resume responses now carry
// `existing_characters`. This file pins the UI half: when the response says
// resumed=true with an existing cast that does NOT include the typed name,
// handleStart must STOP and announce — "Resuming today's existing table —
// Groucho, Chico" — and only proceed into the session on explicit confirm.
// A rejoin under a name already at the table stays friction-free.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ConnectScreen } from "@/screens/ConnectScreen";
import type { GenresResponse } from "@/types/genres";

const GENRES: GenresResponse = {
  space_opera: {
    name: "Space Opera",
    description: "Starships and smugglers.",
    worlds: [
      {
        slug: "perseus_cloud",
        name: "Perseus Cloud",
        description: "A nebula of bad debts.",
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

const MP_SLUG = "2026-06-07-perseus_cloud-mp";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderConnect() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <ConnectScreen genres={GENRES} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function mockGamesPost(body: Record<string, unknown>, status = 200) {
  globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === "string" && url.startsWith("/api/sessions")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
    }
    if (typeof url === "string" && url === "/api/games" && opts?.method === "POST") {
      return Promise.resolve({
        ok: true,
        status,
        json: () => Promise.resolve(body),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

async function fillLobbyAndStart(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText(/name/i), name);
  // Single genre/world fixture: the genre is open by default; pick the world.
  const radio = screen.getByRole("radio", { name: /perseus cloud/i });
  await user.click(radio);
  // Multiplayer mode — the masquerade repro is MP.
  await user.click(screen.getByRole("radio", { name: /multiplayer/i }));
  await user.click(screen.getByRole("button", { name: /start/i }));
}

const RESUME_BODY = {
  slug: MP_SLUG,
  mode: "multiplayer",
  genre_slug: "space_opera",
  world_slug: "perseus_cloud",
  resumed: true,
  existing_characters: ["Groucho", "Chico"],
};

describe("ConnectScreen resume announcement (silent-MP-resume masquerade)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("announces the existing table and gates entry when the typed name is new", async () => {
    const user = userEvent.setup();
    mockGamesPost(RESUME_BODY);
    renderConnect();

    await fillLobbyAndStart(user, "Charlie");

    // The notice must NAME the existing table…
    const notice = await screen.findByText(/resuming today's existing table/i);
    expect(notice).toBeInTheDocument();
    expect(screen.getByText(/Groucho, Chico/)).toBeInTheDocument();
    // …and we must NOT have navigated into the session yet.
    expect(screen.getByTestId("location-probe").textContent).toBe("/");

    // Explicit confirm proceeds into the existing session.
    await user.click(screen.getByRole("button", { name: /join this table/i }));
    expect(screen.getByTestId("location-probe").textContent).toBe(`/play/${MP_SLUG}`);
  });

  it("cancel keeps the player in the lobby and dismisses the notice", async () => {
    const user = userEvent.setup();
    mockGamesPost(RESUME_BODY);
    renderConnect();

    await fillLobbyAndStart(user, "Charlie");
    await screen.findByText(/resuming today's existing table/i);

    await user.click(screen.getByRole("button", { name: /stay in the lobby/i }));

    expect(screen.queryByText(/resuming today's existing table/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("location-probe").textContent).toBe("/");
  });

  it("a name already at the table rejoins without the gate", async () => {
    const user = userEvent.setup();
    mockGamesPost(RESUME_BODY);
    renderConnect();

    await fillLobbyAndStart(user, "Groucho");

    // Friction-free rejoin: no announcement, straight to the session.
    expect(await screen.findByTestId("location-probe")).toHaveTextContent(`/play/${MP_SLUG}`);
    expect(screen.queryByText(/resuming today's existing table/i)).not.toBeInTheDocument();
  });

  it("a fresh creation (resumed=false) navigates immediately, unchanged", async () => {
    const user = userEvent.setup();
    mockGamesPost(
      {
        slug: MP_SLUG,
        mode: "multiplayer",
        resumed: false,
        existing_characters: [],
      },
      201,
    );
    renderConnect();

    await fillLobbyAndStart(user, "Charlie");

    expect(await screen.findByTestId("location-probe")).toHaveTextContent(`/play/${MP_SLUG}`);
    expect(screen.queryByText(/resuming today's existing table/i)).not.toBeInTheDocument();
  });
});
