/**
 * Standing Folio lobby — AC8-gap + parked-item closure (story 83-2, RED phase).
 *
 * Follow-up to 83-1. Covers the two load-bearing AC8 gaps that shipped
 * incomplete on the merged Standing Folio, plus the parked implementation
 * items and the cold-mount flash-of-error. Authored by The Architect (TEA).
 *
 * ── jsdom / runtime caveat (READ THIS before "fixing" a failing test) ──
 * jsdom does NOT evaluate CSS media queries or apply Tailwind responsive /
 * `motion-reduce:` variants — it has no layout engine. The repo ships NO
 * Playwright/browser harness (package.json: `vitest run` only), so AC1
 * (breakpoints) and AC2 (reduced-motion) cannot be verified by observing real
 * layout/animation here. These tests assert the STATIC PROXY: that the correct
 * breakpoint numbers and `motion-reduce:` guards are present in the rendered
 * className / CSS source. True behavioral verification needs a browser — logged
 * as a Delivery Finding + Design Deviation in the session. Do not "satisfy"
 * these by faking the class string; satisfy them by writing the real Tailwind.
 *
 * Contract test-hooks the implementation must expose (documented per the 83-1
 * convention):
 *   - data-testid="lobby-accent-root"   — the `.lobby-folio` root (AC3c); the
 *                                          element tokens.css keys the accent off
 *   - data-testid="lobby-worlds-loading"— neutral cold-mount loading state shown
 *                                          while the genres fetch is in flight (AC4)
 * Existing hooks reused: lobby-folio, lobby-start-button, world-hero-spinner,
 * world-hero-frame, world-preview-card, lobby-hero.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ConnectScreen } from "@/screens/ConnectScreen";
import type { GenresResponse } from "@/types/genres";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";

// ── Fixtures ───────────────────────────────────────────────────────────────

// tea_and_murder is the FIRST key → the default-open genre (server insertion
// order; the lobby does not alphabetise). `avely` carries a hero_image so
// WorldPreview enters its `loading` image state and renders the animated
// spinner + pulsing frame the reduced-motion AC must guard.
const GENRES: GenresResponse = {
  tea_and_murder: {
    name: "Tea & Murder",
    description: "Cosy mysteries with a body in the rose garden.",
    worlds: [
      {
        slug: "avely",
        name: "Avely",
        description: "A country weekend, a guest list of suspects, and a corpse.",
        era: "Edwardian England · c. 1908",
        setting: "A country house",
        inspirations: ["Agatha Christie"],
        axis_snapshot: { cosy: 0.9 },
        hero_image: "https://example.test/avely-hero.png",
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
        description: "Nothing but dust and engines.",
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

function renderConnect(props: Parameters<typeof ConnectScreen>[0]) {
  return render(
    <MemoryRouter>
      <ConnectScreen {...props} />
    </MemoryRouter>,
  );
}

/** fetch stub: sessions empty, /dev/scenes ok-empty, everything else ok-{}. */
function mockFetchOk() {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.startsWith("/api/sessions")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
    }
    if (typeof url === "string" && url === "/dev/scenes") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

// __dirname = <ui>/src/screens/__tests__ → up three to the UI root.
const UI_ROOT = resolve(__dirname, "../../..");
const readSrc = (rel: string) => readFileSync(resolve(UI_ROOT, rel), "utf-8");

/**
 * True if `className` carries an arbitrary-value breakpoint at `px`
 * (e.g. `max-[880px]:grid-cols-1`) OR `cssText` registers a Tailwind v4
 * custom breakpoint at that pixel value (`--breakpoint-folio: 880px`).
 * Accepts either mechanism — the spec says "match the numbers, not the
 * mechanism".
 */
function referencesBreakpoint(className: string, px: number, cssText: string): boolean {
  if (className.includes(`${px}px`)) return true;
  return new RegExp(`--breakpoint-[\\w-]+:\\s*${px}px`).test(cssText);
}

// ════════════════════════════════════════════════════════════════════════════
// AC1 — Breakpoints match the 83-1 AC8 spec (880 / 560), not Tailwind defaults
// ════════════════════════════════════════════════════════════════════════════
describe("AC1 — responsive breakpoints (880 / 560)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchOk();
  });

  it("collapses the folio card to single-column at <=880px, not the md (768) default", () => {
    renderConnect({ genres: GENRES });
    const folio = screen.getByTestId("lobby-folio");
    const cls = folio.className;

    // The shipped bug: the two-pane grid switches at md (768px). It must not.
    expect(
      cls,
      "folio card still uses the md (768px) default — AC8 spec'd the single-column collapse at <=880px",
    ).not.toContain("md:grid-cols-[296px_1fr]");

    // And the 880 breakpoint must drive the collapse (arbitrary value or a
    // registered v4 --breakpoint; see referencesBreakpoint).
    const lobbyCss = readSrc("src/styles/lobby-folio.css") + readSrc("src/index.css");
    expect(
      referencesBreakpoint(cls, 880, lobbyCss),
      "folio card must switch to single-column at the 880px boundary",
    ).toBe(true);
  });

  it("makes the Start button full-width via the <=560px breakpoint, not the sm (640) default", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });
    // Select a world so the commit row is fully live (Start enabled).
    await user.click(screen.getByRole("radio", { name: /avely/i }));

    const start = screen.getByTestId("lobby-start-button");
    const cls = start.className;
    const lobbyCss = readSrc("src/styles/lobby-folio.css") + readSrc("src/index.css");

    expect(
      cls.includes("sm:"),
      "Start button uses an sm (640px) default — AC8 spec'd the full-width stack at <=560px",
    ).toBe(false);
    expect(
      referencesBreakpoint(cls, 560, lobbyCss),
      "Start button must go full-width at the 560px boundary (stacked commit row)",
    ).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AC2 — prefers-reduced-motion respected on the looping animations
// ════════════════════════════════════════════════════════════════════════════
describe("AC2 — reduced-motion guards on looping animations", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchOk();
  });

  it("guards the WorldPreview image spinner (animate-spin) with motion-reduce", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });
    await user.click(screen.getByRole("radio", { name: /avely/i }));

    // avely has a hero_image → imageStatus 'loading' → spinner is mounted.
    const spinner = screen.getByTestId("world-hero-spinner");
    expect(spinner.className).toContain("animate-spin");
    expect(
      spinner.className,
      "the image spinner loops forever under prefers-reduced-motion: reduce — needs motion-reduce:animate-none",
    ).toContain("motion-reduce:animate-none");
  });

  it("guards the WorldPreview loading-skeleton pulse (animate-pulse) with motion-reduce", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });
    await user.click(screen.getByRole("radio", { name: /avely/i }));

    const frame = screen.getByTestId("world-hero-frame");
    expect(frame.className).toContain("animate-pulse");
    expect(
      frame.className,
      "the loading-skeleton pulse ignores reduced-motion — needs motion-reduce:animate-none",
    ).toContain("motion-reduce:animate-none");
  });

  it("guards the connecting-state pulse text (animate-pulse) with motion-reduce", () => {
    renderConnect({ genres: GENRES, isConnecting: true });
    const status = screen.getByText(/the pages are turning/i);
    expect(status.className).toContain("animate-pulse");
    expect(
      status.className,
      "the connecting-state pulse ignores reduced-motion — needs motion-reduce:animate-none",
    ).toContain("motion-reduce:animate-none");
  });

  it("never strands content at opacity:0 as a base style waiting on an entrance animation", () => {
    // Reduced-motion end-state rule: any element that fades IN must be visible
    // at rest. Guard against a regression that adds `opacity-0` as a base class
    // (the bug the designer hit in the prototype). The hero <img> uses an
    // imperative onLoad opacity bump (opacity-0 + transition) which is fine —
    // it is not gated on a looping animation — so we scope this to the lobby
    // SHELL markup, not the prop-driven image.
    const { container } = renderConnect({ genres: GENRES });
    const stranded = Array.from(container.querySelectorAll<HTMLElement>("[class*='opacity-0']"))
      .filter((el) => el.getAttribute("data-testid") !== undefined)
      .filter((el) => {
        const c = el.className;
        // An opacity-0 base is only safe if a motion-reduce / no-preference
        // guard restores it, or a transition reveals it without animation gating.
        return !c.includes("motion-reduce:opacity-100") && !c.includes("transition");
      });
    expect(
      stranded,
      "lobby shell has element(s) stuck at opacity:0 with no reduced-motion fallback",
    ).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AC3 — parked items
// ════════════════════════════════════════════════════════════════════════════
describe("AC3a — Pirata One bound to the lobby wordmark", () => {
  it("points the .lobby-wordmark font-family at Pirata One (not the house-serif fallback)", () => {
    const css = readSrc("src/styles/lobby-folio.css");
    // Isolate the .lobby-wordmark rule block.
    const rule = css.match(/\.lobby-folio\s+\.lobby-wordmark\s*\{[^}]*\}/);
    expect(rule, ".lobby-wordmark rule not found in lobby-folio.css").not.toBeNull();
    expect(
      rule![0],
      "the wordmark still falls back to the house heading serif — bind it to the self-hosted Pirata One face",
    ).toContain("Pirata One");
  });

  it("keeps the self-hosted Pirata One @font-face declared (regression guard)", () => {
    const fontsCss = readSrc("src/styles/fonts.css");
    expect(fontsCss).toContain('font-family: "Pirata One"');
    // Self-hosted, not a Google CDN.
    expect(fontsCss).not.toMatch(/fonts\.googleapis\.com/);
  });
});

describe("AC3b — No Silent Fallbacks: warn on the three swallowed catches", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    localStorage.clear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("warns when the /dev/scenes fetch fails instead of swallowing it", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.startsWith("/api/sessions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
      }
      if (typeof url === "string" && url === "/dev/scenes") {
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    renderConnect({ genres: GENRES });
    await waitFor(() =>
      expect(
        warnSpy,
        "the /dev/scenes catch swallows the error silently — warn per No Silent Fallbacks",
      ).toHaveBeenCalled(),
    );
  });

  it("warns when loadSavedState fails to read localStorage instead of swallowing it", () => {
    mockFetchOk();
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    try {
      renderConnect({ genres: GENRES });
    } finally {
      getItemSpy.mockRestore();
    }
    expect(
      warnSpy,
      "loadSavedState catch swallows the read error silently — warn per No Silent Fallbacks",
    ).toHaveBeenCalled();
  });

  it("warns inside the saveState catch (source-level — saveState is not directly triggerable)", () => {
    const src = readSrc("src/screens/ConnectScreen.tsx");
    const fn = src.match(/function\s+saveState\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
    expect(fn, "saveState function not found").not.toBeNull();
    expect(
      fn![0],
      "saveState catch swallows localStorage write failures silently — warn per No Silent Fallbacks",
    ).toContain("console.warn");
  });
});

describe("AC3c — data-testid=lobby-accent-root on the accent root", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchOk();
  });

  it("tags the .lobby-folio root with the accent-root testid", () => {
    const { container } = renderConnect({ genres: GENRES });
    const root = container.querySelector(".lobby-folio");
    expect(root).not.toBeNull();
    expect(
      root,
      "the .lobby-folio accent root must carry data-testid=lobby-accent-root for stable accent assertions",
    ).toHaveAttribute("data-testid", "lobby-accent-root");
  });

  it("shifts the accent-root [data-genre] to the selected world's genre (hardened via testid)", async () => {
    const user = userEvent.setup();
    renderConnect({ genres: GENRES });

    const root = screen.getByTestId("lobby-accent-root");
    // No selection yet → no accent scope on the root.
    expect(root).not.toHaveAttribute("data-genre");

    await user.click(screen.getByRole("radio", { name: /avely/i }));
    expect(root).toHaveAttribute("data-genre", "tea_and_murder");

    await user.click(screen.getByRole("button", { name: /road warrior/i }));
    await user.click(screen.getByRole("radio", { name: /wasteland/i }));
    expect(root).toHaveAttribute("data-genre", "road_warrior");
  });
});

describe("AC3d — stale removed-pack genre cannot wedge the accordion open on nothing", () => {
  beforeEach(() => mockFetchOk());

  it("falls back to the first live genre when the saved genre's pack was removed", () => {
    localStorage.clear();
    // Saved genre points at a pack no longer in the live catalogue.
    localStorage.setItem(
      "sidequest-connect",
      JSON.stringify({ playerName: "Keith", genre: "deleted_pack", world: "ghost" }),
    );

    // NOTE (RED): today this THROWS — `getArchetypeForGenre(genreSlug)` in
    // ConnectScreen rejects the dead slug and the lobby crashes, broader than
    // the spec's "wedge open" wording. The guard must sanitize the stale
    // selected `genreSlug` at the source so BOTH the archetype lookup and
    // `effectiveOpenGenre` self-correct to the first live genre — not just
    // patch effectiveOpenGenre. (Logged as a Delivery Finding.)
    renderConnect({ genres: GENRES });

    // effectiveOpenGenre must self-correct to the first live genre
    // (tea_and_murder) rather than holding open a genre that does not exist.
    const firstGenre = screen.getByRole("button", { name: /tea & murder/i });
    expect(
      firstGenre,
      "a removed saved-genre leaves the accordion wedged open on nothing — guard effectiveOpenGenre",
    ).toHaveAttribute("aria-expanded", "true");
    // The first live genre's worlds are therefore reachable.
    expect(screen.getByRole("radio", { name: /avely/i })).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AC4 — cold-mount worlds fetch shows a loading state, not the error flash
// ════════════════════════════════════════════════════════════════════════════
describe("AC4 — cold-mount loading state (no flash-of-error)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchOk();
  });

  it("shows a neutral loading state (not the error) while genres are still loading", () => {
    // Cold mount: App passes genres={} with genreError=false while /api/genres
    // is in flight. The lobby must NOT claim the server is down.
    renderConnect({ genres: {}, genreError: false });

    expect(
      screen.queryByText(/could not load worlds/i),
      "cold mount flashes the load-error before the genres fetch settles",
    ).toBeNull();
    expect(
      screen.getByTestId("lobby-worlds-loading"),
      "cold mount must show a neutral loading state while genres are in flight",
    ).toBeInTheDocument();
  });

  it("shows the load-error only on a genuine failure (genreError=true)", () => {
    renderConnect({ genres: {}, genreError: true });

    expect(screen.getByText(/could not load worlds/i)).toBeInTheDocument();
    expect(screen.queryByTestId("lobby-worlds-loading")).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Wiring — the cold-mount loading state is reachable from the real App route
// (CLAUDE.md: every suite needs an integration test proving production wiring)
// ════════════════════════════════════════════════════════════════════════════
describe("Wiring: App cold-mount does not flash the genres load-error", () => {
  beforeEach(() => {
    AudioEngine.resetInstance();
    installWebAudioMock();
    installLocalStorageMock();
    // /api/genres never resolves → reproduce the in-flight cold mount.
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.startsWith("/api/genres")) {
        return new Promise(() => {}); // pending forever
      }
      if (typeof url === "string" && url.startsWith("/api/sessions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    AudioEngine.resetInstance();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the loading state, not the error, on first paint with genres in flight", async () => {
    const { default: App } = await import("@/App");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    // The lobby is up (name ritual present) but the worlds region is loading.
    expect(screen.getByLabelText(/player name/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load worlds/i)).toBeNull();
    expect(screen.getByTestId("lobby-worlds-loading")).toBeInTheDocument();
  });
});
