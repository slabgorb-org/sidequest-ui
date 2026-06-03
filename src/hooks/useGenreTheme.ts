import { useEffect, useRef } from "react";
import { MessageType, type GameMessage } from "@/types/protocol";

const STYLE_TAG_ID = "genre-theme-css";

/**
 * How long after the session connects we wait for the genre `theme_css`
 * SESSION_EVENT before declaring the transport broken. The server emits
 * theme_css immediately on connect; a multi-second silence means it never
 * arrived (the ONE scenario where `--accent` silently collapses to an
 * invisible oklch(0.269) — see `THEME_CSS_FAILURE_BANNER_ID`).
 *
 * Playtest 2026-05-20 — bumped from 4000ms to 8000ms after the beneath_sunden
 * solo path showed the banner flash-then-dismiss when chargen render +
 * theme delivery raced past the 4s window. The race was real but the
 * decision was wrong: theme arrived ~5s after connect on a cold start
 * (chargen scene serialization + WS frame ordering), and the banner
 * appeared then auto-dismissed — confusing for the player. 8s is comfortably
 * past the cold-start tail; a real transport break is still caught loudly.
 */
export const THEME_CSS_GRACE_MS = 8000;

/**
 * DOM id of the loud-failure banner shown when `theme_css` never arrives
 * after connect. Per CLAUDE.md No-Silent-Fallbacks the genre theme failing
 * to load must be *visible*, not a silent degrade to the inherited dark
 * defaults (where `--accent` is 1.39:1 — effectively invisible).
 */
export const THEME_CSS_FAILURE_BANNER_ID = "genre-theme-failure-banner";

/**
 * Parse a CSS color (hex or rgb()) and return its relative luminance (0–1).
 * Returns 0 (dark) if the color can't be parsed.
 */
function getLuminance(color: string): number {
  let r = 0, g = 0, b = 0;
  const hex = color.replace(/\s/g, "");
  if (hex.startsWith("#")) {
    const h = hex.slice(1);
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else if (h.length >= 6) {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
  } else {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      r = parseInt(match[1], 10);
      g = parseInt(match[2], 10);
      b = parseInt(match[3], 10);
    }
  }
  // sRGB relative luminance per WCAG 2.0
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Show the loud-failure banner. Its own styling is hardcoded and theme-
 * independent on purpose — it has to be legible precisely when the genre
 * theme failed to load, so it cannot lean on any `--*` custom property.
 */
function showThemeFailureBanner(): void {
  if (document.getElementById(THEME_CSS_FAILURE_BANNER_ID)) return;
  const banner = document.createElement("div");
  banner.id = THEME_CSS_FAILURE_BANNER_ID;
  banner.setAttribute("role", "alert");
  banner.textContent =
    "⚠ Genre theme failed to load — the UI is showing fallback colors " +
    "(accent text may be near-invisible). The server's theme_css transport " +
    "did not deliver. Check the server connection / genre pack.";
  banner.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "z-index:2147483647",
    "padding:10px 16px",
    "background:#7f1d1d",
    "color:#fff",
    "font:600 13px/1.4 system-ui,sans-serif",
    "text-align:center",
    "border-bottom:2px solid #fca5a5",
    "box-shadow:0 2px 8px rgba(0,0,0,0.5)",
  ].join(";");
  document.body.appendChild(banner);
}

function removeThemeFailureBanner(): void {
  document.getElementById(THEME_CSS_FAILURE_BANNER_ID)?.remove();
}

/**
 * Listens for SESSION_EVENT "theme_css" messages and injects the genre's
 * CSS into a <style> tag in <head>.
 *
 * @param messages   accumulated game messages (only theme_css SESSION_EVENTs
 *                    reach this array — App.tsx drops connected/ready).
 * @param connected   whether the WebSocket session is established. Arms the
 *                    loud-fail guard: once connected, `theme_css` MUST arrive
 *                    within `graceMs` or the transport is declared broken.
 * @param graceMs     grace window before the loud failure fires.
 */
export function useGenreTheme(
  messages: GameMessage[],
  connected: boolean,
  graceMs: number = THEME_CSS_GRACE_MS,
): void {
  const appliedRef = useRef<string | null>(null);
  // True once a genre theme has actually been injected this mount. Read live
  // from the grace-timer callback closure — refs reflect the latest value.
  const everAppliedRef = useRef(false);
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearFailTimer = () => {
      if (failTimerRef.current !== null) {
        clearTimeout(failTimerRef.current);
        failTimerRef.current = null;
      }
    };

    const themeMessages = messages.filter(
      (m) => m.type === MessageType.SESSION_EVENT && m.payload.event === "theme_css",
    );
    const last = themeMessages[themeMessages.length - 1];
    const css = (last?.payload.css as string | undefined) ?? undefined;

    // ---- Loud-fail guard ----------------------------------------------------
    // The genre theme_css SESSION_EVENT never arriving after connect is the
    // ONE scenario where :root[data-genre] is never set, the .dark base wins,
    // and --accent collapses to an invisible oklch(0.269). Per CLAUDE.md
    // No-Silent-Fallbacks this must fail loudly, not degrade in silence.
    clearFailTimer();
    if (everAppliedRef.current || css) {
      // A theme is (about to be) applied — clear any prior failure surface.
      removeThemeFailureBanner();
    } else if (connected) {
      // Connected but no theme yet — arm the guard.
      failTimerRef.current = setTimeout(() => {
        if (everAppliedRef.current) return;
        console.error(
          "[useGenreTheme] genre theme_css never arrived within " +
            `${graceMs}ms of connect — the genre theme is NOT loaded and ` +
            "--accent has silently collapsed to the inherited dark default " +
            "(near-invisible). This is a No-Silent-Fallbacks transport gap.",
          { graceMs, connected },
        );
        showThemeFailureBanner();
      }, graceMs);
    }
    // ------------------------------------------------------------------------

    if (!last || !css) return clearFailTimer;

    // ROOT CAUSE FIX (the recurring "genre text unreadable" bug): the genre's
    // color tokens live in the injected `:root[data-genre] { --accent; --primary;
    // --foreground; ... }` block, which ONLY matches while <html> carries the
    // `data-genre` attribute. That attribute is what lets genre theming win the
    // cascade over `.dark` (`:root[data-genre]` (0,2,0) > `.dark` (0,1,0) on the
    // same element). This effect re-runs on EVERY `messages` change, and the
    // cleanup below strips `data-genre`; the same-css early-return then skipped
    // re-adding it — so the attribute was removed milliseconds after the first
    // theme load and never restored. Result: `:root[data-genre]` stopped matching
    // and every genre color silently collapsed to the `.dark` dark-mode value
    // (--accent → oklch(0.269) ≈ near-black). Re-assert it on every run, BEFORE
    // the early-return, so the attribute persists for the life of the theme.
    const root = document.documentElement;
    root.setAttribute("data-genre", "active");

    // Skip if we already injected this exact CSS (data-genre re-asserted above).
    if (appliedRef.current === css) return clearFailTimer;
    appliedRef.current = css;
    everAppliedRef.current = true;
    removeThemeFailureBanner();

    // Lie-detector: log every theme_css application so we can verify in
    // the browser console that the expected genre theme actually arrived
    // and was applied (vs. silently falling back to the inherited dark
    // mode defaults). See feedback_no_silent_fallbacks.
    console.debug("[useGenreTheme] theme_css received", {
      bytes: css.length,
      preview: css.slice(0, 80),
    });

    let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_TAG_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;

    // Apply the genre's primary font-family as the document base font. The
    // face itself is delivered by the genre CSS's own @font-face rules, which
    // the server has already rewritten to R2 (cdn.slabgorb.com) via the
    // asset_urls seam — there is NO external font CDN and no runtime <link>
    // injection. (Killing the Google-Fonts brain: ADR follow-up 2026-06-03.)
    const fontMatch = css.match(/font-family:\s*'([^']+)'/);
    if (fontMatch) {
      const fontName = fontMatch[1];
      root.style.setProperty("font-family", `'${fontName}', var(--font-sans)`);
    }

    // Parse --background from genre CSS to determine dark/light mode.
    // We parse the CSS string directly rather than using getComputedStyle
    // because the style tag was just injected and we need the genre value,
    // not any inherited/computed value.
    const bgMatch = css.match(/--background\s*:\s*([^;]+);/);
    const bg = bgMatch?.[1].trim();
    if (bg) {
      const lum = getLuminance(bg);
      const isLight = lum > 0.5;
      console.debug("[useGenreTheme] applied", {
        background: bg,
        luminance: lum.toFixed(3),
        mode: isLight ? "light" : "dark",
      });
      if (isLight) {
        root.classList.remove("dark");
      } else {
        root.classList.add("dark");
      }
    } else {
      console.warn(
        "[useGenreTheme] theme_css applied but --background was empty; " +
          "dark/light mode unchanged. Genre CSS likely missing :root vars.",
      );
    }

    return () => {
      clearFailTimer();
      root.removeAttribute("data-genre");
    };
  }, [messages, connected, graceMs]);
}
