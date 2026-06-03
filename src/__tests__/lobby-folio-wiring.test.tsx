/**
 * Standing Folio wiring test (story 83-1, AC9).
 *
 * Unit tests render <ConnectScreen> in isolation. This proves the redesigned
 * lobby is actually mounted on the real App connect route and reachable — the
 * project's "Verify Wiring, Not Just Existence" rule. It boots the full <App>
 * at "/", lets the real genres fetch resolve, and asserts the Standing Folio
 * chrome (wordmark + folio card + a genre accordion header) renders.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "@/App";

const GENRES_RESPONSE = {
  low_fantasy: {
    name: "Low Fantasy",
    description: "Gritty medieval adventures.",
    worlds: [
      {
        slug: "greyhawk",
        name: "Greyhawk",
        description: "The Flanaess.",
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
        description: "Dust and engines.",
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

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(JSON.stringify(GENRES_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.startsWith("/api/sessions")) {
      return Promise.resolve(
        new Response(JSON.stringify({ sessions: [] }), { status: 200 }),
      );
    }
    if (typeof url === "string" && url === "/dev/scenes") {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  });
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  vi.stubGlobal("fetch", makeFetchMock());
});

afterEach(() => {
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

describe("lobby folio is wired into the App connect route", () => {
  it("mounts the Standing Folio (wordmark + folio card) at '/' before connecting", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    // Masthead wordmark renders immediately (does not depend on the fetch).
    expect(
      await screen.findByRole("heading", { name: /sidequest/i }),
    ).toBeInTheDocument();
    // The two-pane folio card is the redesigned shell.
    expect(await screen.findByTestId("lobby-folio")).toBeInTheDocument();
  });

  it("renders the genre accordion populated from the real /api/genres fetch", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    // Genre headers appear once the genres fetch resolves — proving the live
    // catalogue (not a prototype fixture) feeds the accordion.
    expect(
      await screen.findByRole("button", { name: /low fantasy/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /road warrior/i }),
    ).toBeInTheDocument();
  });
});
