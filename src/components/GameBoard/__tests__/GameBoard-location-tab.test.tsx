/**
 * Story 54-9 / ADR-109: wiring test — proves the LocationWidget reaches
 * the live dockview workspace through GameBoard's prop + availableWidgets
 * gate, not just lives in a file.
 *
 * Per CLAUDE.md "Every Test Suite Needs a Wiring Test": LocationPanel.test.tsx
 * proves the component renders prose in isolation; this file proves that
 * the panel is actually imported, registered, and reachable when GameBoard
 * mounts with a non-null `currentLocation` prop — and is hidden (dataGated)
 * when `currentLocation` is null.
 *
 * Mounting pattern mirrors runningHeader-wiring.test.tsx (ImageBusProvider
 * wrap + desktop matchMedia mock so the dockview workspace renders instead
 * of MobileTabView).
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { CharacterSummary } from "@/types/party";
import type { LocationDescriptionPayload } from "@/types/payloads";

const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  // Force desktop breakpoint so the dockview workspace mounts (the test
  // default is mobile, which routes GameBoard through MobileTabView and
  // skips the dockview tabs entirely).
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("min-width: 1200px"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

function makeChar(player_id: string): CharacterSummary {
  return {
    player_id,
    name: player_id,
    character_name: player_id,
    portrait_url: "",
    hp: 10,
    hp_max: 10,
    status_effects: [],
    class: "Pilot",
    level: 1,
    current_location: "glenross_pub",
  };
}

function renderBoard(props: Partial<GameBoardProps>) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [makeChar("p1")],
    onSend: vi.fn(),
    disabled: false,
    currentPlayerId: "p1",
  };
  const merged = { ...defaults, ...props };
  return render(
    <ImageBusProvider messages={merged.messages}>
      <GameBoard {...merged} />
    </ImageBusProvider>,
  );
}

const samplePayload: LocationDescriptionPayload = {
  region_id: "glenross_pub",
  prose: "The pub door is ajar.",
  terrain: "building",
  entities: [],
  overlays: [],
};

describe("GameBoard — location tab wiring (Story 54-9)", () => {
  it("renders the LocationPanel when currentLocation is non-null", () => {
    renderBoard({ currentLocation: samplePayload });
    // The dataGated tab mounts and the panel's testid is unique in the DOM.
    expect(screen.getByTestId("location-panel")).toBeTruthy();
  });

  it("does NOT render the LocationPanel when currentLocation is null", () => {
    renderBoard({ currentLocation: null });
    // Per spec §6.1 — dataGated:true means the tab is hidden entirely
    // when no manifest has been delivered. Neither panel nor empty-state
    // mount; the tab itself is absent from availableWidgets.
    expect(screen.queryByTestId("location-panel")).toBeNull();
    expect(screen.queryByTestId("location-empty")).toBeNull();
  });

  it("LocationWidget is importable from the registered path", async () => {
    const mod = await import(
      "@/components/GameBoard/widgets/LocationWidget"
    );
    expect(typeof mod.LocationWidget).toBe("function");
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
});
