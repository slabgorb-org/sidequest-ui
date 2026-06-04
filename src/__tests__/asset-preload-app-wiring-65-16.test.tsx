// App-level asset-preload follow-ups — Story 65-16 (follow-ups to 65-4).
//
// Two App-mount-site behaviours that 65-4 left open:
//
//   AC1 — handleLeave must clear `preloadedAssets`. 65-4's preload state is a
//   pure input to ImageBusProvider that deliberately SURVIVES the reconnect
//   purge (right for same-session refresh). But on an explicit LEAVE the prior
//   session's backfill must not leak into the next session. Today handleLeave
//   resets ~two dozen state fields but NOT preloadedAssets, so re-entering a
//   different session shows the old game's images until the new session's first
//   live render sorts above them.
//
//   AC2b — the App mounts `useAssetPreload` WITHOUT an onError callback, so a
//   failed ledger preload is logged by the hook but never surfaced to the
//   player. AC2b wires onError to the existing transient-error banner
//   (Story 71-3 surface) so a failed preload is visible, not swallowed.
//
// Mirrors asset-preload-app-wiring-65-4.test.tsx: mock GameBoard so the stub
// reads the REAL ImageBus via useImageBus() and also exposes the onLeave verb,
// drive the socket with jest-websocket-mock, render <App/> under MemoryRouter.

import { useEffect } from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";

// Stub GameBoard: render the REAL ImageBus gallery URLs into a data attribute
// AND surface the onLeave verb as a clickable button so the test can drive the
// production handleLeave path (the AC1 trigger) without the full chrome.
vi.mock("@/components/GameBoard/GameBoard", async () => {
  const { useImageBus } = await import("@/providers/ImageBusProvider");
  return {
    GameBoard: ({ onLeave }: { onLeave: () => void }) => {
      const images = useImageBus();
      return (
        <div
          data-testid="gameboard-stub"
          data-image-urls={JSON.stringify(images.map((i) => i.url))}
        >
          <button type="button" data-testid="stub-leave" onClick={onLeave}>
            leave
          </button>
        </div>
      );
    },
  };
});

import App from "../App";

const SUNDEN_META = {
  genre_slug: "caverns_and_claudes",
  world_slug: "sunden",
  mode: "solo",
};

const PRELOAD_ROWS = [
  {
    r2_key: "artifacts/sunden/s1/portrait/aaa.png",
    asset_type: "portrait",
    entity_ref: "gruk",
    created_turn: 1,
    url: "https://cdn.slabgorb.com/artifacts/sunden/s1/portrait/aaa.png",
  },
  {
    r2_key: "artifacts/sunden/s1/illustration/bbb.png",
    asset_type: "illustration",
    entity_ref: "scene-2",
    created_turn: 2,
    url: "https://cdn.slabgorb.com/artifacts/sunden/s1/illustration/bbb.png",
  },
];

type LedgerOutcome =
  | { kind: "rows"; rows: unknown[] }
  | { kind: "error"; status: number };

// fetch router with per-slug control over the asset-ledger outcome, so a test
// can give session A real rows and session B a failing ledger (isolating AC1's
// clear from session B's own preload, which would otherwise overwrite state).
function makeFetchMock(ledgerFor: (slug: string) => LedgerOutcome) {
  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string") {
      const m = url.match(/\/api\/sessions\/([^/]+)\/assets$/);
      if (m) {
        const slug = decodeURIComponent(m[1]);
        const outcome = ledgerFor(slug);
        if (outcome.kind === "error") {
          return json({ error: "ledger unavailable" }, outcome.status);
        }
        return json(outcome.rows);
      }
      // Bare GET /api/sessions (lobby social-presence poll, useSessions) —
      // distinct from the per-slug .../assets ledger matched above. The lobby
      // renders transiently during the leave→re-enter hop; without the
      // {sessions:[]} shape useSessions sets `undefined` and the lobby crashes
      // on `for (const session of activeSessions)`.
      if (/\/api\/sessions(\?|$)/.test(url)) return json({ sessions: [] });
      if (/\/api\/games\/[^?]+/.test(url)) return json(SUNDEN_META);
      if (url.includes("/api/genres")) {
        return json({ caverns_and_claudes: { name: "Caverns & Claudes", worlds: [] } });
      }
    }
    return json([]);
  });
}

let slugCounter = 0;
function freshSlug(): string {
  slugCounter += 1;
  const slug = `sunden-preload-${Date.now()}-${slugCounter}`;
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

function galleryUrls(stub: HTMLElement): Array<string | undefined> {
  return JSON.parse(stub.getAttribute("data-image-urls") ?? "[]") as Array<
    string | undefined
  >;
}

// Capture the production router's navigate so the test can switch sessions in
// the SAME App instance (a fresh render would reset state and never reproduce
// the cross-session leak AC1 targets).
const navRef: { current: ((to: string) => void) | null } = { current: null };
function NavProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    navRef.current = navigate;
  });
  return null;
}

// Drain the connect handshake on `server` and flip the session into "game"
// (has_character resume) so the gallery mounts.
async function handshake(server: WS): Promise<void> {
  await server.connected;
  await server.nextMessage; // SESSION_EVENT{connect}
  server.send({
    type: "SESSION_EVENT",
    payload: { event: "ready", has_character: true },
  });
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "carl");
  navRef.current = null;
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

describe("Story 65-16 — handleLeave clears preloadedAssets (AC1)", () => {
  it("does not leak the prior session's backfill after leave + re-entry", async () => {
    // Re-enter the SAME slug (stays identity-trusted via journey history, so no
    // NamePrompt gate to drive). The ledger serves the backfill rows on the
    // FIRST preload and 500s on every later call, so the re-entry's own preload
    // CANNOT repopulate state — the only thing that can keep the prior session's
    // assets out of the re-entered gallery is handleLeave clearing
    // preloadedAssets. That isolates AC1 from the 65-4 reconnect-survival path.
    const slug = freshSlug();
    let ledgerCalls = 0;
    vi.stubGlobal(
      "fetch",
      makeFetchMock(() => {
        ledgerCalls += 1;
        return ledgerCalls === 1
          ? { kind: "rows", rows: PRELOAD_ROWS }
          : { kind: "error", status: 500 };
      }),
    );

    const serverA = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <NavProbe />
        <App />
      </MemoryRouter>,
    );

    // --- Session: preload populates the gallery. ---
    await handshake(serverA);
    const stubA = await waitFor(() => screen.getByTestId("gameboard-stub"));
    await waitFor(() => {
      expect(galleryUrls(stubA)).toContain(PRELOAD_ROWS[0].url);
    });

    // --- Leave the session (the AC1 trigger). disconnect() closes the client
    // socket; close serverA so the re-entry stands up a clean second socket (a
    // single mock server memoises `connected` and won't re-arm). ---
    await act(async () => {
      fireEvent.click(screen.getByTestId("stub-leave"));
    });
    serverA.close();
    await waitFor(() => expect(screen.getByTestId("lobby-root")).toBeInTheDocument());

    // --- Re-enter the same session on the same App instance. ---
    const serverB = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    await act(async () => {
      navRef.current?.(`/solo/${slug}`);
    });
    await handshake(serverB);

    const stubB = await waitFor(() => screen.getByTestId("gameboard-stub"));
    // RED today: preloadedAssets was never cleared on leave, and the re-entry
    // ledger 500'd, so the prior backfill is still in App state and renders here.
    await waitFor(() => {
      expect(galleryUrls(stubB)).not.toContain(PRELOAD_ROWS[0].url);
      expect(galleryUrls(stubB)).not.toContain(PRELOAD_ROWS[1].url);
    });
  }, 20000);
});

describe("Story 65-16 — App surfaces a failed preload via onError (AC2b)", () => {
  it("shows the transient-error banner when the asset ledger preload fails", async () => {
    const slug = freshSlug();
    // The ledger fetch returns 503 → the hook's onError must reach an App-level
    // surface. RED today: useAssetPreload is mounted with NO onError callback,
    // so the failure is logged but never surfaced and the banner never appears.
    vi.stubGlobal(
      "fetch",
      makeFetchMock(() => ({ kind: "error", status: 503 })),
    );

    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <App />
      </MemoryRouter>,
    );
    await server.connected;
    await server.nextMessage; // SESSION_EVENT{connect}

    await waitFor(() => {
      expect(screen.getByTestId("transient-error-banner")).toBeInTheDocument();
    });
  });

  it("does NOT show the transient-error banner when the preload succeeds", async () => {
    // Specificity guard: the banner must be tied to the FAILURE, not always-on.
    const slug = freshSlug();
    vi.stubGlobal(
      "fetch",
      makeFetchMock(() => ({ kind: "rows", rows: PRELOAD_ROWS })),
    );

    const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
    render(
      <MemoryRouter initialEntries={[`/solo/${slug}`]}>
        <App />
      </MemoryRouter>,
    );
    await handshake(server);

    // Let the successful preload settle and the gallery mount.
    await waitFor(() => screen.getByTestId("gameboard-stub"));
    expect(screen.queryByTestId("transient-error-banner")).not.toBeInTheDocument();
  });
});
