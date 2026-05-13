// App → GameBoard companions wiring — end-to-end integration guard for
// Story 50-3 (pingpong 2026-05-07 / 2026-05-08).
//
// Why a SECOND companions test? The existing
// `companions-party-status-wiring.test.tsx` is a CharacterPanel-only check
// that re-implements App's PARTY_STATUS handler (`partyStatusToCompanions`)
// inside the test file and renders CharacterPanel directly. That bypasses
// the actual production state-mirror path — every regression possible at
// the App.tsx → GameBoard call site (wrong field name, dropped useEffect,
// missing setPartyCompanions, etc.) slips past the existing suite.
//
// This test closes that gap: it mounts App, sends a real PARTY_STATUS
// frame over a mocked WebSocket, and asserts the mocked GameBoard
// receives `companions` containing the recruited NPC. AC-5 ("Wiring test
// confirms the section is reachable from the production state-mirror
// path — not just storybook fixtures") cannot be honored without this.
//
// Pattern: matches `app-gameboard-world-slug-wiring.test.tsx` — GameBoard
// is mocked to a stub that serializes the prop into a data attribute the
// DOM-level assertion can read. Cheap, deterministic, and traps the call
// site, not the leaf component.

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import type { CompanionSummary } from "@/types/party";

// vi.mock hoists before App imports — stub serializes companions prop into
// a data attribute so the test asserts purely from the DOM. Anything more
// than JSON.stringify here defeats the point: we are trapping the App
// side of the wire, not testing GameBoard's render tree.
vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: { companions?: CompanionSummary[] }) => (
    <div
      data-testid="gameboard-stub"
      data-companions={JSON.stringify(props.companions ?? [])}
    />
  ),
}));

import App from "../App";

const CAVERNS_SUNDEN_META = {
  genre_slug: "caverns_and_claudes",
  world_slug: "sunden",
  mode: "solo",
};

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(CAVERNS_SUNDEN_META), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            caverns_and_claudes: { name: "Caverns & Claudes", worlds: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

let slugCounter = 0;
function freshSlug(): string {
  slugCounter += 1;
  const slug = `sunden-companions-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "carl",
    genre: "caverns_and_claudes",
    world: "sunden",
    last_played_iso: new Date().toISOString(),
    game_slug: slug,
    mode: "solo",
  });
  localStorage.setItem("sidequest-history", JSON.stringify(existing));
  return slug;
}

const CARL_MEMBER = {
  player_id: "carl-pid",
  name: "carl",
  character_name: "Carl",
  class: "Cleric",
  level: 1,
  current_hp: 3,
  max_hp: 3,
  statuses: [],
  current_location: "Recruiter's Post",
  portrait_url: "",
};

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "carl");
  vi.stubGlobal("fetch", makeFetchMock());
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

describe("App → GameBoard companions wiring (Sünden recruit playtest)", () => {
  it("forwards companions[] to GameBoard after PARTY_STATUS arrives", async () => {
    // Original 2026-05-07 playtest: server logged companions_added=1 for
    // "Donut", PARTY_STATUS frame carried companions[]={name:"Donut",...},
    // and the UI still rendered only Carl. The unit test passed because
    // CharacterPanel was never the broken layer — the wire→state→prop
    // chain inside App was. This test exercises that chain end-to-end.
    const slug = freshSlug();
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;

    server.send({
      type: "SESSION_EVENT",
      payload: { event: "ready", has_character: true },
    });

    // Drive PARTY_STATUS with the same shape views.build_session_start_party_status
    // emits server-side (sidequest-server/sidequest/server/views.py:548).
    server.send({
      type: "PARTY_STATUS",
      payload: {
        members: [CARL_MEMBER],
        companions: [
          {
            name: "Donut",
            role: "torchbearer",
            description: "Wiry, calloused, cheap.",
            notes: "Bond 10sp under the slate; Mawdeep walk-out by mid-morning.",
            recruited_turn: 4,
            recruited_by: "Carl",
          },
        ],
      },
    });

    const stub = await waitFor(() => screen.getByTestId("gameboard-stub"));

    // Re-read on every tick — the prop arrives asynchronously after the
    // PARTY_STATUS handler updates React state.
    await waitFor(() => {
      const raw = stub.getAttribute("data-companions") ?? "[]";
      const companions = JSON.parse(raw) as CompanionSummary[];
      expect(companions).toHaveLength(1);
      expect(companions[0].name).toBe("Donut");
      expect(companions[0].role).toBe("torchbearer");
      expect(companions[0].recruited_by).toBe("Carl");
    });
  });

  it("clears companions[] when a dismissal PARTY_STATUS arrives mid-session", async () => {
    // Symmetric live-update path: companion dismissed → next PARTY_STATUS
    // frame carries companions: []. The App state-mirror MUST overwrite
    // the prior roster, not retain the stale Donut entry. A previous
    // bug class was "merge instead of overwrite", which the existing
    // CharacterPanel-only test cannot detect because it never exercises
    // App.tsx's setPartyCompanions call.
    const slug = freshSlug();
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;
    server.send({
      type: "SESSION_EVENT",
      payload: { event: "ready", has_character: true },
    });

    server.send({
      type: "PARTY_STATUS",
      payload: {
        members: [CARL_MEMBER],
        companions: [
          { name: "Donut", role: "torchbearer", recruited_by: "Carl" },
        ],
      },
    });

    const stub = await waitFor(() => screen.getByTestId("gameboard-stub"));
    await waitFor(() => {
      const companions = JSON.parse(
        stub.getAttribute("data-companions") ?? "[]",
      ) as CompanionSummary[];
      expect(companions).toHaveLength(1);
    });

    // Dismissal frame.
    server.send({
      type: "PARTY_STATUS",
      payload: { members: [CARL_MEMBER], companions: [] },
    });

    await waitFor(() => {
      const companions = JSON.parse(
        stub.getAttribute("data-companions") ?? "[]",
      ) as CompanionSummary[];
      expect(companions).toHaveLength(0);
    });
  });

  it("preserves multi-companion roster ordering through the wire path", async () => {
    // Canonical Sünden recruitment arc is Carl → Donut → Katia → Mawdeep.
    // Server roster is append-only; the UI prop must mirror that order so
    // table-side reference ("hey Katia, you scout") matches the visible
    // panel ordering. A stable-sort regression at the App boundary would
    // surface here without the CharacterPanel render tree needing to spin
    // up at all.
    const slug = freshSlug();
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;
    server.send({
      type: "SESSION_EVENT",
      payload: { event: "ready", has_character: true },
    });

    server.send({
      type: "PARTY_STATUS",
      payload: {
        members: [CARL_MEMBER],
        companions: [
          { name: "Donut", role: "torchbearer", recruited_by: "Carl" },
          { name: "Katia", role: "scout", recruited_by: "Carl" },
        ],
      },
    });

    const stub = await waitFor(() => screen.getByTestId("gameboard-stub"));
    await waitFor(() => {
      const companions = JSON.parse(
        stub.getAttribute("data-companions") ?? "[]",
      ) as CompanionSummary[];
      expect(companions.map((c) => c.name)).toEqual(["Donut", "Katia"]);
    });
  });

  it("drops companion entries missing a name (server emitted a malformed row)", async () => {
    // App.tsx:861 filters `c.name` falsy. This is the only defensive
    // server-trust check on the wire path — a regression that loosens it
    // would surface as a blank-name row in the panel (no testid, no
    // initials, no recruited_by visible). Lock the filter shape.
    const slug = freshSlug();
    const wsUrl = `ws://${location.host}/ws`;
    const server = new WS(wsUrl, { jsonProtocol: true });

    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <App />
      </MemoryRouter>,
    );

    await server.connected;
    await server.nextMessage;
    server.send({
      type: "SESSION_EVENT",
      payload: { event: "ready", has_character: true },
    });

    server.send({
      type: "PARTY_STATUS",
      payload: {
        members: [CARL_MEMBER],
        companions: [
          { name: "", role: "torchbearer", recruited_by: "Carl" },
          { name: "Donut", role: "torchbearer", recruited_by: "Carl" },
        ],
      },
    });

    const stub = await waitFor(() => screen.getByTestId("gameboard-stub"));
    await waitFor(() => {
      const companions = JSON.parse(
        stub.getAttribute("data-companions") ?? "[]",
      ) as CompanionSummary[];
      expect(companions).toHaveLength(1);
      expect(companions[0].name).toBe("Donut");
    });
  });
});
