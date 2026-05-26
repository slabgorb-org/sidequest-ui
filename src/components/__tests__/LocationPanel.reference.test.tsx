/**
 * Story 63-6 (re-scoped from "test parity"): LocationPanel region-header
 * reference deep-link.
 *
 * Epic 63 wires every dock panel to deep-link into the server-rendered
 * /reference/lore wiki via a server-emitted `reference_url`. CharacterSheet
 * (abilities + class subtitle) shipped this in 63-4; the LocationPanel region
 * header is the slice that did not. This suite covers the player-visible core:
 * the region header renders as a target=_blank anchor when `reference_url` is
 * set, and as plain text when it is null or omitted — mirroring the
 * CharacterSheet class-subtitle anchor pattern in CharacterSheet.reference.test.tsx.
 *
 * Scope guard (ADR-109 / story 54-9): adding the anchor MUST NOT introduce
 * entity rendering. The panel is prose-only by design. The final test pins
 * that the Zork-doctrine exclusion still holds with reference_url present.
 *
 * Does NOT duplicate LocationPanel.test.tsx (prose / terrain / overlay / empty
 * state). Uses a synthetic payload only — no live pack/world slug.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationPanel } from "../LocationPanel";
import type { LocationDescriptionPayload } from "../../types/payloads";

// `reference_url` is part of LocationDescriptionPayload (AC2), so the factory
// types directly against it.
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

describe("LocationPanel region-header reference link (Story 63-6)", () => {
  it("renders the region header as a target=_blank anchor when reference_url is set", () => {
    const url = "/reference/lore/tea_and_murder/glenross#location-glenross-pub";
    render(<LocationPanel data={payload({ reference_url: url })} />);

    const link = screen.getByRole("link", { name: /glenross_pub/i });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
  });

  it("renders the region header as plain text (no link) when reference_url is null", () => {
    render(<LocationPanel data={payload({ reference_url: null })} />);

    expect(screen.queryByRole("link", { name: /glenross_pub/i })).toBeNull();
    // The region label is still shown — only the anchor is absent.
    expect(screen.getByTestId("location-header").textContent).toContain(
      "glenross_pub",
    );
  });

  it("renders the region header as plain text when reference_url is omitted entirely", () => {
    // reference_url field not present on the payload at all (undefined).
    render(<LocationPanel data={payload()} />);

    expect(screen.queryByRole("link", { name: /glenross_pub/i })).toBeNull();
    expect(screen.getByTestId("location-header").textContent).toContain(
      "glenross_pub",
    );
  });

  it("does NOT render entities even when reference_url is set (Zork doctrine, ADR-109)", () => {
    // Guard: adding the region-header anchor must not regress the prose-only
    // exclusion. An entity label in the manifest must never reach the DOM.
    const url = "/reference/lore/tea_and_murder/glenross#location-glenross-pub";
    render(
      <LocationPanel
        data={payload({
          reference_url: url,
          entities: [
            {
              id: "pub_hearth",
              label: "the smouldering hearth",
              tier: "real_object",
              binding: null,
              affordances: [],
              provenance: "authored",
              promoted_at_turn: null,
              promoted_canon: null,
            } as LocationDescriptionPayload["entities"][number],
          ],
        })}
      />,
    );

    // The anchor is present…
    expect(
      screen.getByRole("link", { name: /glenross_pub/i }),
    ).toBeInTheDocument();
    // …but the entity label is NOT rendered anywhere.
    expect(screen.queryByText(/smouldering hearth/i)).toBeNull();
  });
});
