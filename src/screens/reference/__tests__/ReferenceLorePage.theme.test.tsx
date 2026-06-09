// Story 100-9 (Phase 2) — RED. WIRING test (CLAUDE.md: every suite needs one).
//
// Proves the session-free theme injector (useThemeTokens) is actually WIRED
// into the reference page production path — not merely unit-tested in
// isolation. ReferenceLorePage fetches the public projection over REST and
// MUST apply the projection's `theme` token dict to :root so the reference
// content is themed per-pack, with NO WebSocket session in scope.
//
// This test currently FAILS because ReferenceLorePage does not yet consume
// `data.theme`. Dev wires `useThemeTokens(data?.theme)` into the page in GREEN.

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ReferenceLorePage } from "@/screens/reference/ReferenceLorePage";
import type { LoreProjection } from "@/types/reference";

const PACK = "heavy_metal";
const WORLD = "long_foundry";

function loreFixtureWithTheme(): LoreProjection {
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

function rootVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name).trim();
}

describe("ReferenceLorePage — theme injector wiring (C3)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let wsCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // C3 proof: a session-free surface must never open a game WebSocket to
    // theme itself — the theme comes from the REST projection JSON.
    wsCtor = vi.fn();
    vi.stubGlobal("WebSocket", wsCtor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Strip fixture vars so the shared :root does not leak across tests.
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--background");
  });

  it("applies the projection theme dict to :root from REST, with NO WebSocket (C3)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse(loreFixtureWithTheme()));
    renderLoreRoute();

    // Content lands first…
    await screen.findByText("The first forge was lit beneath the mountain.");
    // …then the theme tokens are applied to :root.
    await waitFor(() => expect(rootVar("--primary")).toBe("#c0392b"));
    expect(rootVar("--background")).toBe("#1a1a1a");
    // The theme was applied without ever constructing a game WebSocket.
    expect(wsCtor).not.toHaveBeenCalled();
  });

  it("removes the applied theme vars on unmount (no leak into lobby / in-game theme)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse(loreFixtureWithTheme()));
    const { unmount } = renderLoreRoute();
    await waitFor(() => expect(rootVar("--primary")).toBe("#c0392b"));

    unmount();
    expect(rootVar("--primary")).toBe("");
    expect(rootVar("--background")).toBe("");
  });
});
