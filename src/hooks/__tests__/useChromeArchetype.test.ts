import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  type ChromeArchetype,
  getArchetypeForGenre,
  ARCHETYPE_PROPERTIES,
  useChromeArchetype,
} from "@/hooks/useChromeArchetype";

// ---------------------------------------------------------------------------
// Unit: getArchetypeForGenre mapping
// ---------------------------------------------------------------------------

describe("getArchetypeForGenre", () => {
  it("maps low_fantasy to parchment", () => {
    expect(getArchetypeForGenre("low_fantasy")).toBe("parchment");
  });

  it("maps tea_and_murder to parchment", () => {
    expect(getArchetypeForGenre("tea_and_murder")).toBe("parchment");
  });

  it("maps elemental_harmony to parchment", () => {
    expect(getArchetypeForGenre("elemental_harmony")).toBe("parchment");
  });

  it("maps wry_whimsy to parchment", () => {
    expect(getArchetypeForGenre("wry_whimsy")).toBe("parchment");
  });

  it("maps neon_dystopia to terminal", () => {
    expect(getArchetypeForGenre("neon_dystopia")).toBe("terminal");
  });

  it("maps space_opera to terminal", () => {
    expect(getArchetypeForGenre("space_opera")).toBe("terminal");
  });

  it("maps road_warrior to rugged", () => {
    expect(getArchetypeForGenre("road_warrior")).toBe("rugged");
  });

  it("maps mutant_wasteland to rugged", () => {
    expect(getArchetypeForGenre("mutant_wasteland")).toBe("rugged");
  });

  it("maps spaghetti_western to rugged", () => {
    expect(getArchetypeForGenre("spaghetti_western")).toBe("rugged");
  });

  it("maps pulp_noir to rugged", () => {
    expect(getArchetypeForGenre("pulp_noir")).toBe("rugged");
  });

  it("maps caverns_and_claudes to rugged", () => {
    expect(getArchetypeForGenre("caverns_and_claudes")).toBe("rugged");
  });

  it("maps heavy_metal to rugged", () => {
    expect(getArchetypeForGenre("heavy_metal")).toBe("rugged");
  });

  it("throws on unknown genre slug", () => {
    expect(() => getArchetypeForGenre("totally_unknown")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Unit: ARCHETYPE_PROPERTIES definitions
// ---------------------------------------------------------------------------

describe("ARCHETYPE_PROPERTIES", () => {
  const archetypes: ChromeArchetype[] = ["parchment", "terminal", "rugged"];

  it("defines properties for all three archetypes", () => {
    for (const arch of archetypes) {
      expect(ARCHETYPE_PROPERTIES[arch]).toBeDefined();
    }
  });

  it("each archetype has a font-body CSS property", () => {
    for (const arch of archetypes) {
      expect(ARCHETYPE_PROPERTIES[arch]["--font-body"]).toBeTruthy();
    }
  });

  it("each archetype has a font-ui CSS property", () => {
    for (const arch of archetypes) {
      expect(ARCHETYPE_PROPERTIES[arch]["--font-ui"]).toBeTruthy();
    }
  });

  it("each archetype has a border-radius CSS property", () => {
    for (const arch of archetypes) {
      expect(ARCHETYPE_PROPERTIES[arch]["--border-radius"]).toBeDefined();
    }
  });

  it("parchment uses serif fonts", () => {
    expect(ARCHETYPE_PROPERTIES["parchment"]["--font-body"]).toMatch(/serif/i);
  });

  it("terminal uses monospace fonts", () => {
    expect(ARCHETYPE_PROPERTIES["terminal"]["--font-body"]).toMatch(/mono/i);
  });

  it("rugged uses sans-serif fonts", () => {
    expect(ARCHETYPE_PROPERTIES["rugged"]["--font-body"]).toMatch(/sans/i);
  });

  it("archetypes have distinct border-radius values", () => {
    const radii = new Set(archetypes.map((a) => ARCHETYPE_PROPERTIES[a]["--border-radius"]));
    expect(radii.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Hook: useChromeArchetype
// ---------------------------------------------------------------------------

describe("useChromeArchetype", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = "";
    document.documentElement.removeAttribute("data-archetype");
  });

  it("sets data-archetype attribute on document element", () => {
    renderHook(() => useChromeArchetype("low_fantasy"));
    expect(document.documentElement.getAttribute("data-archetype")).toBe("parchment");
  });

  it("injects archetype CSS custom properties onto :root", () => {
    renderHook(() => useChromeArchetype("neon_dystopia"));
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--font-body")).toMatch(/mono/i);
    expect(style.getPropertyValue("--font-ui")).toBeTruthy();
    expect(style.getPropertyValue("--border-radius")).toBeDefined();
  });

  it("updates archetype when genre slug changes", () => {
    const { rerender } = renderHook(
      ({ genre }: { genre: string }) => useChromeArchetype(genre),
      { initialProps: { genre: "low_fantasy" } },
    );

    expect(document.documentElement.getAttribute("data-archetype")).toBe("parchment");

    rerender({ genre: "neon_dystopia" });
    expect(document.documentElement.getAttribute("data-archetype")).toBe("terminal");
  });

  it("cleans up previous archetype CSS properties when switching", () => {
    const { rerender } = renderHook(
      ({ genre }: { genre: string }) => useChromeArchetype(genre),
      { initialProps: { genre: "neon_dystopia" } },
    );

    // Terminal archetype has monospace font
    expect(document.documentElement.style.getPropertyValue("--font-body")).toMatch(/mono/i);

    rerender({ genre: "low_fantasy" });

    // After switch to parchment, font should be serif, not monospace
    expect(document.documentElement.style.getPropertyValue("--font-body")).toMatch(/serif/i);
    expect(document.documentElement.style.getPropertyValue("--font-body")).not.toMatch(/mono/i);
  });

  it("returns the current archetype value", () => {
    const { result } = renderHook(() => useChromeArchetype("road_warrior"));
    expect(result.current).toBe("rugged");
  });

  it("returns updated archetype after genre change", () => {
    const { result, rerender } = renderHook(
      ({ genre }: { genre: string }) => useChromeArchetype(genre),
      { initialProps: { genre: "road_warrior" } },
    );

    expect(result.current).toBe("rugged");

    rerender({ genre: "space_opera" });
    expect(result.current).toBe("terminal");
  });
});

// ---------------------------------------------------------------------------
// Wiring: archetype integrates with existing theme system
// ---------------------------------------------------------------------------

describe("useChromeArchetype wiring", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = "";
    document.documentElement.removeAttribute("data-archetype");
  });

  it("archetype properties do not clobber genre color variables", () => {
    // Simulate genre colors already set (as useGenreTheme would do)
    document.documentElement.style.setProperty("--primary", "#C4650A");
    document.documentElement.style.setProperty("--background", "#1a1208");

    renderHook(() => useChromeArchetype("road_warrior"));

    // Genre colors should survive — archetype only sets structural properties
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#C4650A");
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("#1a1208");

    // Archetype structural properties should be set
    expect(document.documentElement.style.getPropertyValue("--font-body")).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue("--border-radius")).toBeDefined();
  });

  it("data-archetype attribute enables CSS selector targeting", () => {
    renderHook(() => useChromeArchetype("neon_dystopia"));

    // The data-archetype attribute should allow CSS selectors like
    // [data-archetype="terminal"] .panel { ... }
    const attr = document.documentElement.getAttribute("data-archetype");
    expect(attr).toBe("terminal");
    expect(["parchment", "terminal", "rugged"]).toContain(attr);
  });
});
