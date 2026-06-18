// Story 100-8 (Phase 2) — RED.
//
// The session-free rules reference route (AC1 C2, AC2, AC4). The rules page is
// the pack-tier rulebook — per-pack, no :world — fetching
//   GET /reference/api/rules/{pack}
// and rendering its generic-YAML sections via the shared node-tree renderer.
//
// Phase-1 server contract (build_rules_projection):
//   { schema_version, pack, sections: [...], theme?: {"--var": value} }   (no `world`)
//
// Component under test (to be created by Dev in GREEN):
//   src/screens/reference/ReferenceRulesPage.tsx → export function ReferenceRulesPage()

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ReferenceRulesPage } from "@/screens/reference/ReferenceRulesPage";
import type { RulesProjection } from "@/types/reference";

const PACK = "heavy_metal";

function rulesFixture(): RulesProjection {
  return {
    schema_version: 1,
    pack: PACK,
    sections: [
      {
        id: "rules",
        label: "Rules",
        node: {
          type: "dict",
          entries: [
            {
              key: "combat",
              label: "Combat",
              node: { type: "scalar", value: "Strike resolves on the lethality track." },
            },
          ],
        },
      },
    ],
    theme: { "--primary": "#c0392b" },
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

describe("ReferenceRulesPage — session-free rules route (AC1/AC2/AC4)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let wsCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    wsCtor = vi.fn();
    vi.stubGlobal("WebSocket", wsCtor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders fetched rules content with no session/WS provider in scope (C2)", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(makeJsonResponse(rulesFixture()));
    renderRulesRoute();
    // The "Rules" section label (trigger) lands once the projection is fetched…
    const trigger = await screen.findByRole("button", { name: /Rules/i });
    // …and expanding it reveals the node-tree body (2026-06-17: collapsed by default).
    await user.click(trigger);
    expect(await screen.findByText("Combat")).toBeInTheDocument();
    expect(
      screen.getByText("Strike resolves on the lethality track."),
    ).toBeInTheDocument();
    expect(wsCtor).not.toHaveBeenCalled();
  });

  it("fetches the pack-tier REST endpoint using :pack from the URL (AC4)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse(rulesFixture()));
    renderRulesRoute();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calledUrl = String(
      (fetchMock.mock.calls[0]?.[0] as Request | string) instanceof Request
        ? (fetchMock.mock.calls[0]?.[0] as Request).url
        : fetchMock.mock.calls[0]?.[0],
    );
    expect(calledUrl).toContain(`/reference/api/rules/${PACK}`);
    // Pack-tier: the lore world segment must NOT appear in the rules fetch.
    expect(calledUrl).not.toContain("/reference/api/lore/");
  });

  it("shows an error state (not a white screen) when the fetch fails (AC4)", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ detail: "nope" }, 500));
    renderRulesRoute();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
