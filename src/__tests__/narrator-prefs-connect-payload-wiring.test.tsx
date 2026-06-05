// Story 82-2 (ADR-049) — narrator tuning reaches the outbound CONNECT payload.
//
// The lobby VerbositySlider/VocabularySlider persist the player's choice to
// localStorage (sq:narrator-verbosity / sq:narrator-vocabulary). App's
// slug-connect effect must fold those values into the SESSION_EVENT{connect}
// payload so the server can read them into the per-turn TurnContext.
//
// This is the UI half of the AC4 wiring chain (slider -> CONNECT). It drives the
// real App slug-connect path with a mock WebSocket (same harness as
// slug-connect-readystate-effect.test.tsx) and asserts the connect message the
// server receives carries the persisted prefs — and that an UNSET pref is
// OMITTED, not coerced to a literal (No Silent Fallbacks; server resolves it via
// default_for_player_count).

import { render } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import { installWebAudioMock, installLocalStorageMock } from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "../App";

const GAME_META = { genre_slug: "low_fantasy", world_slug: "greyhawk", mode: "solo" };

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
        new Response(JSON.stringify({ low_fantasy: { name: "Low Fantasy", worlds: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

let slugCounter = 0;
function freshSlug(): string {
  slugCounter += 1;
  const slug = `narrator-prefs-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(localStorage.getItem("sidequest-history") ?? "[]") as Array<
    Record<string, unknown>
  >;
  existing.push({
    player_name: "alice",
    genre: "low_fantasy",
    world: "greyhawk",
    last_played_iso: new Date().toISOString(),
    game_slug: slug,
    mode: "solo",
  });
  localStorage.setItem("sidequest-history", JSON.stringify(existing));
  return slug;
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "alice");
  vi.stubGlobal("fetch", makeFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

async function connectAndReadPayload() {
  const slug = freshSlug();
  const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
  render(
    <MemoryRouter initialEntries={[`/solo/${slug}`]}>
      <App />
    </MemoryRouter>,
  );
  await server.connected;
  const msg = (await server.nextMessage) as {
    type: string;
    payload: { event: string; narrator_verbosity?: string; narrator_vocabulary?: string };
  };
  expect(msg.payload.event).toBe("connect");
  return msg.payload;
}

describe("82-2 — narrator prefs ride the CONNECT payload", () => {
  it("includes both verbosity and vocabulary when the player chose them", async () => {
    localStorage.setItem("sq:narrator-verbosity", "concise");
    localStorage.setItem("sq:narrator-vocabulary", "epic");

    const payload = await connectAndReadPayload();

    expect(payload.narrator_verbosity).toBe("concise");
    expect(payload.narrator_vocabulary).toBe("epic");
  });

  it("omits an unset axis rather than sending a hardcoded literal", async () => {
    // Only verbosity chosen — vocabulary must be ABSENT from the payload so the
    // server falls back to default_for_player_count (No Silent Fallbacks).
    localStorage.setItem("sq:narrator-verbosity", "verbose");

    const payload = await connectAndReadPayload();

    expect(payload.narrator_verbosity).toBe("verbose");
    expect("narrator_vocabulary" in payload).toBe(false);
  });

  it("omits a garbage stored value (validated, not trusted)", async () => {
    localStorage.setItem("sq:narrator-verbosity", "ludicrous"); // not a valid enum value

    const payload = await connectAndReadPayload();

    expect("narrator_verbosity" in payload).toBe(false);
  });
});
