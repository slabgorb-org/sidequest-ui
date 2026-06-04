/**
 * Story 54-9 / ADR-109: LocationPanel component tests.
 *
 * The panel renders the persistent location description for the current
 * region/room. Prose-only by design (Zork-Problem doctrine, spec §6.1) —
 * the entity manifest arrives in `data.entities` but MUST NOT render as
 * clickable chips or any visible affordance. The covered surfaces:
 *   - empty / null state ("No location yet.")
 *   - header with region_id
 *   - base prose split on blank lines into paragraphs
 *   - terrain badge presence + absence
 *   - "Overlay active" pip presence + absence
 *   - overlay prose paragraphs visually separated
 *   - Zork doctrine: NO entity chips, NO entity list, NO raw labels in DOM
 *   - tooltip aggregation across multiple overlays
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationPanel } from "../LocationPanel";
import type { LocationDescriptionPayload } from "../../types/payloads";

function payload(
  over: Partial<LocationDescriptionPayload> = {},
): LocationDescriptionPayload {
  return {
    region_id: "glenross_pub",
    prose: "The pub door is ajar.",
    terrain: "building",
    entities: [],
    overlays: [],
    ...over,
  };
}

describe("LocationPanel (Story 54-9)", () => {
  it("renders an empty-state message when data is null", () => {
    render(<LocationPanel data={null} />);
    expect(screen.getByTestId("location-empty")).toBeTruthy();
  });

  it("renders a loading-flavored empty state (tab is present before content arrives)", () => {
    // The Location tab is now gated on the world's stable navigation mode,
    // so it appears before any LOCATION_DESCRIPTION has arrived. The null
    // state must read as "loading", not "there is no location here".
    render(<LocationPanel data={null} />);
    expect(
      screen.getByTestId("location-empty").textContent?.toLowerCase(),
    ).toContain("gathering your bearings");
  });

  it("falls back to the region_id slug in the header when no display name is present", () => {
    render(<LocationPanel data={payload()} />);
    expect(screen.getByTestId("location-header")).toBeTruthy();
    expect(screen.getByTestId("location-header").textContent).toContain(
      "glenross_pub",
    );
  });

  // BUG-LOW (2026-06-02 playtest): the panel hard-coded 'Pirata One' /
  // 'EB Garamond' and rendered blackletter on the wry_whimsy parchment
  // theme. It must read the genre archetype font vars (ADR-079) so it
  // tracks the per-genre face like the Narrative column.
  it("pulls header + body fonts from the genre theme vars, not a hard-coded face", () => {
    render(<LocationPanel data={payload()} />);
    // jsdom stores the inline style string verbatim (it does not resolve
    // CSS custom properties), so asserting on the var() reference proves
    // the panel is wired to the theme rather than a literal font.
    const header = screen.getByTestId("location-header");
    expect(header.style.fontFamily).toContain("--font-display");
    const panel = screen.getByTestId("location-panel");
    expect(panel.style.fontFamily).toContain("--font-body");
  });

  // BUG-LOW (2026-06-02 playtest): the header was rendering the raw
  // snake_case slug ("munchkin_country"). When the server supplies the
  // authored display name it must be shown instead.
  it("renders the authored region_name in the header, not the slug", () => {
    render(
      <LocationPanel
        data={payload({
          region_id: "munchkin_country",
          region_name: "The Munchkin Country",
        })}
      />,
    );
    const header = screen.getByTestId("location-header");
    expect(header.textContent).toContain("The Munchkin Country");
    expect(header.textContent).not.toContain("munchkin_country");
  });

  // The slug stays the deep-link target even when the display name is shown:
  // the lore anchor is keyed on the snake_case region_id, not the prose name.
  it("keeps the lore deep-link keyed on the slug while displaying the name", () => {
    render(
      <LocationPanel
        data={payload({
          region_id: "munchkin_country",
          region_name: "The Munchkin Country",
          reference_url:
            "/reference/lore/wry_whimsy/oz#location-munchkin-country",
        })}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "/reference/lore/wry_whimsy/oz#location-munchkin-country",
    );
    expect(link.textContent).toBe("The Munchkin Country");
  });

  // BUG-LOW (2026-06-02 playtest): the panel hard-coded 'Pirata One' /
  // 'EB Garamond' and rendered blackletter on the wry_whimsy parchment
  // theme. It must read the genre archetype font vars (ADR-079) so it
  // tracks the per-genre face like the Narrative column.
  it("pulls header + body fonts from the genre theme vars, not a hard-coded face", () => {
    render(<LocationPanel data={payload()} />);
    // jsdom stores the inline style string verbatim (it does not resolve
    // CSS custom properties), so asserting on the var() reference proves
    // the panel is wired to the theme rather than a literal font.
    const header = screen.getByTestId("location-header");
    expect(header.style.fontFamily).toContain("--font-display");
    const panel = screen.getByTestId("location-panel");
    expect(panel.style.fontFamily).toContain("--font-body");
  });

  it("renders the base prose paragraphs", () => {
    render(
      <LocationPanel
        data={payload({
          prose: "The pub door is ajar.\n\nA candle gutters on the bar.",
        })}
      />,
    );
    const paras = screen.getAllByTestId(/^location-prose-paragraph-/);
    expect(paras).toHaveLength(2);
    expect(paras[0].textContent).toBe("The pub door is ajar.");
    expect(paras[1].textContent).toBe("A candle gutters on the bar.");
  });

  it("renders a terrain badge when terrain is present", () => {
    render(<LocationPanel data={payload({ terrain: "settlement" })} />);
    const badge = screen.getByTestId("location-terrain-badge");
    expect(badge.textContent?.toLowerCase()).toContain("settlement");
  });

  it("omits the terrain badge when terrain is null", () => {
    render(<LocationPanel data={payload({ terrain: null })} />);
    expect(screen.queryByTestId("location-terrain-badge")).toBeNull();
  });

  it("renders the overlay-active pip when at least one overlay is merged", () => {
    render(
      <LocationPanel
        data={payload({
          overlays: [
            {
              encounter_id: "tavern_brawl@glenross_pub",
              prose_suffix: "A chair lies in splinters by the door.",
              entity_delta_count: 1,
            },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("location-overlay-pip")).toBeTruthy();
  });

  it("omits the pip when no overlays are merged", () => {
    render(<LocationPanel data={payload({ overlays: [] })} />);
    expect(screen.queryByTestId("location-overlay-pip")).toBeNull();
  });

  it("renders overlay prose paragraphs visually separated from base", () => {
    render(
      <LocationPanel
        data={payload({
          overlays: [
            {
              encounter_id: "tavern_brawl@glenross_pub",
              prose_suffix: "A chair lies in splinters by the door.",
              entity_delta_count: 0,
            },
          ],
        })}
      />,
    );
    const overlaySection = screen.getByTestId("location-overlay-prose");
    expect(overlaySection).toBeTruthy();
    expect(overlaySection.textContent).toContain(
      "A chair lies in splinters by the door.",
    );
  });

  it("does NOT render entity chips (Zork doctrine — spec §6.1)", () => {
    render(
      <LocationPanel
        data={payload({
          entities: [
            {
              id: "bar",
              label: "the bar",
              tier: "real_object",
              binding: { kind: "location_feature", ref: "glenross_arms_bar" },
              affordances: [],
              provenance: "authored",
              promoted_at_turn: null,
              promoted_canon: null,
            },
            {
              id: "cobwebs",
              label: "cobwebs",
              tier: "flavor_only",
              binding: null,
              affordances: [],
              provenance: "authored",
              promoted_at_turn: null,
              promoted_canon: null,
            },
          ],
        })}
      />,
    );
    expect(screen.queryByTestId("location-entity-chip")).toBeNull();
    expect(screen.queryByTestId("location-entity-list")).toBeNull();
    // The manifest must not bleed into the prose either.
    expect(screen.queryByText(/the bar$/)).toBeNull();
  });

  it("aggregates overlay tooltip names when multiple overlays are merged", () => {
    render(
      <LocationPanel
        data={payload({
          overlays: [
            {
              encounter_id: "tavern_brawl@glenross_pub",
              prose_suffix: "A chair lies in splinters by the door.",
              entity_delta_count: 1,
            },
            {
              encounter_id: "rain_squall@glenross_pub",
              prose_suffix: "Rain hisses on the cobbles.",
              entity_delta_count: 0,
            },
          ],
        })}
      />,
    );
    const pip = screen.getByTestId("location-overlay-pip");
    const title = pip.getAttribute("title") ?? "";
    expect(title).toContain("tavern_brawl@glenross_pub");
    expect(title).toContain("rain_squall@glenross_pub");
  });

  // Spec §6.3 explicit coverage of the entity-delta-count-only path:
  // when an overlay carries entities but no prose suffix, the pip still
  // appears (it advertises overlay activity even without descriptive text).
  it("shows the pip when an overlay has entity_delta_count > 0 but empty prose_suffix", () => {
    render(
      <LocationPanel
        data={payload({
          overlays: [
            {
              encounter_id: "silent_visitor@glenross_pub",
              prose_suffix: "",
              entity_delta_count: 2,
            },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("location-overlay-pip")).toBeTruthy();
    // No overlay prose section when no suffix text exists across all overlays.
    expect(screen.queryByTestId("location-overlay-prose")).toBeNull();
  });

  // POI landscape (2026-06-04): the server emits poi_image_url for the region;
  // the panel shows it above the prose and degrades to text-only when absent.
  it("renders the POI landscape image when poi_image_url is present", () => {
    render(
      <LocationPanel
        data={payload({
          region_name: "The Munchkin Country",
          poi_image_url:
            "https://cdn.slabgorb.com/genre_packs/wry_whimsy/worlds/oz/assets/poi/munchkin_country.png",
        })}
      />,
    );
    const img = screen.getByTestId("location-poi-image") as HTMLImageElement;
    expect(img.getAttribute("src")).toContain(
      "assets/poi/munchkin_country.png",
    );
    // Alt text is the human-readable region name, not the slug.
    expect(img.getAttribute("alt")).toBe("The Munchkin Country");
  });

  it("renders no POI image when poi_image_url is absent (text-only)", () => {
    render(<LocationPanel data={payload()} />);
    expect(screen.queryByTestId("location-poi-image")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Story 85-2: Region — Subregion breadcrumb.
//
// AC-1 decision (operator, 2026-06-04): "where am I" is a two-level hierarchy
// Region › Subregion, rendered in the Location-tab header as a
// "Region — Subregion" breadcrumb so the tab and the running-header chip read
// as ONE hierarchy instead of two surfaces that look like they disagree
// (playtest L105 a/b).
//
// Contract (Architect, White Queen):
//   - region segment  = the SHARED, region-keyed payload (region_name, ADR-109)
//   - subregion segment = the LOCAL player's per-PC current_location — the same
//     every-turn-fresh value useRunningHeader already reads. It is composed
//     CLIENT-SIDE from a new `subregion` prop; it is NOT a new payload field
//     (a per-PC value must not ride the shared region record — split party).
//   - separator is locked to a space-EM-DASH-space.
//   - useRunningHeader does NOT change (S2-UX(c) per-PC freshness preserved).
//
// The positive-composition cases verify the breadcrumb composes correctly; the
// negative guards keep a naive implementation honest (no always-append, no
// dangling dash, no doubling, slug-fallback still carries the subregion).
// ---------------------------------------------------------------------------

const BREADCRUMB_SEP = " — "; // space · EM DASH (U+2014) · space — locked

function region(
  over: Partial<LocationDescriptionPayload> = {},
): LocationDescriptionPayload {
  // terrain:null keeps the badge out of the header so textContent assertions
  // see only the breadcrumb.
  return payload({
    region_id: "outer_coyote_star",
    region_name: "The Outer Coyote Star",
    terrain: null,
    ...over,
  });
}

describe("LocationPanel — Region — Subregion breadcrumb (Story 85-2)", () => {
  it("composes 'Region — Subregion' when a distinct subregion is supplied", () => {
    render(
      <LocationPanel data={region()} subregion="Docking Crescent" />,
    );
    const header = screen.getByTestId("location-header");
    expect(header.textContent).toContain(
      `The Outer Coyote Star${BREADCRUMB_SEP}Docking Crescent`,
    );
  });

  it("shows the region alone — no separator — when no subregion is supplied (guard)", () => {
    render(<LocationPanel data={region()} />);
    const header = screen.getByTestId("location-header");
    expect(header.textContent).toContain("The Outer Coyote Star");
    expect(header.textContent).not.toContain(BREADCRUMB_SEP);
  });

  it("does not double the name when subregion equals the region, case/trim-insensitive (guard)", () => {
    render(
      <LocationPanel data={region()} subregion="  the outer coyote star " />,
    );
    const header = screen.getByTestId("location-header");
    expect(header.textContent).toContain("The Outer Coyote Star");
    expect(header.textContent).not.toContain(BREADCRUMB_SEP);
  });

  it("no silent fallback: a blank/whitespace subregion never yields a dangling dash or 'undefined'/'null' (guard)", () => {
    render(
      <LocationPanel data={region()} subregion="   " />,
    );
    const header = screen.getByTestId("location-header");
    expect(header.textContent).not.toContain(BREADCRUMB_SEP);
    expect(header.textContent?.toLowerCase()).not.toContain("undefined");
    expect(header.textContent?.toLowerCase()).not.toContain("null");
  });

  it("composes the FULL slug-fallback breadcrumb when region_name is absent (guard)", () => {
    // Honest fallback: an old snapshot with no authored region_name still
    // anchors the breadcrumb on the slug — AND must still carry the subregion.
    // Asserting the full `slug — subregion` string makes this RED against an
    // implementation that drops the subregion on the region_name-absent branch.
    render(
      <LocationPanel
        data={region({ region_name: null })}
        subregion="Docking Crescent"
      />,
    );
    const header = screen.getByTestId("location-header");
    expect(header.textContent).toContain(
      `outer_coyote_star${BREADCRUMB_SEP}Docking Crescent`,
    );
    expect(header.textContent?.toLowerCase()).not.toContain("undefined");
  });

  it("treats an explicit null subregion the same as absent — no separator (guard)", () => {
    // `subregion` is typed string | null | undefined; the guards above cover
    // undefined (omitted) and whitespace. This pins the literal-null branch of
    // the `(subregion ?? "")` coalesce so a null/undefined mishandling is caught.
    render(<LocationPanel data={region()} subregion={null} />);
    const header = screen.getByTestId("location-header");
    expect(header.textContent).toContain("The Outer Coyote Star");
    expect(header.textContent).not.toContain(BREADCRUMB_SEP);
    expect(header.textContent?.toLowerCase()).not.toContain("null");
  });

  it("keeps the POI image alt region-only — the breadcrumb is header-only (guard)", () => {
    // Intentional divergence: the POI landscape is region-level art, so its alt
    // text stays the region name even when a subregion is supplied. This pins
    // that decision so a well-meaning change to the one-arg regionDisplayName
    // call site doesn't leak the subregion into screen-reader output.
    render(
      <LocationPanel
        data={region({
          region_name: "The Outer Coyote Star",
          poi_image_url:
            "https://cdn.slabgorb.com/genre_packs/space_opera/worlds/coyote_star/assets/poi/outer_coyote_star.png",
        })}
        subregion="Docking Crescent"
      />,
    );
    // Header carries the full breadcrumb...
    expect(screen.getByTestId("location-header").textContent).toContain(
      `The Outer Coyote Star${BREADCRUMB_SEP}Docking Crescent`,
    );
    // ...but the image alt is region-only (no separator, no subregion).
    const alt = screen
      .getByTestId("location-poi-image")
      .getAttribute("alt");
    expect(alt).toBe("The Outer Coyote Star");
    expect(alt).not.toContain(BREADCRUMB_SEP);
  });
});
