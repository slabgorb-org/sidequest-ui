// DeathBanner wiring test — sq-playtest 2026-06-07 (barsoom-3, blocking).
//
// A PC the genre lethality policy ruled dead kept full agency for four rounds
// because the UI never surfaced the death or locked input. The server now
// refuses a downed PC's actions and emits CHARACTER_INCAPACITATED; this proves
// AppInner listens for it, renders the death banner, and locks the InputBar —
// the message → state → banner/lock pipeline, end to end.
//
// Per CLAUDE.md "Verify Wiring, Not Just Existence" — the DeathBanner unit test
// (components/__tests__/DeathBanner.test.tsx) is not enough; this hits the real
// AppInner through a mocked WebSocket server.

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
  genre_slug: "heavy_metal",
  world_slug: "barsoom",
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
          JSON.stringify({ heavy_metal: { name: "Heavy Metal", worlds: [] } }),
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
  localStorage.setItem("sq:display-name", "alice");
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "alice",
        genre: "heavy_metal",
        world: "barsoom",
        last_played_iso: new Date().toISOString(),
        game_slug: "2026-06-07-barsoom-3",
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

describe("DeathBanner wiring (barsoom-3 blocking fix)", () => {
  it("renders the death banner and locks input on CHARACTER_INCAPACITATED", async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={["/play/2026-06-07-barsoom-3"]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT connect

    // Enter the game phase so the InputBar renders.
    act(() => {
      server.send({
        type: "SESSION_EVENT",
        payload: { event: "ready", has_character: true },
      });
    });
    const input = await screen.findByPlaceholderText(/what do you do/i);
    expect((input as HTMLInputElement).disabled).toBe(false);

    // No death banner before the kill.
    expect(screen.queryByTestId("death-banner")).toBeNull();

    // Server reports the PC dead. Solo session (no party roster) → treated as
    // ours, so the banner + lock fire.
    act(() => {
      server.send({
        type: "CHARACTER_INCAPACITATED",
        payload: {
          character_name: "Abinthe Moridusk",
          verdict: "dead",
          status_text: "Downed — dead (mortally wounded)",
          headline: "Abinthe Moridusk has fallen.",
          can_reroll: true,
        },
      });
    });

    // Banner appears with the headline...
    const banner = await screen.findByTestId("death-banner");
    expect(banner.textContent).toMatch(/Abinthe Moridusk has fallen\./);
    // ...and a re-roll CTA...
    expect(screen.getByTestId("death-banner-reroll")).toBeInTheDocument();
    // ...and the input is locked.
    await waitFor(() => {
      expect((input as HTMLInputElement).disabled).toBe(true);
    });
  });

  it("does NOT lock our seat when a PEER is the one incapacitated", async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={["/play/2026-06-07-barsoom-3"]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;

    // Seat a party with our local PC (alice → "Tars Tarkas") plus a peer.
    // currentPlayerId resolves by matching member.name === connectedPlayerName
    // ("alice"), so the local member must carry name:"alice".
    act(() => {
      server.send({
        type: "PARTY_STATUS",
        payload: {
          members: [
            { player_id: "p-alice", name: "alice", character_name: "Tars Tarkas" },
            { player_id: "p-bob", name: "bob", character_name: "Abinthe Moridusk" },
          ],
        },
      });
    });
    act(() => {
      server.send({
        type: "SESSION_EVENT",
        payload: { event: "ready", has_character: true },
      });
    });
    const input = await screen.findByPlaceholderText(/what do you do/i);

    // The PEER's character dies — our seat must keep playing (Guitar Solo).
    act(() => {
      server.send({
        type: "CHARACTER_INCAPACITATED",
        payload: {
          character_name: "Abinthe Moridusk",
          verdict: "dead",
          status_text: "Downed — dead (mortally wounded)",
          headline: "Abinthe Moridusk has fallen.",
          can_reroll: true,
        },
      });
    });

    // No banner for us, input stays live.
    await waitFor(() => {
      expect((input as HTMLInputElement).disabled).toBe(false);
    });
    expect(screen.queryByTestId("death-banner")).toBeNull();
  });
});
