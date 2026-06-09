// Story 100-8 (Phase 2) — RED.
//
// WIRING TEST (per CLAUDE.md "Every Test Suite Needs a Wiring Test"): the
// reference routes are registered in the APP's own <Routes> and reachable —
// and reaching them does NOT spin up the game session (no ConnectScreen, no
// WebSocket). This is the end-to-end proof that the session-free reference
// shell is wired into the production router, not just unit-rendered in
// isolation.
//
// Renders the real <App/> (which owns AppRoutes) at a reference URL. Before
// this story, App's <Routes> only knows `/`, `/solo/:slug`, `/play/:slug`
// (all → LobbyRoot, the session-owning tree), so navigating to
// `/reference/rules/...` falls through to nothing and the reference content
// never appears — RED.

import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "@/App";

const PACK = "heavy_metal";

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rulesFixture() {
  return {
    schema_version: 1,
    pack: PACK,
    sections: [
      {
        id: "rules",
        label: "Rules",
        node: {
          type: "dict",
          entries: [
            {
              key: "combat",
              label: "Combat",
              node: { type: "scalar", value: "Strike resolves on the lethality track." },
            },
          ],
        },
      },
    ],
    theme: { "--primary": "#c0392b" },
  };
}

describe("App routing — reference shell is wired session-free (AC1/AC2 wiring)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let wsCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    AudioEngine.resetInstance();
    installWebAudioMock();
    installLocalStorageMock();
    fetchMock = vi.fn().mockResolvedValue(makeJsonResponse(rulesFixture()));
    vi.stubGlobal("fetch", fetchMock);
    wsCtor = vi.fn();
    vi.stubGlobal("WebSocket", wsCtor);
  });

  afterEach(() => {
    AudioEngine.resetInstance();
    vi.unstubAllGlobals();
  });

  it("mounts the reference rules route through the app router and renders projection content", async () => {
    render(
      <MemoryRouter initialEntries={[`/reference/rules/${PACK}`]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Strike resolves on the lethality track."),
    ).toBeInTheDocument();
  });

  it("does NOT show the ConnectScreen (no game session) on a reference route (C2)", async () => {
    render(
      <MemoryRouter initialEntries={[`/reference/rules/${PACK}`]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Strike resolves on the lethality track.");
    // ConnectScreen's player-name field must be absent — the session tree never mounted.
    expect(screen.queryByLabelText(/player name/i)).not.toBeInTheDocument();
  });

  it("does NOT open a game WebSocket on a reference route (C2)", async () => {
    render(
      <MemoryRouter initialEntries={[`/reference/rules/${PACK}`]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Strike resolves on the lethality track.");
    expect(wsCtor).not.toHaveBeenCalled();
  });
});
