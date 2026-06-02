/**
 * ADR-136 Task 15: end-to-end wiring of the Relationships widget into GameBoard.
 *
 * Two contracts are proven here:
 *   1. Wiring — RelationshipsWidget is importable and the registry entry is
 *      dataGated:true.
 *   2. Data gating — the Relationships tab appears in GameBoard's dock when
 *      `relationshipsData` carries at least one entry, and is absent when the
 *      data is null. Mirrors the Location tab pattern (GameBoard-location-tab),
 *      but the Relationships gate is on the transient data payload (no stable
 *      world-capability signal), so an empty/null roster yields no tab clutter.
 *
 * The behavior tests render GameBoard (jsdom → mobile MobileTabView path) and
 * assert the tab via its accessible "tab" role + "Relationships" label.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function renderBoard(overrides: Partial<GameBoardProps> = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [
      {
        player_id: "p1",
        name: "Mira",
        character_name: "Mira",
        class: "Sleuth",
        level: 1,
        hp: 10,
        hp_max: 10,
        status_effects: [],
        portrait_url: "",
        current_location: "",
      },
    ],
    onSend: vi.fn(),
    disabled: false,
  };
  const props = { ...defaults, ...overrides };
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
}

function relationshipsTab() {
  return screen.queryByRole("tab", { name: /relationships/i });
}

describe("GameBoard — relationships widget wiring", () => {
  it("RelationshipsWidget is importable from the registered path", async () => {
    const mod = await import("@/components/GameBoard/widgets/RelationshipsWidget");
    expect(typeof mod.RelationshipsWidget).toBe("function");
  });

  it("widgetRegistry includes the 'relationships' entry with dataGated:true", async () => {
    const mod = await import("@/components/GameBoard/widgetRegistry");
    const entry = (mod.WIDGET_REGISTRY as Record<string, { dataGated?: boolean }>).relationships;
    expect(entry).toBeDefined();
    expect(entry!.dataGated).toBe(true);
  });
});

describe("GameBoard — relationships tab rendering", () => {
  it("shows the Relationships tab when relationshipsData is present", () => {
    renderBoard({
      relationshipsData: [
        {
          name: "Tabitha",
          portrait_url: null,
          band: "Warm",
          disposition: 24,
          trend: "up",
          last_seen_turn: 6,
          last_seen_location: "parlor",
          beats: [],
          personality_read: null,
          ocean: null,
          claims: [],
        },
      ],
    });
    expect(relationshipsTab()).toBeInTheDocument();
  });

  it("does NOT show the Relationships tab when relationshipsData is null", () => {
    renderBoard({ relationshipsData: null });
    expect(relationshipsTab()).not.toBeInTheDocument();
  });
});
