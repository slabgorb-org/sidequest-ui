import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CharacterCreation } from "../CharacterCreation";
import { parseStatLine } from "../parseStatLine";

/**
 * Bug context (playtest 2026-04-26 Mawdeep MP, screenshot 003-p1-ralph-sheet):
 * The "Your Character" review surface rendered the stats row as a single
 * dense horizontal line — `STR 10 DEX 7 CON 12 INT 17 WIS 5 CHA 11` —
 * because the server emits stats as a flat string in `character_preview.stats`.
 *
 * Per CLAUDE.md playgroup notes: Alex (slow reader) loses this at-a-glance
 * and Sebastien (mechanics-first) needs stats scannable. These tests pin
 * the 3-col label-above-value mini-grid presentation so a future refactor
 * cannot silently regress to the dense one-liner. Pure presentational —
 * the data shape on the wire is unchanged.
 */

describe("CharacterCreation confirmation preview — stats grid", () => {
  // -------------------------------------------------------------------
  // parseStatLine — pure helper boundary
  // -------------------------------------------------------------------
  describe("parseStatLine helper", () => {
    it("parses the canonical D&D-style six-stat line into ordered pairs", () => {
      const result = parseStatLine("STR 10  DEX 7  CON 12  INT 17  WIS 5  CHA 11");
      expect(result).toEqual([
        ["STR", "10"],
        ["DEX", "7"],
        ["CON", "12"],
        ["INT", "17"],
        ["WIS", "5"],
        ["CHA", "11"],
      ]);
    });

    it("tolerates single-space separators (server has joined with double-space, but never trust the wire)", () => {
      const result = parseStatLine("STR 10 DEX 7 CON 12 INT 17 WIS 5 CHA 11");
      expect(result).toEqual([
        ["STR", "10"],
        ["DEX", "7"],
        ["CON", "12"],
        ["INT", "17"],
        ["WIS", "5"],
        ["CHA", "11"],
      ]);
    });

    it("accepts negative stat values (low-fantasy / mutant_wasteland penalties)", () => {
      const result = parseStatLine("STR 8 DEX -1 CON 12 INT 14");
      expect(result).toEqual([
        ["STR", "8"],
        ["DEX", "-1"],
        ["CON", "12"],
        ["INT", "14"],
      ]);
    });

    it("returns null for non-string values so non-stat rows fall through", () => {
      expect(parseStatLine(undefined)).toBeNull();
      expect(parseStatLine(null)).toBeNull();
      expect(parseStatLine(42)).toBeNull();
      expect(parseStatLine({ STR: 10 })).toBeNull();
    });

    it("returns null for prose values that should NOT be reformatted", () => {
      // A backstory or freeform string must render as plain text — the
      // detector cannot accidentally chop a sentence into "stat tokens".
      expect(parseStatLine("Beastkin")).toBeNull();
      expect(parseStatLine("Returned from the Colonies")).toBeNull();
      expect(parseStatLine("Brooding")).toBeNull();
      expect(parseStatLine("STR 10 because I rolled well")).toBeNull();
      // Odd token count cannot be a stat line.
      expect(parseStatLine("STR 10 DEX")).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Grid render — the actual UI assertion
  // -------------------------------------------------------------------
  it("renders the stats row as a 3-col label-above-value mini-grid (not a horizontal line)", () => {
    render(
      <CharacterCreation
        scene={{
          phase: "confirmation",
          scene_index: 3,
          total_scenes: 4,
          input_type: "confirm",
          message: "Confirm your character?",
          character_preview: {
            Name: "Ralph",
            Race: "Beastkin",
            Class: "Delver",
            // Server emits stats as a flat string — see
            // chargen_summary.py ~line 193.
            Stats: "STR 10  DEX 7  CON 12  INT 17  WIS 5  CHA 11",
          },
        }}
        loading={false}
        onRespond={() => {}}
      />,
    );

    // The grid container exists with the expected testid.
    const grid = screen.getByTestId("review-stats-grid");
    expect(grid).toBeInTheDocument();

    // It is a 3-col Tailwind grid (CSS class assertion — pinning the
    // visual contract so a refactor that drops `grid-cols-3` fails the
    // test rather than silently shipping a single-column stack).
    expect(grid.className).toContain("grid-cols-3");

    // Every D&D-style stat appears as its own cell with a definition-list
    // shape (label = <dt>, value = <dd>), and the values are present.
    const labels = within(grid).getAllByRole("term").map((n) => n.textContent);
    const values = within(grid)
      .getAllByRole("definition")
      .map((n) => n.textContent);
    expect(labels).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    expect(values).toEqual(["10", "7", "12", "17", "5", "11"]);

    // The dense one-liner that lives in the wire data MUST NOT appear
    // verbatim on screen. (`getAllByText` would throw if the substring
    // matched any element — `queryByText` returns null on miss.)
    expect(
      screen.queryByText(/STR 10\s+DEX 7\s+CON 12/),
    ).not.toBeInTheDocument();
  });

  it("falls back to plain text for non-stat rows in the same preview", () => {
    render(
      <CharacterCreation
        scene={{
          phase: "confirmation",
          scene_index: 3,
          total_scenes: 4,
          input_type: "confirm",
          message: "Confirm your character?",
          character_preview: {
            Name: "Ralph",
            Race: "Beastkin",
            Stats: "STR 10  DEX 7  CON 12  INT 17  WIS 5  CHA 11",
          },
        }}
        loading={false}
        onRespond={() => {}}
      />,
    );

    // Race row stays a regular value — no accidental grid re-format.
    expect(screen.getByTestId("review-section-Race")).toHaveTextContent(
      "Beastkin",
    );
    expect(
      within(screen.getByTestId("review-section-Race")).queryByTestId(
        "review-stats-grid",
      ),
    ).not.toBeInTheDocument();

    // Stats row IS a grid.
    expect(
      within(screen.getByTestId("review-section-Stats")).getByTestId(
        "review-stats-grid",
      ),
    ).toBeInTheDocument();
  });

  it("works under a non-default key name (genre packs label this 'Attributes' / 'Vitals' etc.)", () => {
    // The detector keys off the *value shape*, not the literal "Stats" key,
    // so a future genre pack that names the field differently still gets
    // the scannable layout.
    render(
      <CharacterCreation
        scene={{
          phase: "confirmation",
          scene_index: 3,
          total_scenes: 4,
          input_type: "confirm",
          message: "Confirm your character?",
          character_preview: {
            Name: "Lady Victoria",
            Vitals: "STR 9  DEX 12  CON 11  INT 16",
          },
        }}
        loading={false}
        onRespond={() => {}}
      />,
    );

    const grid = within(screen.getByTestId("review-section-Vitals")).getByTestId(
      "review-stats-grid",
    );
    expect(grid).toBeInTheDocument();
    expect(within(grid).getAllByRole("definition").map((n) => n.textContent))
      .toEqual(["9", "12", "11", "16"]);
  });
});
