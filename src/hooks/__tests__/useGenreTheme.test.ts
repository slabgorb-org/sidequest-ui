import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useGenreTheme,
  THEME_CSS_GRACE_MS,
  THEME_CSS_FAILURE_BANNER_ID,
} from "@/hooks/useGenreTheme";
import { MessageType, type GameMessage } from "@/types/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionEvent(
  event: string,
  extra?: Record<string, unknown>,
): GameMessage {
  return {
    type: MessageType.SESSION_EVENT,
    payload: { event, ...extra },
    player_id: "server",
  };
}

const SAMPLE_CSS = ":root { --primary: 210 40% 30%; font-family: Cinzel; }";
const OTHER_CSS = ":root { --primary: 30 80% 50%; font-family: Rajdhani; }";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useGenreTheme", () => {
  beforeEach(() => {
    // Clean up any injected style tags
    document.getElementById("genre-theme-css")?.remove();
  });

  afterEach(() => {
    document.getElementById("genre-theme-css")?.remove();
    document.documentElement.removeAttribute("data-genre");
  });

  it("does nothing when messages array is empty", () => {
    renderHook(() => useGenreTheme([], false));
    expect(document.getElementById("genre-theme-css")).toBeNull();
  });

  it("injects CSS from theme_css event into a style tag", () => {
    const msg = makeSessionEvent("theme_css", { css: SAMPLE_CSS });
    renderHook(() => useGenreTheme([msg], true));

    const styleEl = document.getElementById("genre-theme-css") as HTMLStyleElement;
    expect(styleEl).not.toBeNull();
    expect(styleEl.textContent).toBe(SAMPLE_CSS);
  });

  it("ignores SESSION_EVENT with non-theme_css events", () => {
    const leaveMsg = makeSessionEvent("leave");
    renderHook(() => useGenreTheme([leaveMsg], false));
    expect(document.getElementById("genre-theme-css")).toBeNull();
  });

  it("ignores non-SESSION_EVENT messages", () => {
    const narration: GameMessage = {
      type: MessageType.NARRATION,
      payload: { text: "The wind howls." },
      player_id: "server",
    };
    renderHook(() => useGenreTheme([narration], false));
    expect(document.getElementById("genre-theme-css")).toBeNull();
  });

  it("handles theme_css event with missing css gracefully", () => {
    const noCSS = makeSessionEvent("theme_css");
    renderHook(() => useGenreTheme([noCSS], false));
    expect(document.getElementById("genre-theme-css")).toBeNull();
  });

  it("sets data-genre attribute on documentElement when theme_css is applied", () => {
    const msg = makeSessionEvent("theme_css", { css: SAMPLE_CSS });
    renderHook(() => useGenreTheme([msg], true));
    expect(document.documentElement.getAttribute("data-genre")).toBe("active");
  });

  it("removes data-genre attribute on cleanup", () => {
    const msg = makeSessionEvent("theme_css", { css: SAMPLE_CSS });
    const { unmount } = renderHook(() => useGenreTheme([msg], true));
    expect(document.documentElement.getAttribute("data-genre")).toBe("active");
    unmount();
    expect(document.documentElement.getAttribute("data-genre")).toBeNull();
  });

  it("keeps data-genre set across re-renders after the same theme_css (regression: message churn must not strip it)", () => {
    // Root-cause regression. The effect depends on `messages`, which changes on
    // EVERY game message during play, so it re-runs constantly. The cleanup
    // removes `data-genre`, and the same-css early-return skipped re-adding it —
    // so the attribute was stripped milliseconds after the first theme load and
    // never restored. With it gone, `:root[data-genre] { --accent; ... }` stops
    // matching and every genre color silently collapses to the `.dark` dark-mode
    // value (--accent → near-black). The attribute MUST persist for the life of
    // the applied theme, across arbitrary re-renders.
    const theme = makeSessionEvent("theme_css", { css: SAMPLE_CSS });
    const narration: GameMessage = {
      type: MessageType.NARRATION,
      payload: { text: "The console glows." },
      player_id: "server",
    };
    const { rerender } = renderHook(
      ({ msgs }: { msgs: GameMessage[] }) => useGenreTheme(msgs, true),
      { initialProps: { msgs: [theme] as GameMessage[] } },
    );
    expect(document.documentElement.getAttribute("data-genre")).toBe("active");

    // Simulate ongoing play: more messages arrive, the theme_css is unchanged.
    rerender({ msgs: [theme, narration] });
    expect(document.documentElement.getAttribute("data-genre")).toBe("active");

    rerender({ msgs: [theme, narration, narration] });
    expect(document.documentElement.getAttribute("data-genre")).toBe("active");
  });

  it("does NOT inject any Google Fonts <link> when applying theme_css (fonts come from R2 @font-face)", () => {
    // Quoted family exercises the (now-retired) dynamic font path.
    const css =
      ":root[data-genre]{--primary:#111;}" +
      "@font-face{font-family:'Cinzel';" +
      "src:url('genre_packs/assets/fonts/Cinzel-Regular.woff2') format('woff2');}";
    const msg = makeSessionEvent("theme_css", { css });
    renderHook(() => useGenreTheme([msg], true));

    // The retired dynamic-injection brain used id="genre-google-font".
    expect(document.getElementById("genre-google-font")).toBeNull();
    const googleLinks = Array.from(
      document.querySelectorAll('link[href*="googleapis"], link[href*="gstatic"]'),
    );
    expect(googleLinks).toHaveLength(0);
  });

  it("still applies the genre font-family to :root when theme_css carries one", () => {
    const css =
      ":root[data-genre]{--primary:#111;}" +
      "@font-face{font-family:'Cinzel';" +
      "src:url('genre_packs/assets/fonts/Cinzel-Regular.woff2') format('woff2');}";
    const msg = makeSessionEvent("theme_css", { css });
    renderHook(() => useGenreTheme([msg], true));
    // The base document font should be set to the genre face (which itself
    // loads via the injected @font-face from R2).
    expect(document.documentElement.style.getPropertyValue("font-family")).toContain(
      "Cinzel",
    );
  });

  it("updates CSS when a new theme_css event arrives", () => {
    const first = makeSessionEvent("theme_css", { css: SAMPLE_CSS });
    const { rerender } = renderHook(
      ({ msgs }: { msgs: GameMessage[] }) => useGenreTheme(msgs, true),
      { initialProps: { msgs: [first] } },
    );

    expect(
      (document.getElementById("genre-theme-css") as HTMLStyleElement).textContent,
    ).toBe(SAMPLE_CSS);

    const second = makeSessionEvent("theme_css", { css: OTHER_CSS });
    rerender({ msgs: [first, second] });

    expect(
      (document.getElementById("genre-theme-css") as HTMLStyleElement).textContent,
    ).toBe(OTHER_CSS);
  });
});

// ---------------------------------------------------------------------------
// Loud-fail guard: the genre theme_css SESSION_EVENT never arriving after the
// session connects is the ONE scenario where --accent silently collapses to an
// invisible oklch(0.269). Per CLAUDE.md No-Silent-Fallbacks the transport must
// fail loudly (console.error + a visible banner), not degrade in silence.
// (sq-playtest-pingpong [BS-BUG] "theme_css transport has no loud-fail")
// ---------------------------------------------------------------------------

describe("useGenreTheme — loud-fail when theme_css never arrives after connect", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    errorSpy.mockRestore();
    document.getElementById("genre-theme-css")?.remove();
    document.getElementById(THEME_CSS_FAILURE_BANNER_ID)?.remove();
    document.documentElement.removeAttribute("data-genre");
  });

  it("fires console.error + a visible role=alert banner when connected but no theme_css within the grace window", () => {
    renderHook(() => useGenreTheme([], true));

    // Before the grace window elapses: no failure yet.
    vi.advanceTimersByTime(THEME_CSS_GRACE_MS - 1);
    expect(document.getElementById(THEME_CSS_FAILURE_BANNER_ID)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();

    // Grace window elapses with no theme_css → loud failure.
    vi.advanceTimersByTime(2);

    const banner = document.getElementById(THEME_CSS_FAILURE_BANNER_ID);
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute("role")).toBe("alert");
    expect(banner?.textContent).toMatch(/theme/i);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[useGenreTheme]"),
      expect.anything(),
    );
  });

  it("does NOT fire when theme_css arrives before the grace window elapses", () => {
    const themeMsg = makeSessionEvent("theme_css", { css: SAMPLE_CSS });
    const { rerender } = renderHook(
      ({ msgs }: { msgs: GameMessage[] }) => useGenreTheme(msgs, true),
      { initialProps: { msgs: [] as GameMessage[] } },
    );

    vi.advanceTimersByTime(THEME_CSS_GRACE_MS - 100);
    rerender({ msgs: [themeMsg] });
    vi.advanceTimersByTime(500);

    expect(document.getElementById(THEME_CSS_FAILURE_BANNER_ID)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(
      (document.getElementById("genre-theme-css") as HTMLStyleElement).textContent,
    ).toBe(SAMPLE_CSS);
  });

  it("does NOT fire while still connecting (connected=false) even past the grace window", () => {
    renderHook(() => useGenreTheme([], false));
    vi.advanceTimersByTime(THEME_CSS_GRACE_MS * 3);

    expect(document.getElementById(THEME_CSS_FAILURE_BANNER_ID)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("removes the failure banner if theme_css arrives after the banner was shown (recovery)", () => {
    const themeMsg = makeSessionEvent("theme_css", { css: SAMPLE_CSS });
    const { rerender } = renderHook(
      ({ msgs }: { msgs: GameMessage[] }) => useGenreTheme(msgs, true),
      { initialProps: { msgs: [] as GameMessage[] } },
    );

    vi.advanceTimersByTime(THEME_CSS_GRACE_MS + 1);
    expect(document.getElementById(THEME_CSS_FAILURE_BANNER_ID)).not.toBeNull();

    rerender({ msgs: [themeMsg] });
    expect(document.getElementById(THEME_CSS_FAILURE_BANNER_ID)).toBeNull();
  });
});
