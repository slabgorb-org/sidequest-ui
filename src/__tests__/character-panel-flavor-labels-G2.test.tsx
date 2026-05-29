// sq-playtest 2026-05-28 #G2 (live-panel extension) — the in-game sheet must
// show the chargen FLAVOR the player chose, not the collapsed mechanical slug.
//
// The bug: a player who picked "Country Veterinary Surgeon" / "The Village
// Itself" saw "Doctor · Servant" on the live CharacterPanel, because the panel
// rendered the mechanical race/char_class slug. The fix persists display-only
// origin_label/calling_label on the Character, projects them onto the
// PARTY_STATUS `members[].sheet`, and renders them over the slug.
//
// Per CLAUDE.md "Verify Wiring, Not Just Existence" + "No Source-Text Wiring
// Tests": this drives the REAL `App` PARTY_STATUS handler through a mocked
// WebSocket and a GameBoard stub that captures the `characterSheet` prop App
// actually assembles — proving the sheet.calling_label/origin_label flow from
// the wire into CharacterSheetData (the seam between the server payload and the
// CharacterPanel render, which is unit-tested separately).

import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import type { CharacterSheetData } from "@/components/CharacterSheet";
import App from "../App";

// Capture the characterSheet prop App assembles and hands to GameBoard.
let capturedSheet: CharacterSheetData | null = null;
vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: { characterSheet?: CharacterSheetData | null }) => {
    capturedSheet = props.characterSheet ?? null;
    return <div data-testid="gameboard-stub" />;
  },
}));

const SLUG = "2026-05-28-glenross";
const GAME_META = { genre_slug: "tea_and_murder", world_slug: "glenross", mode: "single" };

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
        new Response(JSON.stringify({ tea_and_murder: { name: "Tea & Murder", worlds: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

const wsUrl = `ws://${location.host}/ws`;

function renderApp() {
  return render(
    <MemoryRouter initialEntries={[`/play/${SLUG}`]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  capturedSheet = null;
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "Vyvyan");
  localStorage.setItem(
    "sidequest-history",
    JSON.stringify([
      {
        player_name: "Vyvyan",
        genre: "tea_and_murder",
        world: "glenross",
        last_played_iso: new Date().toISOString(),
        game_slug: SLUG,
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

const SHEET_FACET = {
  race: "Servant",
  stats: { WITS: 12 },
  abilities: [],
  class_moves: [],
  backstory: "A country vet lately turned sleuth.",
  personality: "Patient",
};

describe("#G2 live-panel — App maps sheet.calling_label/origin_label end-to-end", () => {
  it("assembles CharacterSheetData with the chargen flavor labels from PARTY_STATUS", async () => {
    const server = new WS(wsUrl, { jsonProtocol: true });
    renderApp();

    await server.connected;
    await server.nextMessage; // consume SESSION_EVENT{connect}

    act(() => {
      server.send({ type: "SESSION_EVENT", payload: { event: "ready", has_character: true } });
    });
    await waitFor(() => {
      expect(screen.getByTestId("gameboard-stub")).toBeInTheDocument();
    });

    act(() => {
      server.send({
        type: "PARTY_STATUS",
        payload: {
          members: [
            {
              player_id: "p_vyvyan",
              name: "Vyvyan",
              character_name: "Vyvyan",
              current_hp: 10,
              max_hp: 10,
              class: "Doctor",
              level: 1,
              sheet: {
                ...SHEET_FACET,
                calling_label: "Country Veterinary Surgeon",
                origin_label: "The Village Itself",
              },
            },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(capturedSheet).not.toBeNull();
      expect(capturedSheet?.calling_label).toBe("Country Veterinary Surgeon");
    });
    expect(capturedSheet?.origin_label).toBe("The Village Itself");
    // Mechanical slug still rides along for systems that key on it.
    expect(capturedSheet?.class).toBe("Doctor");
    expect(capturedSheet?.race).toBe("Servant");
  });

  it("leaves the labels undefined when the server omits them (slug fallback)", async () => {
    const server = new WS(wsUrl, { jsonProtocol: true });
    renderApp();

    await server.connected;
    await server.nextMessage;

    act(() => {
      server.send({ type: "SESSION_EVENT", payload: { event: "ready", has_character: true } });
    });
    await waitFor(() => {
      expect(screen.getByTestId("gameboard-stub")).toBeInTheDocument();
    });

    act(() => {
      server.send({
        type: "PARTY_STATUS",
        payload: {
          members: [
            {
              player_id: "p_vyvyan",
              name: "Vyvyan",
              character_name: "Vyvyan",
              current_hp: 10,
              max_hp: 10,
              class: "Detective",
              level: 1,
              sheet: { ...SHEET_FACET, race: "Human" },
            },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(capturedSheet).not.toBeNull();
    });
    expect(capturedSheet?.calling_label).toBeUndefined();
    expect(capturedSheet?.origin_label).toBeUndefined();
    expect(capturedSheet?.class).toBe("Detective");
  });
});
