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

  it("renders the region_id as a header", () => {
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
});
