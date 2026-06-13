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
 * Redesign (story 107-N): entries without an image now render as an
 * InlineBeatCard (compact row) in grid view instead of a full 4:3 card.
 * The render_status is surfaced on the inline card's trailing status glyph
 * (data-testid="scrapbook-inline-status-{id}") and as the row's aria-label.
 * In list view, these entries still use ScrapbookCard with the legacy
 * render-status-skipped / render-status-failed inner divs.
 *
 * These tests validate the inline card state indicators (grid view, which
 * is the default and primary reading surface).
 *
 * The `render_status` field on `ScrapbookEntry` (sourced from the server's
 * `ScrapbookEntryPayload`) is the wire under test from the UI side.
 *
 * Per CLAUDE.md "no silent fallbacks": each render_status renders a
 * distinct, intentional visual element with an a11y label that names the
 * state aloud — never a generic "no image" glyph.
 */
import { render, fireEvent } from "@testing-library/react";
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
  // branch must still light up (Scene Card). For the other two, omit the
  // URL: the entry renders as InlineBeatCard (compact row) in grid view.
  const base: ScrapbookEntry = {
    url: render_status === "rendered" ? "https://example.invalid/img.webp" : "",
    timestamp: 0,
    isHandout: false,
    render_id: `r-${render_status}`,
    turn_number: 1,
    scene_name: `Turn 1 — ${render_status}`,
    location: "The Glass Flats",
    // The new field — added to ScrapbookEntry / GalleryImage as part of
    // story 45-30. Until that lands the test fails at TS compile.
    render_status,
    ...overrides,
  };
  return base;
}

describe("ScrapbookGallery — render_status indicator (story 45-30)", () => {
  // -------------------------------------------------------------------------
  // In grid view (default), entries without an image render as InlineBeatCard.
  // The status is surfaced via:
  //   - data-testid="scrapbook-inline-status-{id}"  (status glyph)
  //   - aria-label on the article element itself
  // -------------------------------------------------------------------------

  it("renders the inline beat card for skipped_policy entries (grid view)", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("skipped_policy")];
    const { getByTestId } = render(
      <ScrapbookGallery images={images} />,
    );

    // InlineBeatCard carries data-inline-beat="true" on the article.
    const entry = getByTestId("scrapbook-entry-r-skipped_policy");
    expect(entry.getAttribute("data-inline-beat")).toBe("true");

    // Status glyph testid is present.
    const status = getByTestId("scrapbook-inline-status-r-skipped_policy");
    expect(status).toBeTruthy();

    // The pre-story `no-image` placeholder must NOT appear for
    // skipped_policy entries — that affordance read as "scene captured,
    // no illustration yet" which is the wrong story for "policy
    // intentionally chose not to render".
    // (Old testid was scrapbook-entry-r-skipped_policy-render-status-skipped;
    // that inner div is only in ScrapbookCard / list-view path now.)
  });

  it("renders the inline beat card for failed entries (grid view)", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("failed")];
    const { getByTestId } = render(
      <ScrapbookGallery images={images} />,
    );

    const entry = getByTestId("scrapbook-entry-r-failed");
    expect(entry.getAttribute("data-inline-beat")).toBe("true");

    const status = getByTestId("scrapbook-inline-status-r-failed");
    expect(status).toBeTruthy();
  });

  it("uses different status glyph text for skipped_policy vs failed", () => {
    // Both states ship in the same gallery; their glyphs must be
    // distinguishable by content, not just by class. Sebastien
    // (mechanical-first) needs to read the gallery and know WHY a turn
    // has no image.
    const images: ScrapbookEntry[] = [
      entryWithStatus("skipped_policy"),
      entryWithStatus("failed"),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);

    const skippedGlyph = getByTestId(
      "scrapbook-inline-status-r-skipped_policy",
    );
    const failedGlyph = getByTestId(
      "scrapbook-inline-status-r-failed",
    );
    // Different visual glyphs — not the same character.
    expect(skippedGlyph.textContent).not.toEqual(failedGlyph.textContent);
  });

  it("renders a real Scene Card (no inline strip) for rendered entries", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("rendered")];
    const { getByRole, queryByTestId } = render(
      <ScrapbookGallery images={images} />,
    );

    // Image is present on a Scene Card.
    const img = getByRole("img");
    expect(img.getAttribute("src")).toContain("img.webp");

    // No inline beat card for a rendered entry — it went through SceneCard.
    const entry = queryByTestId("scrapbook-entry-r-rendered");
    expect(entry?.getAttribute("data-inline-beat")).toBeFalsy();

    // No inline status glyph either.
    expect(
      queryByTestId("scrapbook-inline-status-r-rendered"),
    ).toBeNull();
  });

  it("provides distinct a11y labels for skipped_policy vs failed on the article", () => {
    // The visual difference is non-cosmetic — a screen reader must read
    // a state-naming label so a non-sighted player learns WHY this turn
    // has no image. The label lives on the article element of InlineBeatCard.
    const images: ScrapbookEntry[] = [
      entryWithStatus("skipped_policy"),
      entryWithStatus("failed"),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);

    const skippedEntry = getByTestId("scrapbook-entry-r-skipped_policy");
    const failedEntry = getByTestId("scrapbook-entry-r-failed");

    const skippedLabel = skippedEntry.getAttribute("aria-label") ?? "";
    const failedLabel = failedEntry.getAttribute("aria-label") ?? "";

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
    // skipped → references skip/narrative/policy; failed → references fail/render.
    expect(skippedLabel.toLowerCase()).toMatch(/skipped|no narrative|policy/);
    expect(failedLabel.toLowerCase()).toMatch(/failed|render/);
  });

  it("does not show a 4:3 image well for skipped_policy or failed entries in grid view", () => {
    // The 4:3 well was the original bug — a giant empty box for every beat
    // that didn't get an illustration. InlineBeatCard must not have one.
    const images: ScrapbookEntry[] = [
      entryWithStatus("skipped_policy"),
      entryWithStatus("failed"),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    // The aspect-[4/3] class lives only on ScrapbookCard's image well.
    const wells = container.querySelectorAll(".aspect-\\[4\\/3\\]");
    expect(wells).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // List view — skipped/failed entries use ScrapbookCard (the 4:3 well is
  // acceptable in the linear list layout). The inner render-status divs that
  // the original tests expected are present in this path.
  // -------------------------------------------------------------------------

  it("renders the legacy render-status-skipped inner div in list view", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("skipped_policy")];
    const { container, getByRole } = render(
      <ScrapbookGallery images={images} />,
    );
    // Switch to list view via fireEvent so React state updates flush.
    fireEvent.click(getByRole("button", { name: /list view/i }));

    // In list view, ScrapbookCard is used for all entries — the inner
    // render-status-skipped div is rendered inside the 4:3 well.
    const skippedDiv = container.querySelector(
      '[data-testid="scrapbook-entry-r-skipped_policy-render-status-skipped"]',
    );
    expect(skippedDiv).not.toBeNull();
    expect(skippedDiv?.getAttribute("aria-label")).toContain("Skipped");
  });

  it("renders the legacy render-status-failed inner div in list view", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("failed")];
    const { container, getByRole } = render(
      <ScrapbookGallery images={images} />,
    );
    fireEvent.click(getByRole("button", { name: /list view/i }));

    const failedDiv = container.querySelector(
      '[data-testid="scrapbook-entry-r-failed-render-status-failed"]',
    );
    expect(failedDiv).not.toBeNull();
    expect(failedDiv?.getAttribute("aria-label")).toContain("Render failed");
  });

  it("does not show the legacy 'no image' placeholder for skipped_policy or failed (either view)", () => {
    // Belt-and-braces: the legacy `scrapbook-entry-{id}-no-image`
    // placeholder must not appear for entries that have a render_status.
    // In grid view they use InlineBeatCard (no 4:3 well at all).
    // In list view they use ScrapbookCard with the render-status branch
    // (not the no-image branch).
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

  // -------------------------------------------------------------------------
  // Pending state (no render_status, url empty) — maps to the "…" glyph.
  // -------------------------------------------------------------------------

  it("renders the inline beat card with a pending glyph when render_status is absent and url is empty", () => {
    // A beat that arrived without render_status and without a url — the
    // policy may or may not have fired; the UI represents this as pending.
    const images: ScrapbookEntry[] = [
      {
        url: "",
        timestamp: 0,
        isHandout: false,
        render_id: "r-pending",
        turn_number: 2,
        scene_name: "The Waiting Room",
      },
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    const entry = getByTestId("scrapbook-entry-r-pending");
    expect(entry.getAttribute("data-inline-beat")).toBe("true");

    const status = getByTestId("scrapbook-inline-status-r-pending");
    // Pending glyph is "…".
    expect(status.textContent).toContain("…");
  });

  // -------------------------------------------------------------------------
  // "Will fill these pages" glyph regression (belt-and-braces).
  // The old placeholder said "no image" which echoed the empty-state language
  // and made it look like a broken card. Neither inline card nor the list-view
  // status divs may use that language.
  // -------------------------------------------------------------------------

  it("the skipped status glyph does not say 'no image' or 'will fill'", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("skipped_policy")];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    // In grid view the entry is the inline card — check its full text.
    const entry = getByTestId("scrapbook-entry-r-skipped_policy");
    const text = (entry.textContent ?? "").toLowerCase();
    expect(text).not.toContain("will fill these pages");
    expect(text).not.toContain("no image");
  });

  it("the failed status glyph does not say 'no image' or 'will fill'", () => {
    const images: ScrapbookEntry[] = [entryWithStatus("failed")];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    const entry = getByTestId("scrapbook-entry-r-failed");
    const text = (entry.textContent ?? "").toLowerCase();
    expect(text).not.toContain("will fill these pages");
    // Failed glyph may have "failed" but NOT the generic "no image" text.
    expect(text).not.toContain("no image");
  });

  it("the a11y labels for skipped and failed are distinct from each other and name the state", () => {
    // Regression guard: if both labels somehow become "Open: (metadata only)"
    // they would be identical and neither would name the actual state.
    const images: ScrapbookEntry[] = [
      entryWithStatus("skipped_policy"),
      entryWithStatus("failed"),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);

    const skippedLabel =
      getByTestId("scrapbook-entry-r-skipped_policy").getAttribute("aria-label") ?? "";
    const failedLabel =
      getByTestId("scrapbook-entry-r-failed").getAttribute("aria-label") ?? "";

    // Must both be non-empty and differ.
    expect(skippedLabel.length).toBeGreaterThan(0);
    expect(failedLabel.length).toBeGreaterThan(0);
    expect(skippedLabel).not.toBe(failedLabel);
  });

  it("provides the scene title in the inline beat card for skipped entries", () => {
    // The entry was not illustrated but the title still surfaces so the
    // player knows which beat was skipped.
    const images: ScrapbookEntry[] = [
      entryWithStatus("skipped_policy", { scene_name: "The Alley Talk" }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    const title = getByTestId("scrapbook-title-r-skipped_policy");
    expect(title.textContent).toBe("The Alley Talk");
  });
});

// ---------------------------------------------------------------------------
// Inline beat card in mixed gallery (illustrated + skipped).
// The "travelogue" effect: Scene Cards bloom, quiet beats are ledger entries.
// ---------------------------------------------------------------------------

describe("ScrapbookGallery — inline beat cards coexist with Scene Cards", () => {
  it("renders Scene Cards and InlineBeatCards in the same chapter group", () => {
    const images: ScrapbookEntry[] = [
      {
        url: "https://example.invalid/img.webp",
        timestamp: 0,
        isHandout: false,
        render_id: "r-img",
        turn_number: 1,
        scene_name: "The Glade",
        chapter: "Act 1",
        render_status: "rendered",
      },
      {
        url: "",
        timestamp: 1,
        isHandout: false,
        render_id: "r-skip",
        turn_number: 2,
        scene_name: "Banter at the Hearth",
        chapter: "Act 1",
        render_status: "skipped_policy",
      },
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);

    // Illustrated entry → Scene Card (no data-inline-beat).
    const imgEntry = getByTestId("scrapbook-entry-r-img");
    expect(imgEntry.getAttribute("data-inline-beat")).toBeNull();
    expect(imgEntry.getAttribute("data-has-image")).toBe("true");

    // Skipped entry → InlineBeatCard.
    const skipEntry = getByTestId("scrapbook-entry-r-skip");
    expect(skipEntry.getAttribute("data-inline-beat")).toBe("true");
    expect(skipEntry.getAttribute("data-has-image")).toBe("false");
  });

  it("the chapter divider renders once for both card types in the same chapter", () => {
    const images: ScrapbookEntry[] = [
      {
        url: "https://example.invalid/img.webp",
        timestamp: 0,
        isHandout: false,
        render_id: "r-img",
        turn_number: 1,
        chapter: "Act 1",
        render_status: "rendered",
      },
      {
        url: "",
        timestamp: 1,
        isHandout: false,
        render_id: "r-skip",
        turn_number: 2,
        chapter: "Act 1",
        render_status: "skipped_policy",
      },
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const dividers = container.querySelectorAll(
      '[data-testid^="scrapbook-chapter-divider"]',
    );
    expect(dividers).toHaveLength(1);
    expect(dividers[0].textContent).toContain("Act 1");
  });
});

// ---------------------------------------------------------------------------
// Scene Card (hasImage === true) — unchanged by the redesign.
// These tests assert that the full 4:3 card is not accidentally broken.
// ---------------------------------------------------------------------------

describe("ScrapbookGallery — Scene Card shape preserved (hasImage === true)", () => {
  function sceneEntry(overrides: Partial<ScrapbookEntry> = {}): ScrapbookEntry {
    return {
      url: "https://example.invalid/img.webp",
      timestamp: 0,
      isHandout: false,
      render_id: "r-scene",
      turn_number: 3,
      scene_name: "The Market Square",
      narrative_beat: "Pigeons scatter as the stranger enters.",
      scene_type: "establishing",
      render_status: "rendered",
      ...overrides,
    };
  }

  it("Scene Card carries data-has-image=true and no data-inline-beat", () => {
    const { getByTestId } = render(
      <ScrapbookGallery images={[sceneEntry()]} />,
    );
    const entry = getByTestId("scrapbook-entry-r-scene");
    expect(entry.getAttribute("data-has-image")).toBe("true");
    // data-inline-beat is absent on Scene Cards (only present on InlineBeatCard).
    expect(entry.getAttribute("data-inline-beat")).toBeNull();
  });

  it("Scene Card renders its legend (title, caption, turn-badge, scene-type) unchanged", () => {
    const { getByTestId, container } = render(
      <ScrapbookGallery images={[sceneEntry()]} />,
    );
    expect(getByTestId("scrapbook-title-r-scene").textContent).toBe("The Market Square");
    expect(getByTestId("scrapbook-caption-r-scene").textContent).toBe(
      "Pigeons scatter as the stranger enters.",
    );
    expect(getByTestId("scrapbook-turn-badge-r-scene").textContent).toContain("Turn 3");
    expect(getByTestId("scrapbook-scene-type-r-scene").getAttribute("data-scene-type")).toBe("establishing");
    // The 4:3 well must still be present.
    const well = container.querySelector(".aspect-\\[4\\/3\\]");
    expect(well).not.toBeNull();
  });

  it("Scene Card renders the main image with the correct src", () => {
    const { getByRole } = render(
      <ScrapbookGallery images={[sceneEntry()]} />,
    );
    const img = getByRole("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("img.webp");
  });

  it("Scene Card's click affordance has an 'Enlarge' aria-label", () => {
    const { container } = render(
      <ScrapbookGallery images={[sceneEntry()]} />,
    );
    // On a Scene Card the [role=button] is the inner div wrapping the 4:3 well.
    const btn = container.querySelector(
      '[data-testid="scrapbook-entry-r-scene"] [role="button"]',
    );
    expect(btn?.getAttribute("aria-label")).toContain("Enlarge");
  });
});
