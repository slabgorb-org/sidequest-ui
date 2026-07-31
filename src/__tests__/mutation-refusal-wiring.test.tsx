// MutationRefusalBanner wiring test — Story 158-57.
//
// The server already saw a refused AWN mutation use on the GM-panel-only
// awn.mutation.refused OTEL span; the round used to resolve with the refused
// player told nothing at all. The server now broadcasts MUTATION_REFUSED
// (naming WHO / WHICH mutation / WHY, with the mechanics-first math); this
// proves AppInner listens for it and renders the banner — the message → state
// → banner pipeline, end to end.
//
// Per CLAUDE.md "Verify Wiring, Not Just Existence" — a component-only test is
// not enough; this hits the real AppInner through a mocked WebSocket server,
// mirroring death-banner-wiring.test.tsx's shape exactly.

import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "../App";

const GAME_META = {
  genre_slug: "mutant_wasteland",
  world_slug: "flickering_reach",
  mode: "single",
};

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(GAME_META), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ mutant_wasteland: { name: "Mutant Wasteland", worlds: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "rux");
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "rux",
        genre: "mutant_wasteland",
        world: "flickering_reach",
        last_played_iso: new Date().toISOString(),
        game_slug: "2026-07-31-flickering-reach-1",
        mode: "single",
      },
    ]),
  );
  vi.stubGlobal("fetch", makeFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

describe("MutationRefusalBanner wiring (story 158-57)", () => {
  it("renders the refusal banner naming WHO / WHICH mutation / WHY on MUTATION_REFUSED", async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={["/play/2026-07-31-flickering-reach-1"]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT connect

    // Enter the game phase so the InputBar (and banner region) render.
    act(() => {
      server.send({
        type: "SESSION_EVENT",
        payload: { event: "ready", has_character: true },
      });
    });
    await screen.findByPlaceholderText(/what do you do/i);

    // No refusal banner before the server says so.
    expect(screen.queryByTestId("mutation-refusal-banner")).toBeNull();

    // Server refuses a committed mutation — carries the mechanics-first math
    // (the uses ledger), not a bare verdict.
    act(() => {
      server.send({
        type: "MUTATION_REFUSED",
        payload: {
          actor: "Rux",
          mutation_id: "bone_spurs",
          reason: "limit_exhausted (per_day: 1/1)",
        },
      });
    });

    const banner = await screen.findByTestId("mutation-refusal-banner");
    expect(banner.textContent).toMatch(/Rux/);
    expect(banner.textContent).toMatch(/bone_spurs/);
    expect(banner.textContent).toMatch(/limit_exhausted \(per_day: 1\/1\)/);

    // It is dismissible, and the seat is never locked by it (unlike DeathBanner).
    const input = screen.getByPlaceholderText(/what do you do/i) as HTMLInputElement;
    expect(input.disabled).toBe(false);
    act(() => {
      screen.getByTestId("mutation-refusal-dismiss").click();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("mutation-refusal-banner")).toBeNull();
    });
  });
});
