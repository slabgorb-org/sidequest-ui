/**
 * Relationships widget wiring — always-present tab with empty state.
 *
 * Playtest override 2026-06-04: Keith wants the Relationships tab present
 * from session start rather than popping in when the first NPC is met.
 * Two contracts are proven here:
 *   1. Wiring — RelationshipsWidget is importable and the registry entry is
 *      dataGated:false (always registered).
 *   2. Always-present — the Relationships tab appears in GameBoard's dock
 *      regardless of whether `relationshipsData` is null or populated.
 *   3. Empty state — when data is null the panel renders the "No one met yet"
 *      copy instead of nothing.
 *
 * The behavior tests render GameBoard (jsdom → mobile MobileTabView path) and
 * assert the tab via its accessible "tab" role + "Relationships" label.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("widgetRegistry includes the 'relationships' entry with dataGated:false (always present)", async () => {
    const mod = await import("@/components/GameBoard/widgetRegistry");
    const entry = (mod.WIDGET_REGISTRY as Record<string, { dataGated?: boolean }>).relationships;
    expect(entry).toBeDefined();
    expect(entry!.dataGated).toBe(false);
  });
});

describe("GameBoard — relationships tab always present", () => {
  it("shows the Relationships tab when relationshipsData is populated", () => {
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

  it("shows the Relationships tab even when relationshipsData is null (stable from session start)", () => {
    renderBoard({ relationshipsData: null });
    expect(relationshipsTab()).toBeInTheDocument();
  });

  it("shows the Relationships tab when relationshipsData is an empty array", () => {
    renderBoard({ relationshipsData: [] });
    expect(relationshipsTab()).toBeInTheDocument();
  });

  it("renders the empty state copy when no relationships data is present", () => {
    renderBoard({ relationshipsData: null });
    // MobileTabView renders only the active widget. Activate the Relationships
    // tab first so its content is rendered, then assert the empty state.
    const tab = relationshipsTab();
    expect(tab).toBeInTheDocument();
    fireEvent.click(tab!);
    expect(screen.getByTestId("relationships-empty")).toBeInTheDocument();
    expect(screen.getByText(/no one yet/i)).toBeInTheDocument();
  });
});
