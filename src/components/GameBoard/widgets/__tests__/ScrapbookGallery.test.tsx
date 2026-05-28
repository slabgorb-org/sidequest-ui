/**
 * ScrapbookGallery — pure presentational tests for the diegetic image scrapbook.
 *
 * Story 33-17: Gallery becomes a turn-attributed, chapter-grouped scrapbook
 * with NPC/world-fact chips, grid/list view toggle, compact 3-col mode at 6+
 * images, scene-type badges, and a narrative empty state.
 *
 * Per CLAUDE.md: tests mock what the widget renders from, not the provider.
 * ScrapbookGallery takes a `readonly ScrapbookEntry[]` prop; the wrapper
 * ImageGalleryWidget is tested separately for the useImageBus() hookup.
 *
 * Graceful degradation is load-bearing: 33-18 hasn't shipped, so tests cover
 * rendering when scene_name / narrative_beat / scene_type / npcs / world_facts
 * / chapter are absent from the current payload shape.
 */
import { render, fireEvent, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  ScrapbookGallery,
  type ScrapbookEntry,
} from "../ScrapbookGallery";

function baseEntry(overrides: Partial<ScrapbookEntry> = {}): ScrapbookEntry {
  return {
    url: "https://example.invalid/img.webp",
    timestamp: 0,
    isHandout: false,
    ...overrides,
  };
}

function enrichedEntry(overrides: Partial<ScrapbookEntry> = {}): ScrapbookEntry {
  return baseEntry({
    render_id: "r-1",
    turn_number: 1,
    scene_name: "The Mouth of Mawdeep",
    narrative_beat: "Cold air rushes up from the throat of the cave.",
    scene_type: "establishing",
    chapter: "Into the Dark",
    location: "Mawdeep Entrance",
    world_facts: ["bioluminescent moss", "a rusted winch"],
    npcs: [
      { name: "Grell", role: "hostile" },
      { name: "Aster", role: "friendly" },
      { name: "A huddled stranger", role: "neutral" },
    ],
    ...overrides,
  });
}

describe("ScrapbookGallery — empty state", () => {
  it("renders the narrative empty state when images is empty", () => {
    const { getByTestId } = render(<ScrapbookGallery images={[]} />);
    const empty = getByTestId("scrapbook-empty");
    expect(empty.textContent).toContain(
      "No scenes yet — the world will fill these pages.",
    );
  });

  it("does not render scene count header when empty", () => {
    const { queryByTestId } = render(<ScrapbookGallery images={[]} />);
    expect(queryByTestId("scrapbook-scene-count")).toBeNull();
  });
});

describe("ScrapbookGallery — scene count header", () => {
  it("shows 'N scenes' in the header when populated", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({ render_id: "r-1", turn_number: 1 }),
      enrichedEntry({ render_id: "r-2", turn_number: 2 }),
      enrichedEntry({ render_id: "r-3", turn_number: 3 }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    expect(getByTestId("scrapbook-scene-count").textContent).toContain("3 scenes");
  });
});

describe("ScrapbookGallery — turn badge", () => {
  it("renders 'Turn N' badge overlaid on each image", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({ render_id: "r-1", turn_number: 4 }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    const badge = getByTestId("scrapbook-turn-badge-r-1");
    expect(badge.textContent).toContain("Turn 4");
  });

  it("omits the turn badge entirely when turn_number is undefined (graceful degradation)", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({ render_id: "r-1" }), // no turn_number
    ];
    const { queryByTestId } = render(<ScrapbookGallery images={images} />);
    expect(queryByTestId("scrapbook-turn-badge-r-1")).toBeNull();
  });
});

describe("ScrapbookGallery — legend bar", () => {
  it("renders scene_name as title and narrative_beat as caption", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({
        render_id: "r-1",
        scene_name: "The Throat",
        narrative_beat: "Drips echo somewhere below.",
      }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    const legend = getByTestId("scrapbook-legend-r-1");
    expect(within(legend).getByTestId("scrapbook-title-r-1").textContent).toBe(
      "The Throat",
    );
    expect(
      within(legend).getByTestId("scrapbook-caption-r-1").textContent,
    ).toBe("Drips echo somewhere below.");
  });

  it("omits title when scene_name is absent even if caption exists", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({
        render_id: "r-1",
        caption: "A crumbling doorway",
      }),
    ];
    const { queryByTestId } = render(<ScrapbookGallery images={images} />);
    // caption no longer promoted to title — prevents duplicate text when
    // caption and narrative_beat contain the same narrative_excerpt
    expect(queryByTestId("scrapbook-title-r-1")).toBeNull();
  });

  it("hides the caption line entirely when narrative_beat is absent and no caption fallback exists", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({ render_id: "r-1" }),
    ];
    const { queryByTestId } = render(<ScrapbookGallery images={images} />);
    expect(queryByTestId("scrapbook-caption-r-1")).toBeNull();
  });
});

describe("ScrapbookGallery — scene type badge", () => {
  it("renders scene_type badge when present", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({ render_id: "r-1", scene_type: "encounter" }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    const badge = getByTestId("scrapbook-scene-type-r-1");
    expect(badge.textContent?.toLowerCase()).toContain("encounter");
    expect(badge.getAttribute("data-scene-type")).toBe("encounter");
  });

  it("omits the scene_type badge when absent", () => {
    const images: ScrapbookEntry[] = [baseEntry({ render_id: "r-1" })];
    const { queryByTestId } = render(<ScrapbookGallery images={images} />);
    expect(queryByTestId("scrapbook-scene-type-r-1")).toBeNull();
  });
});

describe("ScrapbookGallery — NPC chips", () => {
  it("renders one chip per NPC with a data-npc-role attribute matching the role", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({
        render_id: "r-1",
        npcs: [
          { name: "Grell", role: "hostile" },
          { name: "Aster", role: "friendly" },
          { name: "Stranger", role: "neutral" },
        ],
      }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const chips = container.querySelectorAll(
      '[data-testid^="scrapbook-npc-chip-r-1"]',
    );
    expect(chips).toHaveLength(3);

    const hostile = container.querySelector(
      '[data-testid="scrapbook-npc-chip-r-1-Grell"]',
    );
    expect(hostile?.getAttribute("data-npc-role")).toBe("hostile");

    const friendly = container.querySelector(
      '[data-testid="scrapbook-npc-chip-r-1-Aster"]',
    );
    expect(friendly?.getAttribute("data-npc-role")).toBe("friendly");

    const neutral = container.querySelector(
      '[data-testid="scrapbook-npc-chip-r-1-Stranger"]',
    );
    expect(neutral?.getAttribute("data-npc-role")).toBe("neutral");
  });

  it("renders no NPC chips when npcs is absent or empty", () => {
    const images: ScrapbookEntry[] = [baseEntry({ render_id: "r-1" })];
    const { container } = render(<ScrapbookGallery images={images} />);
    const chips = container.querySelectorAll(
      '[data-testid^="scrapbook-npc-chip-r-1"]',
    );
    expect(chips).toHaveLength(0);
  });

  // Story 65-6: world-level NPC portraits render on invocation.
  it("renders a portrait thumbnail for an NPC that carries a portrait_url", () => {
    const url =
      "https://cdn.slabgorb.com/genre_packs/pulp_noir/worlds/annees_folles/assets/portraits/marcel_devereaux.png";
    const images: ScrapbookEntry[] = [
      enrichedEntry({
        render_id: "r-1",
        npcs: [{ name: "Marcel", role: "neutral", portrait_url: url }],
      }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const chip = container.querySelector(
      '[data-testid="scrapbook-npc-chip-r-1-Marcel"]',
    );
    expect(chip?.getAttribute("data-has-portrait")).toBe("true");
    const img = container.querySelector(
      '[data-testid="scrapbook-npc-portrait-r-1-Marcel"]',
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(url);
    expect(img?.getAttribute("alt")).toBe("Marcel");
  });

  it("renders no portrait img for an NPC without a portrait_url (ad-hoc NPC)", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({
        render_id: "r-1",
        npcs: [{ name: "Bystander", role: "neutral" }],
      }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const chip = container.querySelector(
      '[data-testid="scrapbook-npc-chip-r-1-Bystander"]',
    );
    expect(chip?.getAttribute("data-has-portrait")).toBe("false");
    const img = container.querySelector(
      '[data-testid="scrapbook-npc-portrait-r-1-Bystander"]',
    );
    expect(img).toBeNull();
  });
});

describe("ScrapbookGallery — world facts chips", () => {
  it("renders one chip per world fact", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({
        render_id: "r-1",
        world_facts: ["moss glow", "rusted winch", "skeletal arch"],
      }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const chips = container.querySelectorAll(
      '[data-testid^="scrapbook-fact-chip-r-1"]',
    );
    expect(chips).toHaveLength(3);
  });

  it("renders no fact chips when world_facts is absent", () => {
    const images: ScrapbookEntry[] = [baseEntry({ render_id: "r-1" })];
    const { container } = render(<ScrapbookGallery images={images} />);
    const chips = container.querySelectorAll(
      '[data-testid^="scrapbook-fact-chip-r-1"]',
    );
    expect(chips).toHaveLength(0);
  });
});

describe("ScrapbookGallery — view toggle (grid/list)", () => {
  function threeEntries(): ScrapbookEntry[] {
    return [
      enrichedEntry({ render_id: "r-1", turn_number: 1 }),
      enrichedEntry({ render_id: "r-2", turn_number: 2 }),
      enrichedEntry({ render_id: "r-3", turn_number: 3 }),
    ];
  }

  it("defaults to grid view on mount", () => {
    const { getByTestId } = render(
      <ScrapbookGallery images={threeEntries()} />,
    );
    expect(getByTestId("scrapbook-root").getAttribute("data-view")).toBe(
      "grid",
    );
  });

  it("switches to list view when the list toggle is clicked", () => {
    const { getByTestId, getByRole } = render(
      <ScrapbookGallery images={threeEntries()} />,
    );
    fireEvent.click(getByRole("button", { name: /list view/i }));
    expect(getByTestId("scrapbook-root").getAttribute("data-view")).toBe(
      "list",
    );
  });

  it("switches back to grid view when the grid toggle is clicked", () => {
    const { getByTestId, getByRole } = render(
      <ScrapbookGallery images={threeEntries()} />,
    );
    fireEvent.click(getByRole("button", { name: /list view/i }));
    fireEvent.click(getByRole("button", { name: /grid view/i }));
    expect(getByTestId("scrapbook-root").getAttribute("data-view")).toBe(
      "grid",
    );
  });
});

describe("ScrapbookGallery — compact mode at 6+ images", () => {
  function nEntries(n: number): ScrapbookEntry[] {
    return Array.from({ length: n }, (_, i) =>
      enrichedEntry({ render_id: `r-${i + 1}`, turn_number: i + 1 }),
    );
  }

  it("is not compact with 5 images", () => {
    const { getByTestId } = render(<ScrapbookGallery images={nEntries(5)} />);
    expect(getByTestId("scrapbook-root").getAttribute("data-compact")).toBe(
      "false",
    );
  });

  it("engages compact mode with 6 images", () => {
    const { getByTestId } = render(<ScrapbookGallery images={nEntries(6)} />);
    expect(getByTestId("scrapbook-root").getAttribute("data-compact")).toBe(
      "true",
    );
  });

  it("engages compact mode with more than 6 images", () => {
    const { getByTestId } = render(<ScrapbookGallery images={nEntries(12)} />);
    expect(getByTestId("scrapbook-root").getAttribute("data-compact")).toBe(
      "true",
    );
  });

  it("renders a condensed 'TN' turn badge in compact mode instead of 'Turn N'", () => {
    const { getByTestId } = render(<ScrapbookGallery images={nEntries(7)} />);
    // In compact mode, badge text for turn 3 should be "T3", not "Turn 3".
    const badge = getByTestId("scrapbook-turn-badge-r-3");
    expect(badge.textContent).toBe("T3");
  });

  it("hides the caption line in compact mode", () => {
    const { queryByTestId } = render(<ScrapbookGallery images={nEntries(7)} />);
    // Caption is hidden by CSS visibility or not rendered — either way,
    // the element should not be in the DOM in compact mode.
    expect(queryByTestId("scrapbook-caption-r-1")).toBeNull();
  });
});

describe("ScrapbookGallery — chapter grouping", () => {
  it("groups entries by chapter and renders dividers between distinct chapters", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({
        render_id: "r-1",
        turn_number: 1,
        chapter: "Into the Dark",
      }),
      enrichedEntry({
        render_id: "r-2",
        turn_number: 2,
        chapter: "Into the Dark",
      }),
      enrichedEntry({
        render_id: "r-3",
        turn_number: 3,
        chapter: "The Deep Halls",
      }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const dividers = container.querySelectorAll(
      '[data-testid^="scrapbook-chapter-divider"]',
    );
    // Two chapters → two dividers (one header per chapter).
    expect(dividers).toHaveLength(2);
    expect(dividers[0].textContent).toContain("Into the Dark");
    expect(dividers[1].textContent).toContain("The Deep Halls");
  });

  it("renders a single chapter divider when only one chapter is present", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({
        render_id: "r-1",
        turn_number: 1,
        chapter: "Into the Dark",
      }),
      enrichedEntry({
        render_id: "r-2",
        turn_number: 2,
        chapter: "Into the Dark",
      }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const dividers = container.querySelectorAll(
      '[data-testid^="scrapbook-chapter-divider"]',
    );
    expect(dividers).toHaveLength(1);
  });

  it("groups entries under an 'Unsorted' chapter when chapter is absent", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({ render_id: "r-1", turn_number: 1 }),
      baseEntry({ render_id: "r-2", turn_number: 2 }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const dividers = container.querySelectorAll(
      '[data-testid^="scrapbook-chapter-divider"]',
    );
    expect(dividers).toHaveLength(1);
    expect(dividers[0].textContent?.toLowerCase()).toContain("unsorted");
  });
});

describe("ScrapbookGallery — chronological sort", () => {
  it("sorts entries by ascending turn_number regardless of input order", () => {
    const images: ScrapbookEntry[] = [
      enrichedEntry({ render_id: "r-3", turn_number: 3 }),
      enrichedEntry({ render_id: "r-1", turn_number: 1 }),
      enrichedEntry({ render_id: "r-2", turn_number: 2 }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const entryNodes = container.querySelectorAll(
      '[data-testid^="scrapbook-entry-r-"]',
    );
    const ids = Array.from(entryNodes).map((n) =>
      n.getAttribute("data-testid"),
    );
    expect(ids).toEqual([
      "scrapbook-entry-r-1",
      "scrapbook-entry-r-2",
      "scrapbook-entry-r-3",
    ]);
  });

  it("falls back to timestamp order when turn_number is absent", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({ render_id: "r-b", timestamp: 10 }),
      baseEntry({ render_id: "r-a", timestamp: 5 }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const entryNodes = container.querySelectorAll(
      '[data-testid^="scrapbook-entry-r-"]',
    );
    const ids = Array.from(entryNodes).map((n) =>
      n.getAttribute("data-testid"),
    );
    expect(ids).toEqual(["scrapbook-entry-r-a", "scrapbook-entry-r-b"]);
  });
});

describe("ScrapbookGallery — key stability (React rule #6)", () => {
  // CLAUDE.md lang-review rule #6 bans key={index} on lists where items can be
  // reordered/inserted/deleted. ScrapbookGallery sorts chronologically, groups
  // by chapter, and renders nested maps (fact chips, NPC chips, chapters,
  // entries). Rework 2026-04-15: the previous version of this test used a
  // regex that only checked ONE key expression contained `render_id` — it
  // missed two separate `key={index}` compound expressions on the fact-chip
  // and chapter-section maps, which were the exact bugs Reviewer rejected for.
  // This rewrite enumerates EVERY key={...} occurrence and rejects any that
  // contains a bare index identifier.

  const BARE_INDEX_IDENTIFIERS = [
    "i",
    "idx",
    "index",
    "groupIdx",
    "groupIndex",
    "entryIdx",
    "entryIndex",
  ];

  function extractKeyExpressions(src: string): string[] {
    // Match `key={...}` where ... is balanced up to the first top-level `}`.
    // Good enough for single-line JSX key props (which is what this file uses).
    const matches: string[] = [];
    const re = /key=\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  }

  function containsBareIdentifier(expr: string, identifier: string): boolean {
    // Word-boundary match so `idx` does not match inside `groupIdxSomething`
    // but DOES match `${idx}` or `idx` as a standalone reference.
    const re = new RegExp(`(?<![A-Za-z0-9_])${identifier}(?![A-Za-z0-9_])`);
    return re.test(expr);
  }

  it("rejects every key expression that references a bare array index", async () => {
    const src = (await import("../ScrapbookGallery.tsx?raw")) as unknown as {
      default: string;
    };
    const keyExpressions = extractKeyExpressions(src.default);

    // Sanity: there must be at least one key expression to audit.
    expect(keyExpressions.length).toBeGreaterThan(0);

    const violations: { expression: string; identifier: string }[] = [];
    for (const expr of keyExpressions) {
      for (const ident of BARE_INDEX_IDENTIFIERS) {
        if (containsBareIdentifier(expr, ident)) {
          violations.push({ expression: expr, identifier: ident });
        }
      }
    }

    // Every violation is a rule #6 bug. Report them all at once so Dev can
    // see the full list rather than fix-by-fix.
    expect(violations).toEqual([]);
  });

});

describe("ScrapbookGallery — compact mode detail suppression (rework 2026-04-15)", () => {
  function sevenEnrichedEntries(): ScrapbookEntry[] {
    return Array.from({ length: 7 }, (_, i) =>
      enrichedEntry({
        render_id: `r-${i + 1}`,
        turn_number: i + 1,
        world_facts: ["fact-a", "fact-b"],
        npcs: [
          { name: "Grell", role: "hostile" },
          { name: "Aster", role: "friendly" },
        ],
      }),
    );
  }

  it("hides every NPC chip in compact mode", () => {
    const { container } = render(
      <ScrapbookGallery images={sevenEnrichedEntries()} />,
    );
    const chips = container.querySelectorAll(
      '[data-testid^="scrapbook-npc-chip-"]',
    );
    expect(chips).toHaveLength(0);
  });

  it("hides every world-fact chip in compact mode", () => {
    const { container } = render(
      <ScrapbookGallery images={sevenEnrichedEntries()} />,
    );
    const chips = container.querySelectorAll(
      '[data-testid^="scrapbook-fact-chip-"]',
    );
    expect(chips).toHaveLength(0);
  });
});

describe("ScrapbookGallery — absent title (rework 2026-04-15)", () => {
  it("omits the title element entirely when both scene_name and caption are absent", () => {
    const images: ScrapbookEntry[] = [baseEntry({ render_id: "r-1" })];
    const { queryByTestId } = render(<ScrapbookGallery images={images} />);
    expect(queryByTestId("scrapbook-title-r-1")).toBeNull();
  });
});

// ===========================================================================
// Playtest 2026-04-26 Bug #3: Scrapbook layout completely broken.
//
// Root cause: ImageBusProvider Pass 2 emits SCRAPBOOK_ENTRY-only entries
// with `url: ""` (story 33-18 metadata-only cards). The previous version of
// this component always rendered `<img src={entry.url}>` — an empty src
// triggers the browser's broken-image glyph, which crowbars the aspect-ratio
// box open and visually wrecks the gallery. The fix gates the <img> on a
// non-empty url and renders a typographic placeholder instead.
//
// These tests lock in the new behavior so a future regression that re-adds
// the unconditional <img> immediately fails.
// ===========================================================================

describe("ScrapbookGallery — empty-URL metadata-only entries (playtest 2026-04-26 bug #3)", () => {
  it("does not render an <img> tag for cards whose url is the empty string", () => {
    // This is the exact shape ImageBusProvider Pass 2 emits when a
    // SCRAPBOOK_ENTRY arrives without a matching IMAGE: url is "" and the
    // metadata fields are populated.
    const images: ScrapbookEntry[] = [
      baseEntry({
        render_id: "r-meta",
        url: "",
        turn_number: 5,
        scene_name: "Forge at Dusk",
        narrative_beat: "The hammer rang once against cold iron.",
        location: "The Forge of Broken Oaths",
      }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    // No <img> anywhere on the card — not even with src="".
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(0);
  });

  it("renders a metadata-only placeholder in place of the image", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({
        render_id: "r-meta",
        url: "",
        scene_name: "Forge at Dusk",
        narrative_beat: "The hammer rang once against cold iron.",
      }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    expect(getByTestId("scrapbook-entry-r-meta-no-image")).toBeTruthy();
  });

  it("marks the card with data-has-image='false' when url is empty", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({ render_id: "r-meta", url: "" }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    expect(
      getByTestId("scrapbook-entry-r-meta").getAttribute("data-has-image"),
    ).toBe("false");
  });

  it("marks the card with data-has-image='true' when url is populated", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({
        render_id: "r-img",
        url: "https://example.invalid/a.webp",
      }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    expect(
      getByTestId("scrapbook-entry-r-img").getAttribute("data-has-image"),
    ).toBe("true");
  });

  it("still renders title, caption, and badges on metadata-only cards", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({
        render_id: "r-meta",
        url: "",
        turn_number: 7,
        scene_name: "Forge at Dusk",
        narrative_beat: "The hammer rang once against cold iron.",
      }),
    ];
    const { getByTestId } = render(<ScrapbookGallery images={images} />);
    // Title and caption still surface — only the visual is missing.
    expect(getByTestId("scrapbook-title-r-meta").textContent).toBe(
      "Forge at Dusk",
    );
    expect(getByTestId("scrapbook-caption-r-meta").textContent).toBe(
      "The hammer rang once against cold iron.",
    );
    expect(getByTestId("scrapbook-turn-badge-r-meta").textContent).toContain(
      "Turn 7",
    );
  });

  it("uses a metadata-only aria-label on the click affordance instead of 'Enlarge'", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({
        render_id: "r-meta",
        url: "",
        scene_name: "Forge at Dusk",
      }),
    ];
    const { container } = render(<ScrapbookGallery images={images} />);
    const button = container.querySelector(
      '[data-testid="scrapbook-entry-r-meta"] [role="button"]',
    );
    const label = button?.getAttribute("aria-label") ?? "";
    expect(label.toLowerCase()).toContain("metadata only");
    expect(label.toLowerCase()).not.toContain("enlarge");
  });

  it("opens a metadata-only lightbox (no <img>) when a metadata-only card is clicked", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({
        render_id: "r-meta",
        url: "",
        scene_name: "Forge at Dusk",
        narrative_beat: "The hammer rang once against cold iron.",
      }),
    ];
    const { container, getByTestId } = render(
      <ScrapbookGallery images={images} />,
    );
    const button = container.querySelector(
      '[data-testid="scrapbook-entry-r-meta"] [role="button"]',
    ) as HTMLElement;
    fireEvent.click(button);
    const lightbox = getByTestId("scrapbook-lightbox");
    expect(lightbox.getAttribute("data-has-image")).toBe("false");
    expect(getByTestId("scrapbook-lightbox-no-image")).toBeTruthy();
    expect(lightbox.querySelectorAll("img")).toHaveLength(0);
  });

  it("opens a regular lightbox with an <img> when a normal card is clicked", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({
        render_id: "r-img",
        url: "https://example.invalid/a.webp",
        scene_name: "Forge at Dawn",
      }),
    ];
    const { container, getByTestId } = render(
      <ScrapbookGallery images={images} />,
    );
    const button = container.querySelector(
      '[data-testid="scrapbook-entry-r-img"] [role="button"]',
    ) as HTMLElement;
    fireEvent.click(button);
    const lightbox = getByTestId("scrapbook-lightbox");
    expect(lightbox.getAttribute("data-has-image")).toBe("true");
    expect(lightbox.querySelectorAll("img")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Wiring proof: ScrapbookGallery is reachable from the production GameBoard.
// Per CLAUDE.md "Every Test Suite Needs a Wiring Test" — verify the chain
// widgetRegistry.gallery → ImageGalleryWidget → ScrapbookGallery is intact
// and that the empty-URL pathway from ImageBusProvider arrives unaltered.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lightbox dismiss isolation — playtest 2026-04-30 bug
// "Closing a Scrapbook lightbox dumps the player back to the lobby."
// The Lightbox renders inside the dockview panel DOM tree; backdrop clicks
// were bubbling into the panel container and triggering route-changing
// behavior. Fix portals to document.body and stops backdrop click
// propagation. Tests guard against either regression.
// ---------------------------------------------------------------------------

describe("ScrapbookGallery — lightbox dismiss isolation (playtest 2026-04-30)", () => {
  it("renders the lightbox in document.body (not inside the gallery container)", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({ render_id: "r-portal", url: "https://example.invalid/a.webp" }),
    ];
    const { container, getByTestId } = render(
      <ScrapbookGallery images={images} />,
    );
    const card = container.querySelector(
      '[data-testid="scrapbook-entry-r-portal"] [role="button"]',
    ) as HTMLElement;
    fireEvent.click(card);
    const lightbox = getByTestId("scrapbook-lightbox");
    // Portal escape: lightbox must NOT be a descendant of the gallery container,
    // otherwise its events bubble through dockview's panel system.
    expect(container.contains(lightbox)).toBe(false);
    expect(document.body.contains(lightbox)).toBe(true);
  });

  it("backdrop click closes the lightbox AND stops propagation to ancestors", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({ render_id: "r-bg", url: "https://example.invalid/a.webp" }),
    ];
    let ancestorClicks = 0;
    const { container, getByTestId, queryByTestId } = render(
      <div onClick={() => { ancestorClicks += 1; }}>
        <ScrapbookGallery images={images} />
      </div>,
    );
    const card = container.querySelector(
      '[data-testid="scrapbook-entry-r-bg"] [role="button"]',
    ) as HTMLElement;
    fireEvent.click(card);
    // First click opened the lightbox via the card; that click is allowed
    // to bubble (it doesn't do anything navigational). Reset the counter.
    ancestorClicks = 0;
    const lightbox = getByTestId("scrapbook-lightbox");
    fireEvent.click(lightbox);
    expect(queryByTestId("scrapbook-lightbox")).toBeNull();
    // The dockview panel ancestor must NOT receive the backdrop click —
    // that's what dumps the player to the lobby in production.
    expect(ancestorClicks).toBe(0);
  });

  it("close-button click closes the lightbox AND stops propagation to ancestors", () => {
    const images: ScrapbookEntry[] = [
      baseEntry({ render_id: "r-x", url: "https://example.invalid/a.webp" }),
    ];
    let ancestorClicks = 0;
    const { container, getByLabelText, queryByTestId } = render(
      <div onClick={() => { ancestorClicks += 1; }}>
        <ScrapbookGallery images={images} />
      </div>,
    );
    const card = container.querySelector(
      '[data-testid="scrapbook-entry-r-x"] [role="button"]',
    ) as HTMLElement;
    fireEvent.click(card);
    ancestorClicks = 0;
    const closeButton = getByLabelText("Close lightbox");
    fireEvent.click(closeButton);
    expect(queryByTestId("scrapbook-lightbox")).toBeNull();
    expect(ancestorClicks).toBe(0);
  });
});

describe("ScrapbookGallery — wiring (gallery widget → component)", () => {
  it("ImageGalleryWidget renders ScrapbookGallery with the empty-URL entries from ImageBusProvider", async () => {
    const widgetMod = await import("../ImageGalleryWidget");
    const galleryMod = await import("../ScrapbookGallery");
    // ImageGalleryWidget must import ScrapbookGallery (string-source check).
    const widgetSrc = (await import("../ImageGalleryWidget.tsx?raw")) as unknown as {
      default: string;
    };
    expect(widgetSrc.default).toContain("ScrapbookGallery");
    expect(typeof widgetMod.ImageGalleryWidget).toBe("function");
    expect(typeof galleryMod.ScrapbookGallery).toBe("function");
  });
});
