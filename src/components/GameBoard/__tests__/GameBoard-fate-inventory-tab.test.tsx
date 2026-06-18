/**
 * Fate PC inventory visibility — REVERSES Story 126-3 (sq-playtest 2026-06-17,
 * wry_whimsy/oz).
 *
 * 126-3 HID the native Inventory tab for `ruleset: fate` packs on the premise
 * that "Fate has no carried inventory" (gear dissolves into aspects via
 * source_gear, inventory.items unpopulated server-side). PLAY DISPROVED IT: a
 * Fate PC accumulates real carried items in `core.inventory.items` during play
 * and the server emits them as `inventoryData`. Harpo's live oz save
 * (2026-06-17-oz-f9d7524d) holds three Carried items — **Silver Shoes**, Rubber
 * Horn, Banjo — the silver shoes being an iconic, in-play-acquired item. Hiding
 * the tab made them invisible.
 *
 * DECISION (Keith, 2026-06-17, reversing his own 126-3 call): "the point is not
 * to show the inventory tab of the native rule set — the point is to show the
 * character inventory wherever that comes from." So:
 *   1. the Inventory ("Items") tab is available for a Fate PC again (the items
 *      are real); and
 *   2. Fate has no economy, so the native currency/gold line is suppressed for
 *      a Fate PC — show the items, not the native-ruleset money framing. Native
 *      (WN/d20) packs keep their currency line unchanged.
 *
 * Dual-path: a GameBoard dock tab is consumed by BOTH the desktop dockview and
 * MobileTabView via the shared `availableWidgets` set, so the fix is the single
 * gate in `availableWidgets` (inventory is added unconditionally now), which
 * both surfaces honor. The registry + TABS entries must stay (native packs need
 * them).
 *
 * jsdom note: test-setup.ts mocks matchMedia → "mobile", so renderBoard()
 * renders via MobileTabView (flat role="tab" buttons). The Inventory tab is
 * labeled "Items".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { MobileTabView } from "../MobileTabView";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import {
  WIDGET_REGISTRY,
  type WidgetDef,
  type WidgetId,
} from "@/components/GameBoard/widgetRegistry";
import type { FateStatePayload } from "@/types/payloads";
import type { ConfrontationData } from "@/components/ConfrontationOverlay";
import type { InventoryData } from "@/components/InventoryPanel";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const REGISTRY = WIDGET_REGISTRY as Record<string, WidgetDef | undefined>;

type BoardOverrides = Partial<GameBoardProps> & {
  fateData?: FateStatePayload | null;
};

function renderBoard(overrides: BoardOverrides = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [
      {
        player_id: "p1",
        name: "Harpo",
        character_name: "Harpo",
        class: "Stubborn Skeptic",
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

// The Inventory tab is labeled "Items"; the query is unambiguous.
function inventoryTab() {
  return screen.queryByRole("tab", { name: /items/i });
}

const seededFate: FateStatePayload = {
  characters: [
    {
      name: "Harpo",
      fate_points: 3,
      refresh: 3,
      skills: [{ name: "Provoke", rating: 4, ladder: "Great" }],
      aspects: [
        { text: "Stubborn Skeptic Who Argues With Doorknobs", kind: "high_concept", free_invokes: 0 },
      ],
      stress: { physical: [{ value: 1, checked: false }], mental: [] },
      consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
    },
  ],
  scene_aspects: [],
  conflict: null,
};

// The Fate PC's real, in-play-acquired inventory (mirrors Harpo's live oz save).
// gold:0 / no currency_name is what the server actually sends for a Fate pack;
// the native "0 coin" line that would otherwise render is the native-ruleset
// framing Keith does not want on a Fate sheet.
const fateInventory: InventoryData = {
  items: [
    { name: "Silver Shoes", type: "gear", description: "Charmed witch-treasure of the Munchkin country." },
    { name: "Rubber Horn", type: "gear", description: "Honk." },
    { name: "Banjo", type: "gear", description: "Plink." },
  ],
  gold: 0,
};

// A native (WN/d20) inventory WITH an economy — the currency line must survive.
const nativeInventory: InventoryData = {
  items: [{ name: "Service Revolver", type: "weapon", description: "Blued steel." }],
  gold: 100,
  currency_name: "Francs",
};

const activeConfrontation: ConfrontationData = {
  type: "duel",
  label: "Cantina Standoff",
  category: "combat",
  actors: [
    { name: "Harpo", role: "protagonist", side: "player" },
    { name: "The Fat Man", role: "antagonist", side: "opponent" },
  ],
  player_metric: { name: "edge", current: 0, starting: 0, threshold: 3 },
  opponent_metric: { name: "edge", current: 0, starting: 0, threshold: 3 },
  beats: [],
  secondary_stats: null,
  genre_slug: "spaghetti_western",
  mood: "tense",
};

describe("GameBoard — a Fate PC can see their carried inventory (reverses 126-3)", () => {
  it("SHOWS the Inventory ('Items') tab for a Fate PC (items are real, acquired in play)", () => {
    // RED before the fix: the 126-3 gate (`if (fateData == null)`) removed
    // "inventory" from availableWidgets for a Fate PC, so the tab was absent.
    renderBoard({ fateData: seededFate, inventoryData: fateInventory });
    expect(inventoryTab()).toBeInTheDocument();
  });

  it("renders the Fate PC's items but NOT the native currency/gold line", () => {
    // The whole point (Keith): show the character inventory, not the native
    // ruleset money framing. Click into Items and assert the silver shoes show
    // while the native "0 coin" line is suppressed for a Fate PC.
    renderBoard({ fateData: seededFate, inventoryData: fateInventory });
    fireEvent.click(inventoryTab()!);
    expect(screen.getByText("Silver Shoes")).toBeInTheDocument();
    expect(screen.getByText("Banjo")).toBeInTheDocument();
    // No native economy framing on a Fate sheet (no "0 coin" / currency line).
    expect(screen.queryByText(/coin/i)).not.toBeInTheDocument();
  });

  it("still SHOWS the Inventory tab for a native (non-Fate) PC", () => {
    renderBoard({ fateData: null, inventoryData: nativeInventory });
    expect(inventoryTab()).toBeInTheDocument();
  });

  it("keeps the native currency line for a native PC (economy framing unchanged off Fate)", () => {
    // Regression guard: suppressing economy must be ruleset-scoped to Fate, not
    // applied to native packs that DO have a currency.
    renderBoard({ fateData: null, inventoryData: nativeInventory });
    fireEvent.click(inventoryTab()!);
    expect(screen.getByText(/100 Francs/)).toBeInTheDocument();
  });

  it("keeps the Inventory tab for a native PC during a confrontation (gate is ruleset, not encounter state)", () => {
    renderBoard({ fateData: null, confrontationData: activeConfrontation, inventoryData: nativeInventory });
    expect(inventoryTab()).toBeInTheDocument();
  });
});

describe("GameBoard — inventory stays GATED-IN by registry, not deleted (native packs still need it)", () => {
  it("WIDGET_REGISTRY still defines 'inventory'", () => {
    expect(REGISTRY["inventory"], "inventory must remain a registered widget").toBeDefined();
    expect(REGISTRY["inventory"]?.label).toMatch(/inventory/i);
  });

  it("MobileTabView still lists an 'inventory' tab in its TABS array", async () => {
    const src = (await import("@/components/GameBoard/MobileTabView?raw")) as unknown as {
      default: string;
    };
    expect(src.default).toMatch(/id:\s*["']inventory["']/);
  });
});

describe("MobileTabView — the mobile tab filter honors the availableWidgets gate for inventory", () => {
  // Pins the mobile-path contract independently of GameBoard's gate: whatever
  // availableWidgets GameBoard hands down, MobileTabView renders/hides the Items
  // tab accordingly. Inventory is now in availableWidgets for Fate too, so this
  // proves the shared-gate plumbing both surfaces read.
  const baseAvailable = new Set<WidgetId>(["narrative", "character", "fate"]);

  function renderMobile(available: ReadonlySet<WidgetId>) {
    return render(
      <MobileTabView
        renderWidget={(id) => <div data-testid={`content-${id}`}>{id}</div>}
        availableWidgets={available}
      />,
    );
  }

  it("hides the Items tab when 'inventory' is absent from availableWidgets", () => {
    renderMobile(baseAvailable); // no "inventory"
    expect(screen.queryByRole("tab", { name: /items/i })).not.toBeInTheDocument();
  });

  it("shows the Items tab when 'inventory' is present in availableWidgets", () => {
    renderMobile(new Set<WidgetId>([...baseAvailable, "inventory"]));
    expect(screen.queryByRole("tab", { name: /items/i })).toBeInTheDocument();
  });
});
