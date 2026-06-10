// Story 100-8 (Phase 2) — RED.
//
// The session-free lore reference route (AC1 C2-invariant, AC2, AC4).
// `/reference/lore/:pack/:world` must mount and render with NO WebSocket
// session, NO GameStateProvider, NO auth, NO character selection in scope —
// fetching the public projection JSON over REST and rendering its sections via
// the generic node-tree renderer.
//
// Phase-1 server contract (build_lore_projection):
//   { schema_version, pack, world, sections: [...], theme?: {"--var": value} }
// A generic-YAML section is { id, label, node: <ReferenceNode> }.
//
// Component under test (to be created by Dev in GREEN):
//   src/screens/reference/ReferenceLorePage.tsx → export function ReferenceLorePage()
// reading :pack/:world from the route and fetching
//   GET /reference/api/lore/{pack}/{world}
//
// NOTE: the page component is rendered under a BARE MemoryRouter with no
// session/provider tree. If the component reaches for live game-session state,
// these tests are how we catch it (per spec C2 testing strategy).

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ReferenceLorePage } from "@/screens/reference/ReferenceLorePage";
import type { LoreProjection } from "@/types/reference";

const PACK = "heavy_metal";
const WORLD = "long_foundry";

function loreFixture(): LoreProjection {
  return {
    schema_version: 1,
    pack: PACK,
    world: WORLD,
    sections: [
      {
        id: "legends",
        label: "Legends",
        node: {
          type: "dict",
          entries: [
            {
              key: "founding",
              label: "Founding",
              node: { type: "scalar", value: "The first forge was lit beneath the mountain." },
            },
          ],
        },
      },
    ],
    theme: {
      "--primary": "#c0392b",
      "--background": "#1a1a1a",
    },
  };
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderLoreRoute() {
  return render(
    <MemoryRouter initialEntries={[`/reference/lore/${PACK}/${WORLD}`]}>
      <Routes>
        <Route path="/reference/lore/:pack/:world" element={<ReferenceLorePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReferenceLorePage — session-free lore route (AC1/AC2/AC4)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let wsCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // C2 proof: a session-free surface must never open a game WebSocket.
    wsCtor = vi.fn();
    vi.stubGlobal("WebSocket", wsCtor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders fetched lore content WITHOUT any session/WS provider in scope (C2)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse(loreFixture()));
    renderLoreRoute();
    expect(
      await screen.findByText("The first forge was lit beneath the mountain."),
    ).toBeInTheDocument();
    // Section + entry labels render through the generic node tree.
    expect(screen.getByText("Founding")).toBeInTheDocument();
  });

  it("never constructs a game WebSocket while rendering the reference route (C2)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse(loreFixture()));
    renderLoreRoute();
    await screen.findByText("The first forge was lit beneath the mountain.");
    expect(wsCtor).not.toHaveBeenCalled();
  });

  it("fetches the REST projection endpoint with :pack and :world from the URL (AC4)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse(loreFixture()));
    renderLoreRoute();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calledUrl = String(
      (fetchMock.mock.calls[0]?.[0] as Request | string) instanceof Request
        ? (fetchMock.mock.calls[0]?.[0] as Request).url
        : fetchMock.mock.calls[0]?.[0],
    );
    expect(calledUrl).toContain(`/reference/api/lore/${PACK}/${WORLD}`);
  });

  it("shows a loading indicator before the fetch resolves (AC4)", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
    renderLoreRoute();
    // Pending state: an accessible status node is shown.
    expect(screen.getByRole("status")).toBeInTheDocument();
    // Resolve and confirm content replaces the loader.
    resolve(makeJsonResponse(loreFixture()));
    expect(
      await screen.findByText("The first forge was lit beneath the mountain."),
    ).toBeInTheDocument();
  });

  it("shows an error state (not a white screen) when the fetch rejects (AC4)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderLoreRoute();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an error state when the projection endpoint returns a non-2xx (AC4)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ detail: "boom" }, 500));
    renderLoreRoute();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("does not render keeper-shaped fields even if present in the payload (AC5 defense in depth)", async () => {
    const poisoned = loreFixture();
    // Simulate a server regression leaking a keeper field into a public entry.
    poisoned.sections[0] = {
      id: "legends",
      label: "Legends",
      node: {
        type: "dict",
        entries: [
          {
            key: "founding",
            label: "Founding",
            node: { type: "scalar", value: "Public legend text." },
          },
          {
            key: "_seed_tropes",
            label: "Seed Tropes",
            node: { type: "scalar", value: "KEEPER_LEAK_betrayal_arc" },
          },
        ],
      },
    };
    fetchMock.mockResolvedValue(makeJsonResponse(poisoned));
    renderLoreRoute();
    expect(await screen.findByText("Public legend text.")).toBeInTheDocument();
    expect(screen.queryByText("KEEPER_LEAK_betrayal_arc")).not.toBeInTheDocument();
  });

  it("orders sections for display regardless of server build order (lore layout)", async () => {
    // The server emits sections in build order; the lore page imposes the display
    // sequence (Map, World, Lore, POI, NPC, Timeline, History, Legends, then any
    // unnamed section trailing in server order). Feed a scrambled payload with an
    // unnamed "cultures" section and assert the rendered section headings come out
    // in the configured order, cultures last.
    const node = (v: string) => ({
      type: "dict" as const,
      entries: [{ key: "k", label: "K", node: { type: "scalar" as const, value: v } }],
    });
    const scrambled: LoreProjection = {
      schema_version: 1,
      pack: PACK,
      world: WORLD,
      sections: [
        { id: "history", label: "History", node: node("h") },
        { id: "legends", label: "Legends", node: node("g") },
        { id: "cultures", label: "Cultures", node: node("c") },
        { id: "world", label: "World", node: node("w") },
        { id: "lore", label: "Lore", node: node("o") },
      ],
    };
    fetchMock.mockResolvedValue(makeJsonResponse(scrambled));
    const { container } = renderLoreRoute();
    // Section labels also appear as TOC links since the redesign — query the
    // heading role to disambiguate.
    await screen.findByRole("heading", { name: "World" });
    const labels = Array.from(
      container.querySelectorAll(".reference-section__label"),
    ).map((el) => el.textContent);
    expect(labels).toEqual(["World", "Lore", "History", "Legends", "Cultures"]);
  });
});
