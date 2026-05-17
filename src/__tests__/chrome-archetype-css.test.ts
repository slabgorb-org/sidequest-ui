import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Load the archetype CSS file as a string for content verification.
// jsdom doesn't process external CSS, so we verify selectors and rules
// by parsing the raw CSS text.
// ---------------------------------------------------------------------------

const CSS_PATH = resolve(__dirname, "../styles/archetype-chrome.css");

function loadArchetypeCSS(): string {
  return readFileSync(CSS_PATH, "utf-8");
}

// ---------------------------------------------------------------------------
// AC1: Three CSS archetype rulesets targeting [data-archetype="X"]
// ---------------------------------------------------------------------------

describe("archetype CSS selectors", () => {
  it("contains [data-archetype=\"parchment\"] selector", () => {
    const css = loadArchetypeCSS();
    expect(css).toContain('[data-archetype="parchment"]');
  });

  it("contains [data-archetype=\"terminal\"] selector", () => {
    const css = loadArchetypeCSS();
    expect(css).toContain('[data-archetype="terminal"]');
  });

  it("contains [data-archetype=\"rugged\"] selector", () => {
    const css = loadArchetypeCSS();
    expect(css).toContain('[data-archetype="rugged"]');
  });
});

// ---------------------------------------------------------------------------
// AC2: Texture overlays via ::before pseudo-elements
// ---------------------------------------------------------------------------

describe("archetype texture overlays", () => {
  it("parchment has a radial-gradient vignette overlay", () => {
    const css = loadArchetypeCSS();
    // Parchment uses radial-gradient for aged paper effect
    const parchmentSection = extractArchetypeSection(css, "parchment");
    expect(parchmentSection).toContain("radial-gradient");
    expect(parchmentSection).toMatch(/::before|::after/);
  });

  it("terminal has CRT scanline overlay", () => {
    const css = loadArchetypeCSS();
    const terminalSection = extractArchetypeSection(css, "terminal");
    // CRT scanlines use repeating-linear-gradient
    expect(terminalSection).toContain("repeating-linear-gradient");
    expect(terminalSection).toMatch(/::before|::after/);
  });

  it("rugged has dusty vignette overlay", () => {
    const css = loadArchetypeCSS();
    const ruggedSection = extractArchetypeSection(css, "rugged");
    expect(ruggedSection).toContain("radial-gradient");
    expect(ruggedSection).toMatch(/::before|::after/);
  });
});

// ---------------------------------------------------------------------------
// AC3-5: Archetype-specific structural rules
// ---------------------------------------------------------------------------

describe("parchment archetype rules", () => {
  it("sets soft borders (1px)", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "parchment");
    expect(section).toMatch(/border.*1px/);
  });

  it("uses linear-gradient for panel/header backgrounds", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "parchment");
    expect(section).toContain("linear-gradient");
  });
});

describe("terminal archetype rules", () => {
  it("defines glow CSS custom properties", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "terminal");
    expect(section).toContain("--glow-primary");
    expect(section).toContain("--glow-accent");
  });

  it("uses text-shadow for neon glow effects", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "terminal");
    expect(section).toContain("text-shadow");
  });
});

describe("rugged archetype rules", () => {
  it("sets heavy borders (2px)", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "rugged");
    expect(section).toMatch(/border.*2px/);
  });

  it("uses text-transform uppercase for headers", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "rugged");
    expect(section).toContain("text-transform");
    expect(section).toContain("uppercase");
  });
});

// ---------------------------------------------------------------------------
// Widget chrome rules — per-archetype [data-widget] rulesets (Story 33-1)
// ---------------------------------------------------------------------------

describe("widget chrome rules", () => {
  const archetypes = ["parchment", "terminal", "rugged"] as const;

  for (const archetype of archetypes) {
    describe(`${archetype} widget rules`, () => {
      it("contains a [data-widget] selector inside the archetype section", () => {
        const css = loadArchetypeCSS();
        const section = extractArchetypeSection(css, archetype);
        expect(section).toContain(`[data-archetype="${archetype}"] [data-widget]`);
      });

      it("sets a box-shadow on the widget root", () => {
        const css = loadArchetypeCSS();
        const widgetBlock = extractWidgetBlock(css, archetype);
        expect(widgetBlock).toContain("box-shadow");
      });

      it("styles the widget-drag-handle header", () => {
        const css = loadArchetypeCSS();
        const section = extractArchetypeSection(css, archetype);
        expect(section).toContain(
          `[data-archetype="${archetype}"] [data-widget] .widget-drag-handle`,
        );
      });

      it("does not set padding, margin, width, or height on [data-widget] (AC-7 composition)", () => {
        const css = loadArchetypeCSS();
        const widgetBlock = extractWidgetBlock(css, archetype);
        // Guard against any layout properties that would fight WidgetWrapper's Tailwind classes.
        // Split into lines and scan each for forbidden property names.
        const forbidden = /^\s*(padding|margin|width|height|flex)(-[a-z]+)?\s*:/m;
        expect(widgetBlock).not.toMatch(forbidden);
      });
    });
  }

  it("parchment widget has corner flourish pseudo-elements (::before and ::after)", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "parchment");
    expect(section).toContain('[data-archetype="parchment"] [data-widget]::before');
    expect(section).toContain('[data-archetype="parchment"] [data-widget]::after');
  });

  it("terminal widget has a scan-line ::after overlay using repeating-linear-gradient", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "terminal");
    expect(section).toContain('[data-archetype="terminal"] [data-widget]::after');
    // The scanline overlay must use repeating-linear-gradient inside the widget ::after block
    const afterBlock = extractRuleBlock(
      section,
      '[data-archetype="terminal"] [data-widget]::after',
    );
    expect(afterBlock).toContain("repeating-linear-gradient");
  });

  it("rugged widget has metal bracket pseudo-elements (::before and ::after)", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "rugged");
    expect(section).toContain('[data-archetype="rugged"] [data-widget]::before');
    expect(section).toContain('[data-archetype="rugged"] [data-widget]::after');
  });

  // Regression guard for the HIGH finding from the first review round:
  // rugged corner brackets were originally at top/left/bottom/right: -3px, which
  // got clipped by WidgetWrapper's overflow:hidden. The rugged section contains
  // only pseudo-element decorations inside an overflow:hidden container, so any
  // negative offset here is a red flag — it would recreate the clipping bug.
  // This test scans the whole rugged section for negative top/left/bottom/right
  // declarations.
  it("rugged section has no negative offsets (chrome would be clipped by overflow:hidden)", () => {
    const css = loadArchetypeCSS();
    const section = extractArchetypeSection(css, "rugged");
    const negativeOffset = /\b(top|left|bottom|right)\s*:\s*-\d/;
    expect(section).not.toMatch(negativeOffset);
  });
});

// ---------------------------------------------------------------------------
// AC6: CSS lives in a dedicated file (not inline)
// ---------------------------------------------------------------------------

describe("archetype CSS file structure", () => {
  it("file exists at src/styles/archetype-chrome.css", () => {
    // This will throw if the file doesn't exist (loadArchetypeCSS reads it)
    const css = loadArchetypeCSS();
    expect(css.length).toBeGreaterThan(0);
  });

  it("contains all three archetype blocks in a single file", () => {
    const css = loadArchetypeCSS();
    const archetypes = ["parchment", "terminal", "rugged"];
    for (const arch of archetypes) {
      expect(css).toContain(`[data-archetype="${arch}"]`);
    }
  });

  it("does not contain color property definitions (colors come from genre theme)", () => {
    const css = loadArchetypeCSS();
    // Archetype CSS should only set structural properties, not override genre colors.
    // It should reference color vars (var(--primary)), not set them (--primary: #xxx).
    // Exception: archetype-specific extra vars like --glow-primary are OK.
    const lines = css.split("\n");
    const colorOverrides = lines.filter(
      (line) =>
        /^\s*--(?:primary|secondary|accent|background|surface|text|border)\s*:/.test(line),
    );
    expect(colorOverrides).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC7: Wiring — CSS is imported by the app
// ---------------------------------------------------------------------------

describe("archetype CSS wiring", () => {
  it("is imported in main.tsx or index.css", () => {
    // Check that the archetype CSS file is imported somewhere in the app entry
    const mainPath = resolve(__dirname, "../main.tsx");
    const indexCssPath = resolve(__dirname, "../index.css");

    const mainContent = readFileSync(mainPath, "utf-8");
    const indexCssContent = readFileSync(indexCssPath, "utf-8");

    const isImported =
      mainContent.includes("archetype-chrome") ||
      indexCssContent.includes("archetype-chrome");

    expect(isImported).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helper: Extract the CSS section for a specific archetype
// ---------------------------------------------------------------------------

/**
 * Extracts all CSS rules that target a specific archetype.
 * Looks for [data-archetype="X"] and grabs everything until the next
 * archetype selector or end of file.
 */
function extractArchetypeSection(css: string, archetype: string): string {
  const selector = `[data-archetype="${archetype}"]`;
  const startIndex = css.indexOf(selector);
  if (startIndex === -1) return "";

  // Find the next archetype selector or end of file
  const archetypes = ["parchment", "terminal", "rugged"];
  const otherArchetypes = archetypes.filter((a) => a !== archetype);

  let endIndex = css.length;
  for (const other of otherArchetypes) {
    const otherSelector = `[data-archetype="${other}"]`;
    const otherIndex = css.indexOf(otherSelector, startIndex + selector.length);
    if (otherIndex !== -1 && otherIndex < endIndex) {
      endIndex = otherIndex;
    }
  }

  return css.slice(startIndex, endIndex);
}

/**
 * Extracts the first rule block (from `{` to its matching `}`) for a specific
 * CSS selector. Walks braces to handle nested groups correctly. Returns the
 * block contents without the surrounding braces, or an empty string if the
 * selector is not found.
 */
function extractRuleBlock(css: string, selector: string): string {
  const selectorIndex = css.indexOf(selector);
  if (selectorIndex === -1) return "";

  const openBrace = css.indexOf("{", selectorIndex);
  if (openBrace === -1) return "";

  // Walk forward counting braces to find the matching close.
  let depth = 1;
  let i = openBrace + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return "";

  return css.slice(openBrace + 1, i);
}

/**
 * Extracts the rule block for the `[data-archetype="X"] [data-widget]` root
 * selector (no trailing descendant, no pseudo-element). Used to check that
 * no layout properties (padding/margin/width/height/flex) are declared on
 * the widget root itself. Anchored on the literal `{` to avoid matching
 * descendant rules like `[data-archetype="X"] [data-widget] .widget-drag-handle`.
 */
function extractWidgetBlock(css: string, archetype: string): string {
  const rootSelector = `[data-archetype="${archetype}"] [data-widget] {`;
  const selectorIndex = css.indexOf(rootSelector);
  if (selectorIndex === -1) return "";
  const openBrace = selectorIndex + rootSelector.length - 1;

  // Walk forward counting braces to find the matching close.
  let depth = 1;
  let i = openBrace + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return "";
  return css.slice(openBrace + 1, i);
}
