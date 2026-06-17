/**
 * Story 126-3 (Epic 126, ADR-144 follow-up): hide the native Inventory tab on
 * a `ruleset: fate` pack (RED).
 *
 * WHY (sq-playtest 2026-06-16/17 Fate eval): the 114-10 Fate-gear migration
 * (#472) deleted inventory.yaml for the four Fate packs — Fate has no carried
 * inventory and no economy; gear dissolves into aspects via `source_gear`. A
 * Fate PC who opens "Inventory" therefore sees an empty native panel (items:[],
 * gold:0) and never learns their gear became aspects. DECISION (Keith,
 * 2026-06-17): option (a) — HIDE the native Inventory tab for ruleset:fate PCs.
 *
 * THE DUAL-PATH GOTCHA (the crux of these tests): a GameBoard dock tab is
 * consumed by TWO surfaces — the desktop dockview AND MobileTabView — and BOTH
 * read the SAME `availableWidgets` set GameBoard computes. The correct fix is a
 * single gate in `availableWidgets` (do not add "inventory" when fateData !=
 * null), which both surfaces then honor. A WRONG-LAYER fix that hides inventory
 * only inside MobileTabView.visibleTabs would pass the mobile render test below
 * while the desktop dockview still shows the tab — exactly the half-wiring the
 * epic warns about. So we pin the gate in `availableWidgets` itself (raw-source
 * guard, mirroring the existing `ship` guard in gameboard-wiring.test.tsx) AND
 * assert the user-facing mobile render, AND guard against the other wrong fix
 * (deleting the registry / TABS entry, which native packs still need).
 *
 * The UI ruleset signal is `fateData != null` — the server emits FATE_STATE
 * only on a ruleset=='fate' pack (server #880), the same signal that gates the
 * Fate tab (GameBoard.tsx availableWidgets, Story 118-2). This change is
 * UI-only: it does NOT populate inventory.items/gold (ADR-144 — that would
 * re-introduce the carried inventory the migration deliberately deleted).
 *
 * jsdom note: test-setup.ts mocks matchMedia → "mobile" by default, so
 * renderBoard() renders via MobileTabView (flat, queryable role="tab" buttons).
 * The mobile inventory tab is labeled "Items" (MobileTabView TABS).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

// Widen GameBoardProps in case the named prop surface shifts; all three props
// used here (fateData, inventoryData, confrontationData) are real GameBoard
// props today.
type BoardOverrides = Partial<GameBoardProps> & {
  fateData?: FateStatePayload | null;
};

function renderBoard(overrides: BoardOverrides = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [
      {
        player_id: "p1",
        name: "Sam",
        character_name: "Sam Spadework",
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

// The mobile Inventory tab is labeled "Items"; the query is unambiguous (no
// other tab label contains "items").
function inventoryTab() {
  return screen.queryByRole("tab", { name: /items/i });
}

const seededFate: FateStatePayload = {
  characters: [
    {
      name: "Sam Spadework",
      fate_points: 3,
      refresh: 3,
      skills: [{ name: "Investigate", rating: 4, ladder: "Great" }],
      aspects: [
        { text: "Hard-boiled detective", kind: "high_concept", free_invokes: 0 },
      ],
      stress: { physical: [{ value: 1, checked: false }], mental: [] },
      consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
    },
  ],
  scene_aspects: [],
  conflict: null,
};

// A NON-empty inventory deliberately handed to the Fate PC: proves the gate is
// ruleset-based (fateData present), not "hide when inventory happens to be
// empty". Even a populated inventory must stay hidden on a Fate pack.
const nonEmptyInventory: InventoryData = {
  items: [
    { name: "Service Revolver", type: "weapon", description: "Blued steel." },
  ],
  gold: 100,
  currency_name: "Francs",
};

const activeConfrontation: ConfrontationData = {
  type: "duel",
  label: "Cantina Standoff",
  category: "combat",
  actors: [
    { name: "Sam Spadework", role: "protagonist", side: "player" },
    { name: "The Fat Man", role: "antagonist", side: "opponent" },
  ],
  player_metric: { name: "edge", current: 0, starting: 0, threshold: 3 },
  opponent_metric: { name: "edge", current: 0, starting: 0, threshold: 3 },
  beats: [],
  secondary_stats: null,
  genre_slug: "spaghetti_western",
  mood: "tense",
};

describe("GameBoard — native Inventory tab is hidden on a Fate pack (Story 126-3)", () => {
  it("does NOT show the Inventory ('Items') tab for a Fate PC — even with inventory data present", () => {
    // RED: today availableWidgets adds "inventory" unconditionally, so the
    // mobile tab appears. The gate (fateData != null ⇒ no inventory) hides it.
    // Passing a NON-empty inventory proves the gate is ruleset-based, not
    // data-based.
    renderBoard({ fateData: seededFate, inventoryData: nonEmptyInventory });
    expect(inventoryTab()).not.toBeInTheDocument();
  });

  it("DOES show the Inventory ('Items') tab for a native (non-Fate) PC", () => {
    // Negative control: the gate must hide by ruleset only — a WN/native pack
    // (fateData null) keeps its Inventory tab.
    renderBoard({ fateData: null, inventoryData: nonEmptyInventory });
    expect(inventoryTab()).toBeInTheDocument();
  });

  it("keeps the Inventory tab for a native PC during a confrontation (gate is ruleset, not encounter state)", () => {
    // Guards against an over-broad gate: a confrontation must not hide the
    // native inventory. Only `ruleset: fate` hides it.
    renderBoard({ fateData: null, confrontationData: activeConfrontation });
    expect(inventoryTab()).toBeInTheDocument();
  });
});

describe("GameBoard — the inventory gate lives in the shared availableWidgets set (desktop + mobile)", () => {
  // The desktop dockview is not reliably renderable in jsdom, so — exactly like
  // the existing `ship` availableWidgets guards in gameboard-wiring.test.tsx —
  // we assert the gate at the source level. This forces the fix into the SHARED
  // `availableWidgets` (which BOTH the dockview and MobileTabView read), not
  // into MobileTabView's own filter (which would leave the desktop dock broken).
  it("availableWidgets adds 'inventory' only when fateData is null (not unconditionally)", async () => {
    const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
      default: string;
    };
    // The add must be guarded by a fateData null-check. Accept ==/===/!fateData.
    const gated =
      /(fateData\s*===?\s*null|!\s*fateData)[\s\S]{0,80}?available\.add\(\s*["']inventory["']\s*\)/;
    expect(
      src.default,
      "available.add('inventory') must be gated on a non-Fate ruleset (fateData == null)",
    ).toMatch(gated);
  });

  it("availableWidgets useMemo deps include fateData (so the gate recomputes when Fate state arrives)", async () => {
    const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
      default: string;
    };
    const memoMatch = src.default.match(
      /const availableWidgets = useMemo\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\)/,
    );
    expect(memoMatch).not.toBeNull();
    expect(memoMatch![1]).toContain("fateData");
  });
});

describe("GameBoard — inventory is hidden by GATING, not by deletion (native packs still need it)", () => {
  it("WIDGET_REGISTRY still defines 'inventory' (the desktop dockview entry must remain for native packs)", () => {
    // The fix must NOT remove the registry entry — that would break inventory
    // on the 7 WN/native packs. Hide via the availableWidgets gate instead.
    expect(REGISTRY["inventory"], "inventory must remain a registered widget").toBeDefined();
    expect(REGISTRY["inventory"]?.label).toMatch(/inventory/i);
  });

  it("MobileTabView still lists an 'inventory' tab in its TABS array (native mobile still needs it)", async () => {
    // The fix must NOT delete inventory from the mobile TABS array either — the
    // mobile tab is hidden by the availableWidgets filter (line: TABS.filter(t
    // => availableWidgets.has(t.id))), not by removing the TABS entry.
    const src = (await import("@/components/GameBoard/MobileTabView?raw")) as unknown as {
      default: string;
    };
    expect(src.default).toMatch(/id:\s*["']inventory["']/);
  });
});

describe("MobileTabView — the mobile tab filter honors the availableWidgets gate for inventory", () => {
  // Pins the mobile-path contract independently of GameBoard's gate: whatever
  // availableWidgets GameBoard hands down, MobileTabView must render/hide the
  // Items tab accordingly. This is the mobile half of the dual-path AC.
  const baseAvailable = new Set<WidgetId>(["narrative", "character", "fate"]);

  function renderMobile(available: ReadonlySet<WidgetId>) {
    return render(
      <MobileTabView
        renderWidget={(id) => <div data-testid={`content-${id}`}>{id}</div>}
        availableWidgets={available}
      />,
    );
  }

  it("hides the Items tab when 'inventory' is absent from availableWidgets (the Fate case)", () => {
    renderMobile(baseAvailable); // no "inventory"
    expect(screen.queryByRole("tab", { name: /items/i })).not.toBeInTheDocument();
  });

  it("shows the Items tab when 'inventory' is present in availableWidgets (the native case)", () => {
    renderMobile(new Set<WidgetId>([...baseAvailable, "inventory"]));
    expect(screen.queryByRole("tab", { name: /items/i })).toBeInTheDocument();
  });
});
