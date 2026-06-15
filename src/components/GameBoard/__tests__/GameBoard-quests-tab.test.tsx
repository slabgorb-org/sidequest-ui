/**
 * Story 77-5 / ADR-137: Quests/Objectives widget wiring (RED).
 *
 * The mandatory wiring test — proves the panel is reachable from a production
 * code path, not just a component that exists in isolation. Mirrors the
 * GameBoard-relationships-tab contract:
 *   1. Wiring — QuestsWidget is importable and the registry entry exists.
 *   2. Hotkey hygiene — the 'quests' hotkey is defined and unique (no collision
 *      with any other registered widget; accessibility requirement).
 *   3. Always-present — the Quests tab appears in GameBoard's dock regardless of
 *      whether `questsData` is null or populated (dataGated:false, mirroring the
 *      2026-06-04 relationships override; the spine is creation-seeded so in
 *      practice it is non-empty almost immediately).
 *   4. Empty state — when data is null the panel renders the empty-state copy
 *      instead of nothing.
 *
 * Behavior tests render GameBoard (jsdom → MobileTabView path) and assert the
 * tab via its accessible "tab" role + "Quests"/"Objectives" label.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { QuestsPayload } from "@/types/payloads";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// Helper widens GameBoardProps with the not-yet-wired questsData prop so this
// RED test compiles before the prop lands and stays correct after.
type BoardOverrides = Partial<GameBoardProps> & {
  questsData?: QuestsPayload | null;
};

function renderBoard(overrides: BoardOverrides = {}) {
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
  const props = { ...defaults, ...overrides } as GameBoardProps;
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
}

function questsTab() {
  return screen.queryByRole("tab", { name: /quests|objectives/i });
}

const seeded: QuestsPayload = {
  quest_log: [
    {
      quest_id: "q_home",
      title: "Find a way home",
      objective: "Reach the Emerald City",
      status: "active",
      anchor_id: "emerald_city",
      related_lore: [],
    },
  ],
  quest_anchors: [
    { anchor_id: "emerald_city", quest_id: "q_home", resolution: null },
  ],
  active_stakes: "The cyclone could return",
};

describe("GameBoard — quests widget wiring (Story 77-5)", () => {
  it("QuestsWidget is importable from the registered path", async () => {
    const mod = await import("@/components/GameBoard/widgets/QuestsWidget");
    expect(typeof mod.QuestsWidget).toBe("function");
  });

  it("QuestsPanel is importable from the components path", async () => {
    const mod = await import("@/components/QuestsPanel");
    expect(typeof mod.QuestsPanel).toBe("function");
  });

  it("widgetRegistry includes the 'quests' entry, dataGated:false, with a defined hotkey", async () => {
    const mod = await import("@/components/GameBoard/widgetRegistry");
    const entry = (mod.WIDGET_REGISTRY as Record<string, { hotkey?: string; dataGated?: boolean }>)
      .quests;
    expect(entry).toBeDefined();
    expect(entry!.dataGated).toBe(false);
    expect(typeof entry!.hotkey).toBe("string");
    expect(entry!.hotkey!.length).toBe(1);
  });

  it("the 'quests' hotkey does not collide with any other widget hotkey", async () => {
    const mod = await import("@/components/GameBoard/widgetRegistry");
    const registry = mod.WIDGET_REGISTRY as Record<string, { hotkey?: string }>;
    const questsHotkey = registry.quests?.hotkey;
    expect(questsHotkey).toBeTruthy();
    const collisions = Object.entries(registry).filter(
      ([id, e]) => id !== "quests" && e.hotkey && e.hotkey === questsHotkey,
    );
    expect(collisions).toEqual([]);
  });
});

describe("GameBoard — quests tab always present (Story 77-5)", () => {
  it("shows the Quests tab when questsData is populated", () => {
    renderBoard({ questsData: seeded });
    expect(questsTab()).toBeInTheDocument();
  });

  it("shows the Quests tab even when questsData is null (stable from session start)", () => {
    renderBoard({ questsData: null });
    expect(questsTab()).toBeInTheDocument();
  });

  it("renders the empty-state copy when no quest data is present", () => {
    renderBoard({ questsData: null });
    // MobileTabView renders only the active widget. Activate the Quests tab
    // first so its content is rendered, then assert the empty state.
    const tab = questsTab();
    expect(tab).toBeInTheDocument();
    fireEvent.click(tab!);
    expect(screen.getByTestId("quests-empty")).toBeInTheDocument();
    expect(screen.getByText(/no objective/i)).toBeInTheDocument();
  });

  it("renders the seeded quest from GameBoard's render path when data is present", () => {
    renderBoard({ questsData: seeded });
    const tab = questsTab();
    expect(tab).toBeInTheDocument();
    fireEvent.click(tab!);
    expect(screen.getByText(/find a way home/i)).toBeInTheDocument();
  });
});
