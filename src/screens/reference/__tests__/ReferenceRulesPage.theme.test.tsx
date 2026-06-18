// Story 100-12 (Phase 4) — RED. WIRING test (CLAUDE.md: every suite needs one).
//
// Folds in the DEFERRED 100-9 finding: today only ReferenceLorePage applies the
// session-free theme injector; ReferenceRulesPage does NOT, so /reference/rules/*
// renders UNTHEMED. The server already attaches the same `theme` token dict to the
// rules projection (reference_routes.py rules_api → build_theme_tokens), so the
// only gap is the client wiring.
//
// This test currently FAILS because ReferenceRulesPage does not yet consume
// `data.theme`. Dev wires `useThemeTokens(data?.theme)` into the page in GREEN —
// mirroring ReferenceLorePage exactly (same hook, same unmount cleanup).

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ReferenceRulesPage } from "@/screens/reference/ReferenceRulesPage";
import type { RulesProjection } from "@/types/reference";

const PACK = "space_opera";

function rulesFixtureWithTheme(): RulesProjection {
  return {
    schema_version: 1,
    pack: PACK,
    sections: [
      {
        id: "combat",
        label: "Combat",
        node: {
          type: "dict",
          entries: [
            {
              key: "strike",
              label: "Strike",
              node: { type: "scalar", value: "Strike resolves on the lethality track." },
            },
          ],
        },
      },
    ],
    theme: {
      "--primary": "#4a90d9",
      "--background": "#0d1117",
    },
  };
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderRulesRoute() {
  return render(
    <MemoryRouter initialEntries={[`/reference/rules/${PACK}`]}>
      <Routes>
        <Route path="/reference/rules/:pack" element={<ReferenceRulesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function rootVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name).trim();
}

describe("ReferenceRulesPage — theme injector wiring (100-9 deferred finding)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let wsCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Session-free surface must never open a game WebSocket to theme itself.
    wsCtor = vi.fn();
    vi.stubGlobal("WebSocket", wsCtor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--background");
  });

  it("applies the rules projection theme dict to :root from REST, with NO WebSocket", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse(rulesFixtureWithTheme()));
    renderRulesRoute();

    // Content lands first… (2026-06-17: sections collapse by default, so the
    // projection's arrival is proven by the section label/trigger, not the
    // now-collapsed body prose).
    await screen.findByRole("heading", { name: /Combat/ });
    // …then the theme tokens are applied to :root (the rules page must theme too).
    await waitFor(() => expect(rootVar("--primary")).toBe("#4a90d9"));
    expect(rootVar("--background")).toBe("#0d1117");
    expect(wsCtor).not.toHaveBeenCalled();
  });

  it("removes the applied theme vars on unmount (no leak into lobby / in-game theme)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse(rulesFixtureWithTheme()));
    const { unmount } = renderRulesRoute();
    await waitFor(() => expect(rootVar("--primary")).toBe("#4a90d9"));

    unmount();
    expect(rootVar("--primary")).toBe("");
    expect(rootVar("--background")).toBe("");
  });
});
