// PausedBanner wiring test — MP-02 Task 8 integration verification.
//
// Task 8 of the MP-02 plan says "wire PausedBanner into the game screen."
// Unit tests in components/__tests__/PausedBanner.test.tsx prove the
// component renders correctly in isolation; this test proves AppInner
// actually listens for GAME_PAUSED / GAME_RESUMED messages from the
// WebSocket and renders the banner in response.
//
// Per CLAUDE.md "Verify Wiring, Not Just Existence" — unit tests passing
// on unimported components are worthless. This test hits the real AppInner
// through a mocked WebSocket server to confirm the message → state →
// banner pipeline is connected end-to-end.

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  genre_slug: "low_fantasy",
  world_slug: "greyhawk",
  mode: "multiplayer",
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
          JSON.stringify({ low_fantasy: { name: "Low Fantasy", worlds: [] } }),
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
  // Seed journey history for the slug used below so AppInner's slug-mode
  // trust gate (silent-rebind protection added 2026-04-26) treats this as
  // an existing identity. Without this entry the direct mount would render
  // the NamePrompt and the WS connect would never fire.
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "alice",
        genre: "low_fantasy",
        world: "greyhawk",
        last_played_iso: new Date().toISOString(),
        game_slug: "2026-04-22-moldharrow-keep",
        mode: "multiplayer",
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

describe("PausedBanner wiring (MP-02 Task 8)", () => {
  it("renders the banner when the server sends GAME_PAUSED", async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={["/play/2026-04-22-moldharrow-keep"]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT connect

    // No banner before the server pauses.
    expect(screen.queryByText(/paused/i)).toBeNull();

    act(() => {
      server.send({
        type: "GAME_PAUSED",
        payload: { waiting_for: ["bob", "carol"] },
      });
    });

    // Banner appears with both absent player names.
    await waitFor(() => {
      const banner = screen.getByText(/paused/i);
      expect(banner).toBeInTheDocument();
      expect(banner.textContent).toMatch(/bob/);
      expect(banner.textContent).toMatch(/carol/);
    });
  });

  it("hides the banner when the server sends GAME_RESUMED", async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={["/play/2026-04-22-moldharrow-keep"]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT connect

    act(() => {
      server.send({
        type: "GAME_PAUSED",
        payload: { waiting_for: ["bob"] },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/paused/i)).toBeInTheDocument();
    });

    act(() => {
      server.send({ type: "GAME_RESUMED", payload: {} });
    });

    await waitFor(() => {
      expect(screen.queryByText(/paused/i)).toBeNull();
    });
  });

  // sq-playtest 2026-06-07: an action submitted during a peer's brief
  // disconnect was refused server-side (player_action_blocked_paused) with
  // ZERO client feedback — the optimistic clear ate the draft, and the
  // PausedBanner blinked away when the peer's socket bounced straight back.
  // Contract: GAME_PAUSED arriving while OUR action is in flight restores
  // the draft into the input and raises a persistent dismissible notice
  // that survives GAME_RESUMED.
  it("restores the dropped draft + raises a persistent notice when GAME_PAUSED bounces a submitted action", async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={["/play/2026-04-22-moldharrow-keep"]}>
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

    // Type and submit a real action — the optimistic path clears the field.
    const user = userEvent.setup();
    const ACTION = "I cut the fuel line and brace against the bulkhead";
    await user.type(input, ACTION);
    await user.keyboard("{Enter}");
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));

    // Server refuses the dispatch: GAME_PAUSED while our action in flight.
    act(() => {
      server.send({
        type: "GAME_PAUSED",
        payload: { waiting_for: ["bob"] },
      });
    });

    // The draft is restored — not silently swallowed.
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe(ACTION);
    });
    // A persistent, dismissible notice explains why.
    const notice = await screen.findByTestId("transient-error-banner");
    expect(notice.textContent).toMatch(/didn't go through/i);
    expect(notice.textContent).toMatch(/bob/);

    // The notice SURVIVES the (possibly near-instant) resume — the whole
    // failure mode was pause+resume inside a second leaving no trace.
    act(() => {
      server.send({ type: "GAME_RESUMED", payload: {} });
    });
    await waitFor(() => {
      expect(screen.queryByText(/paused/i)).toBeNull();
    });
    expect(screen.getByTestId("transient-error-banner")).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe(ACTION);
  });

  it("does NOT restore a draft or raise the notice on a pause with no action in flight", async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={["/play/2026-04-22-moldharrow-keep"]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;

    act(() => {
      server.send({
        type: "SESSION_EVENT",
        payload: { event: "ready", has_character: true },
      });
    });
    const input = await screen.findByPlaceholderText(/what do you do/i);

    act(() => {
      server.send({ type: "GAME_PAUSED", payload: { waiting_for: ["bob"] } });
    });
    await waitFor(() => {
      expect(screen.getByText(/paused/i)).toBeInTheDocument();
    });
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("transient-error-banner")).toBeNull();
  });
});
