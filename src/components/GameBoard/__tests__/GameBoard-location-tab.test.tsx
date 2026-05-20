/**
 * Story 54-9 / ADR-109: wiring test — proves the LocationWidget reaches
 * the live dockview workspace through GameBoard's prop + availableWidgets
 * gate + registry entry, not just lives in a file.
 *
 * Per CLAUDE.md "Every Test Suite Needs a Wiring Test": LocationPanel.test.tsx
 * proves the component renders prose in isolation; this file proves that
 * GameBoard imports it, gates the tab on `currentLocation`, slots it in
 * `rightGroupOrder` between `map` and `knowledge`, and that App.tsx
 * forwards `state.currentLocation` into the `currentLocation` prop.
 *
 * Pattern follows `gameboard-wiring.test.tsx` (importability + `?raw`
 * source checks). The earlier draft of this test mounted GameBoard and
 * queried the dockview DOM for `location-panel`; that fails under jsdom
 * because dockview's right-group panels never render — a known test-env
 * limitation, not a wiring bug. Verified: under the same environment
 * every other GameBoard right-group panel is also absent from the DOM,
 * yet the full UI suite passes. The wiring contract is enforced at the
 * source level instead.
 */
import { describe, it, expect } from "vitest";

describe("GameBoard — location tab wiring (Story 54-9)", () => {
  it("LocationWidget is importable from the registered path", async () => {
    const mod = await import(
      "@/components/GameBoard/widgets/LocationWidget"
    );
    expect(typeof mod.LocationWidget).toBe("function");
  });

  it("LocationPanel is importable from the components path", async () => {
    const mod = await import("@/components/LocationPanel");
    expect(typeof mod.LocationPanel).toBe("function");
  });

  it("widgetRegistry includes the 'location' entry with hotkey 'l' and dataGated:true", async () => {
    const mod = await import("@/components/GameBoard/widgetRegistry");
    const entry = (mod.WIDGET_REGISTRY as Record<string, unknown>).location as
      | { hotkey?: string; dataGated?: boolean }
      | undefined;
    expect(entry).toBeDefined();
    expect(entry!.hotkey).toBe("l");
    expect(entry!.dataGated).toBe(true);
  });

  it("GameBoard imports LocationWidget and exposes the currentLocation prop", async () => {
    const src = (
      await import("@/components/GameBoard/GameBoard?raw")
    ).default as string;
    expect(src).toContain('import { LocationWidget } from "./widgets/LocationWidget"');
    expect(src).toMatch(/currentLocation\?:\s*LocationDescriptionPayload\s*\|\s*null/);
  });

  it("GameBoard gates the 'location' tab on currentLocation in availableWidgets", async () => {
    const src = (
      await import("@/components/GameBoard/GameBoard?raw")
    ).default as string;
    // Gate must be conditional — unconditional `available.add("location")`
    // would render the empty-state panel during chargen.
    expect(src).toMatch(/if\s*\(\s*currentLocation\s*\)\s*available\.add\(\s*["']location["']\s*\)/);
  });

  it("GameBoard renders LocationWidget in the 'location' switch case", async () => {
    const src = (
      await import("@/components/GameBoard/GameBoard?raw")
    ).default as string;
    expect(src).toMatch(/case\s+["']location["']\s*:[\s\S]*?<LocationWidget\s+data={currentLocation/);
  });

  it("GameBoard rightGroupOrder slots 'location' between 'map' and 'knowledge'", async () => {
    const src = (
      await import("@/components/GameBoard/GameBoard?raw")
    ).default as string;
    // Pull out the rightGroupOrder array literal and assert ordering.
    const match = src.match(/rightGroupOrder:\s*WidgetId\[\]\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    const order = match![1]
      .split(",")
      .map((s) => s.trim().replace(/["']/g, ""))
      .filter((s) => s.length > 0);
    const mapIdx = order.indexOf("map");
    const locIdx = order.indexOf("location");
    const knowIdx = order.indexOf("knowledge");
    expect(mapIdx).toBeGreaterThanOrEqual(0);
    expect(locIdx).toBeGreaterThanOrEqual(0);
    expect(knowIdx).toBeGreaterThanOrEqual(0);
    expect(locIdx).toBeGreaterThan(mapIdx);
    expect(locIdx).toBeLessThan(knowIdx);
  });

  it("App.tsx forwards state.currentLocation into GameBoard's currentLocation prop", async () => {
    const src = (await import("@/App?raw")).default as string;
    expect(src).toMatch(/currentLocation=\{gameState\.currentLocation\s*\?\?\s*null\}/);
  });
});
