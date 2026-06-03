import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  type ChromeArchetype,
  getArchetypeForGenre,
  ARCHETYPE_PROPERTIES,
  applyArchetypeToElement,
  useChromeArchetype,
  useScopedChromeArchetype,
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
  const archetypes: ChromeArchetype[] = ["parchment", "terminal", "rugged", "house"];

  it("defines properties for all four archetypes", () => {
    for (const arch of archetypes) {
      expect(ARCHETYPE_PROPERTIES[arch]).toBeDefined();
    }
  });

  it("house uses a serif body distinct from parchment", () => {
    expect(ARCHETYPE_PROPERTIES["house"]["--font-body"]).toMatch(/serif/i);
    expect(ARCHETYPE_PROPERTIES["house"]["--font-body"]).not.toEqual(
      ARCHETYPE_PROPERTIES["parchment"]["--font-body"],
    );
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
    expect(radii.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Hook: useChromeArchetype
// ---------------------------------------------------------------------------

// The hooks are now ARCHETYPE-driven, not genre-driven. Callers resolve a
// genre slug to an archetype via `getArchetypeForGenre` BEFORE calling, so the
// hook can also apply the non-genre `house` chrome. Inputs below are archetypes.

describe("applyArchetypeToElement (pure helper)", () => {
  it("sets the attribute + CSS vars and returns the keys it set", () => {
    const el = document.createElement("div");
    const keys = applyArchetypeToElement(el, "terminal", []);
    expect(el.getAttribute("data-archetype")).toBe("terminal");
    expect(el.style.getPropertyValue("--font-body")).toMatch(/mono/i);
    // Keys returned must match what was set, so the caller can clean up exactly.
    expect(keys).toEqual(Object.keys(ARCHETYPE_PROPERTIES["terminal"]));
  });

  it("removes the previously-set keys before applying the next archetype (no leak)", () => {
    const el = document.createElement("div");
    const firstKeys = applyArchetypeToElement(el, "terminal", []);
    const secondKeys = applyArchetypeToElement(el, "parchment", firstKeys);
    expect(el.getAttribute("data-archetype")).toBe("parchment");
    expect(el.style.getPropertyValue("--font-body")).toMatch(/serif/i);
    expect(el.style.getPropertyValue("--font-body")).not.toMatch(/mono/i);
    expect(secondKeys).toEqual(Object.keys(ARCHETYPE_PROPERTIES["parchment"]));
  });

  it("clears the attribute and prior keys and returns [] when given null", () => {
    const el = document.createElement("div");
    const keys = applyArchetypeToElement(el, "rugged", []);
    const cleared = applyArchetypeToElement(el, null, keys);
    expect(el.getAttribute("data-archetype")).toBeNull();
    expect(el.style.getPropertyValue("--font-body")).toBe("");
    expect(cleared).toEqual([]);
  });
});

describe("useChromeArchetype (root)", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = "";
    document.documentElement.removeAttribute("data-archetype");
  });

  it("sets data-archetype on the document element", () => {
    renderHook(() => useChromeArchetype("parchment"));
    expect(document.documentElement.getAttribute("data-archetype")).toBe("parchment");
  });

  it("injects archetype CSS custom properties onto :root", () => {
    renderHook(() => useChromeArchetype("terminal"));
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--font-body")).toMatch(/mono/i);
    expect(style.getPropertyValue("--font-ui")).toBeTruthy();
    expect(style.getPropertyValue("--border-radius")).toBeDefined();
  });

  it("updates archetype when the input changes", () => {
    const { rerender } = renderHook(
      ({ a }: { a: ChromeArchetype }) => useChromeArchetype(a),
      { initialProps: { a: "parchment" as ChromeArchetype } },
    );
    expect(document.documentElement.getAttribute("data-archetype")).toBe("parchment");
    rerender({ a: "terminal" });
    expect(document.documentElement.getAttribute("data-archetype")).toBe("terminal");
  });

  it("cleans up previous CSS properties when switching", () => {
    const { rerender } = renderHook(
      ({ a }: { a: ChromeArchetype }) => useChromeArchetype(a),
      { initialProps: { a: "terminal" as ChromeArchetype } },
    );
    expect(document.documentElement.style.getPropertyValue("--font-body")).toMatch(/mono/i);
    rerender({ a: "parchment" });
    expect(document.documentElement.style.getPropertyValue("--font-body")).toMatch(/serif/i);
    expect(document.documentElement.style.getPropertyValue("--font-body")).not.toMatch(/mono/i);
  });

  it("applies the non-genre house archetype on the root", () => {
    renderHook(() => useChromeArchetype("house"));
    expect(document.documentElement.getAttribute("data-archetype")).toBe("house");
    expect(document.documentElement.style.getPropertyValue("--font-body")).toMatch(/serif/i);
  });

  it("removes data-archetype when given null", () => {
    const { rerender } = renderHook(
      ({ a }: { a: ChromeArchetype | null }) => useChromeArchetype(a),
      { initialProps: { a: "rugged" as ChromeArchetype | null } },
    );
    expect(document.documentElement.getAttribute("data-archetype")).toBe("rugged");
    rerender({ a: null });
    expect(document.documentElement.getAttribute("data-archetype")).toBeNull();
  });

  it("does not clobber genre color variables", () => {
    document.documentElement.style.setProperty("--primary", "#C4650A");
    renderHook(() => useChromeArchetype("rugged"));
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#C4650A");
    expect(document.documentElement.style.getPropertyValue("--font-body")).toBeTruthy();
  });
});

describe("useScopedChromeArchetype", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = "";
    document.documentElement.removeAttribute("data-archetype");
  });

  it("applies the archetype to the ref element, NOT the document root", () => {
    const el = document.createElement("div");
    const ref = { current: el };
    renderHook(() => useScopedChromeArchetype(ref, "terminal"));
    expect(el.getAttribute("data-archetype")).toBe("terminal");
    expect(el.style.getPropertyValue("--font-body")).toMatch(/mono/i);
    // Root must be untouched by the scoped applier — this is the whole point:
    // genre flavor stays confined to the card subtree, never the lobby shell.
    expect(document.documentElement.getAttribute("data-archetype")).toBeNull();
  });

  it("cleans up stale CSS vars on the scoped element when the archetype changes", () => {
    const el = document.createElement("div");
    const ref = { current: el };
    const { rerender } = renderHook(
      ({ a }: { a: ChromeArchetype }) => useScopedChromeArchetype(ref, a),
      { initialProps: { a: "terminal" as ChromeArchetype } },
    );
    expect(el.style.getPropertyValue("--font-body")).toMatch(/mono/i);
    rerender({ a: "parchment" });
    expect(el.style.getPropertyValue("--font-body")).toMatch(/serif/i);
    expect(el.style.getPropertyValue("--font-body")).not.toMatch(/mono/i);
  });

  it("is a no-op when the ref is empty", () => {
    const ref = { current: null as HTMLElement | null };
    expect(() => renderHook(() => useScopedChromeArchetype(ref, "house"))).not.toThrow();
    expect(document.documentElement.getAttribute("data-archetype")).toBeNull();
  });
});
