// Wire-first boundary test for Story 47-3 (Magic Phase 5).
//
// Asserts the end-to-end transport for magic-confrontation outcomes:
//
//   server narration_apply → CONFRONTATION_OUTCOME WebSocket message
//     → App message handler → ConfrontationOverlay reveal panel
//
// This is the "mounted React component + WebSocket transport" boundary
// the wire-first workflow demands. Unit tests of the overlay rendering
// and the protocol enum exist as support; this test fails when *any*
// link in the chain breaks.
//
// Today this test FAILS because:
//   1. MessageType.CONFRONTATION_OUTCOME does not exist in protocol.ts.
//   2. App.tsx has no handler that routes that message into a
//      ConfrontationOverlay outcome prop.
//   3. ConfrontationOverlay does not yet accept an outcome prop or
//      render a reveal panel.
//
// Each of those is a distinct Phase 5 wiring task; the green-phase
// implementer satisfies them in order until this test passes.

import { StrictMode } from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import App from "../App";
import { MessageType } from "@/types/protocol";

const SLUG = "2026-05-02-bleeding-through-wiring";

const GENRES_RESPONSE = {
  space_opera: {
    name: "Space Opera",
    description: "Coyote Star — frontier sci-fi.",
    worlds: [
      {
        slug: "coyote_star",
        name: "Coyote Star",
        description: "The Coyote Reach.",
        era: null,
        setting: null,
        inspirations: [],
        axis_snapshot: {},
        hero_image: null,
      },
    ],
  },
};

const GAME_META = {
  genre_slug: "space_opera",
  world_slug: "coyote_star",
  mode: "solo",
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
    if (typeof url === "string" && url.startsWith("/api/sessions")) {
      return Promise.resolve(
        new Response(JSON.stringify({ sessions: [] }), { status: 200 }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(JSON.stringify(GENRES_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  vi.stubGlobal("fetch", makeFetchMock());
  localStorage.setItem("sq:display-name", "Keith");
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "Keith",
        genre: "space_opera",
        world: "coyote_star",
        game_slug: SLUG,
        mode: "solo",
        last_played_iso: new Date().toISOString(),
      },
    ]),
  );
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const BLEEDING_THROUGH_PAYLOAD = {
  type: "the_bleeding_through",
  label: "The Bleeding-Through",
  category: "magic_confrontation",
  actors: [{ name: "Keith", role: "channeler" }],
  player_metric: { name: "sanity", current: 4, starting: 4, threshold: 10 },
  opponent_metric: {
    name: "the resonance",
    current: 6,
    starting: 0,
    threshold: 10,
  },
  beats: [],
  secondary_stats: null,
  genre_slug: "space_opera",
  mood: "haunted",
};

describe("magic confrontation wiring (Story 47-3 boundary)", () => {
  it("protocol exposes CONFRONTATION_OUTCOME for resolution dispatch", () => {
    // Without a dedicated message type, the server has no way to tell
    // the UI "the confrontation just resolved with branch X and these
    // mandatory_outputs". Adding the enum entry is the first wiring step.
    expect((MessageType as Record<string, string>).CONFRONTATION_OUTCOME).toBe(
      "CONFRONTATION_OUTCOME",
    );
  });

  it("server CONFRONTATION_OUTCOME drives ConfrontationOverlay reveal panel", async () => {
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/solo/${SLUG}`]}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );

    await server.connected;
    // Drain SESSION_EVENT{connect}
    await server.nextMessage;

    // Drive into game phase.
    act(() => {
      server.send({ type: "SESSION_EVENT", payload: { event: "ready" } });
    });

    // Step 1: server fires the magic confrontation (CONFRONTATION).
    act(() => {
      server.send({
        type: "CONFRONTATION",
        payload: BLEEDING_THROUGH_PAYLOAD,
      });
    });

    // Step 2: server resolves with branch + mandatory_outputs. This is
    // the new Phase 5 message — App must route it to the overlay's
    // outcome surface.
    act(() => {
      server.send({
        type: "CONFRONTATION_OUTCOME",
        payload: {
          confrontation_id: "the_bleeding_through",
          label: "The Bleeding-Through",
          branch: "pyrrhic_win",
          mandatory_outputs: [
            "control_tier_advance",
            "status_add_scar",
            "lore_revealed",
          ],
        },
      });
    });

    // The reveal panel must mount with the resolved branch surfaced
    // (data-branch is the wire-first contract — distinguishable
    // styling per Decision #9).
    const reveal = await screen.findByTestId(
      "confrontation-outcome-reveal",
      {},
      { timeout: 3000 },
    );
    expect(reveal).toHaveAttribute("data-branch", "pyrrhic_win");

    // Every mandatory_output must surface in the reveal so the player
    // can read what just changed.
    const text = (reveal.textContent ?? "").toLowerCase();
    expect(text).toMatch(/control|tier/);
    expect(text).toMatch(/scar|status/);
    expect(text).toMatch(/lore/);
  });
});
