/**
 * ScrapbookGallery — render_status indicator tests (Story 45-30 AC5).
 *
 * Pre-story the gallery flips on `hasImage` only. That collapses three
 * distinct states into two — "image landed" vs "no image" — and the UI
 * cannot distinguish:
 *
 *   - `rendered`        — image landed (or is in flight, async)
 *   - `skipped_policy`  — server's render trigger policy returned
 *                         `none_policy` (banter / no narrative weight).
 *                         Eligible by spec, intentionally not rendered.
 *   - `failed`          — render was eligible AND dispatched, but the
 *                         daemon path refused (offline, error).
 *
 * The pre-story "no image" placeholder echoes "no scenes yet" empty-state
 * language, which reads as "scene captured, no illustration yet" — the
 * UI cannot tell Sebastien (mechanical-first) WHY no image landed, only
 * that none did. After this story, three distinct visual + a11y states
 * exist, none of which resemble the empty-state glyph.
 *
 * The `render_status` field on `ScrapbookEntry` (sourced from the server's
 * `ScrapbookEntryPayload`) is the wire under test from the UI side. These
 * tests fail at TYPE level until ScrapbookEntry / GalleryImage gain the
 * field, AND fail at DOM level until ScrapbookGallery branches on it.
 *
 * Per CLAUDE.md "no silent fallbacks": each render_status renders a
 * distinct, intentional visual element with an a11y label that names the
 * state aloud — never a generic "no image" glyph.
 */
import { render, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  ScrapbookGallery,
  type ScrapbookEntry,
} from "../ScrapbookGallery";

function entryWithStatus(
  render_status: "rendered" | "skipped_policy" | "failed",
  overrides: Partial<ScrapbookEntry> = {},
): ScrapbookEntry {
  // For `rendered`, supply a real image URL — the gallery's `hasImage`
  // branch must still light up. For the other two, omit the URL: the
  // pre-story behaviour rendered an empty placeholder, and these tests
  // assert the new branches replace that placeholder distinctly.
  const base: ScrapbookEntry = {
    url: render_status === "rendered" ? "https://example.invalid/img.webp" : "",
    timestamp: 0,
    isHandout: false,
    render_id: `r-${render_status}`,
    turn_number: 1,
    scene_name: `Turn 1 — ${render_status}`,
    location: "The Glass Flats",
    // The new field — added to ScrapbookEntry / GalleryImage as part of
    // this story. Until that lands the test fails at TS compile.
    render_status,
    ...overrides,
  };
  return base;
}

describe("ScrapbookGallery — render_status indicator (story 45-30)", () => {
  it("renders a distinct DOM element for skipped_policy entries", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("skipped_policy")];
    const { getByTestId, queryByTestId } = render(
      <ScrapbookGallery images={images} />,
    );

    // Distinct test id, not the legacy `no-image` placeholder used for
    // pre-story metadata-only entries.
    const indicator = getByTestId(
      "scrapbook-entry-r-skipped_policy-render-status-skipped",
    );
    expect(indicator).toBeTruthy();

    // The pre-story `no-image` placeholder must NOT appear for
    // skipped_policy entries — that affordance read as "scene captured,
    // no illustration yet" which is the wrong story for "policy
    // intentionally chose not to render".
    expect(
      queryByTestId("scrapbook-entry-r-skipped_policy-no-image"),
    ).toBeNull();
  });

  it("renders a distinct DOM element for failed entries", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("failed")];
    const { getByTestId, queryByTestId } = render(
      <ScrapbookGallery images={images} />,
    );

    const indicator = getByTestId(
      "scrapbook-entry-r-failed-render-status-failed",
    );
    expect(indicator).toBeTruthy();
    expect(queryByTestId("scrapbook-entry-r-failed-no-image")).toBeNull();
  });

  it("uses different DOM nodes for skipped_policy vs failed", () => {
    // Both states ship in the same gallery; their indicators MUST be
    // distinguishable by data-testid, not just by class. Sebastien
    // (mechanical-first) needs to read the GM panel and the gallery
    // and reach the same conclusion about WHY a turn has no image.
    const images: ScrapbookEntry[] = [
      entryWithStatus("skipped_policy"),
      entryWithStatus("failed"),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);

    const skipped = getByTestId(
      "scrapbook-entry-r-skipped_policy-render-status-skipped",
    );
    const failed = getByTestId(
      "scrapbook-entry-r-failed-render-status-failed",
    );
    // Different elements (different data-testid) — not the same div
    // shared between states.
    expect(skipped).not.toBe(failed);
  });

  it("renders a real image element for rendered entries (no policy badge)", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("rendered")];
    const { getByRole, queryByTestId } = render(
      <ScrapbookGallery images={images} />,
    );

    // Image is present.
    const img = getByRole("img");
    expect(img.getAttribute("src")).toContain("img.webp");

    // No policy / failed indicator on a rendered entry.
    expect(
      queryByTestId("scrapbook-entry-r-rendered-render-status-skipped"),
    ).toBeNull();
    expect(
      queryByTestId("scrapbook-entry-r-rendered-render-status-failed"),
    ).toBeNull();
  });

  it("provides distinct a11y labels for skipped_policy and failed", () => {
    // The visual difference is non-cosmetic — a screen reader must read
    // a state-naming label so a non-sighted player learns WHY this turn
    // has no image. Generic labels like "no image" violate the no-silent-
    // fallback rule from CLAUDE.md.
    const images: ScrapbookEntry[] = [
      entryWithStatus("skipped_policy"),
      entryWithStatus("failed"),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);

    const skipped = getByTestId(
      "scrapbook-entry-r-skipped_policy-render-status-skipped",
    );
    const failed = getByTestId(
      "scrapbook-entry-r-failed-render-status-failed",
    );

    const skippedLabel =
      skipped.getAttribute("aria-label") ??
      within(skipped).getByText(/skipped|no narrative|policy/i)
        .textContent ??
      "";
    const failedLabel =
      failed.getAttribute("aria-label") ??
      within(failed).getByText(/failed|render error|unavailable/i)
        .textContent ??
      "";

    expect(skippedLabel).not.toEqual("");
    expect(failedLabel).not.toEqual("");
    expect(skippedLabel.toLowerCase()).not.toEqual(
      failedLabel.toLowerCase(),
    );
    // Neither label may resemble the empty-state language ("no scenes
    // yet — the world will fill these pages") which would imply "scene
    // captured, no illustration yet".
    expect(skippedLabel.toLowerCase()).not.toMatch(/will fill these pages/);
    expect(failedLabel.toLowerCase()).not.toMatch(/will fill these pages/);
  });

  it("does not show the legacy 'no image' placeholder for skipped_policy or failed", () => {
    // Belt-and-braces: the legacy `scrapbook-entry-{id}-no-image`
    // placeholder must not co-exist with the new render_status
    // indicators. Two visible 'no image' affordances on the same card
    // would be incoherent.
    const images: ScrapbookEntry[] = [
      entryWithStatus("skipped_policy"),
      entryWithStatus("failed"),
    ];
    const { queryByTestId } = render(<ScrapbookGallery images={images} />);
    expect(
      queryByTestId("scrapbook-entry-r-skipped_policy-no-image"),
    ).toBeNull();
    expect(queryByTestId("scrapbook-entry-r-failed-no-image")).toBeNull();
  });
});
