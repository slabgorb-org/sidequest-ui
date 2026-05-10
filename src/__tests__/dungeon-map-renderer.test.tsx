import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type {
  TacticalGridData,
  TacticalThemeConfig,
  TacticalCell,
  DungeonLayoutData,
} from "@/types/tactical";

// ── Test fixtures ────────────────────────────────────────────────────────────

const CAVERN_THEME: TacticalThemeConfig = {
  floor: "#8B7355",
  wall: "#3C3024",
  water: "#1A3A5C",
  difficultTerrain: "#A08050",
  door: "#6B5B3A",
  gridLine: "#5A4A3A",
  features: {
    cover: "#9E8B6E",
    hazard: "#8B2500",
    difficult_terrain: "#A08050",
    atmosphere: "#7A6A5A",
    interactable: "#C9A84C",
    door: "#6B5B3A",
  },
};

/** Simple 3x3 room grid — floor center, walls around. */
function make3x3Room(): TacticalGridData {
  const w: TacticalCell = { type: "wall" };
  const f: TacticalCell = { type: "floor" };
  return {
    width: 3,
    height: 3,
    cells: [
      [w, w, w],
      [w, f, w],
      [w, w, w],
    ],
    legend: {},
    exits: [{ wall: "east", cells: [1], width: 1 }],
  };
}

/** 3x3 room with an exit on the west wall — connects to make3x3Room via shared wall. */
function make3x3RoomWestExit(): TacticalGridData {
  const w: TacticalCell = { type: "wall" };
  const f: TacticalCell = { type: "floor" };
  return {
    width: 3,
    height: 3,
    cells: [
      [w, w, w],
      [w, f, w],
      [w, w, w],
    ],
    legend: {},
    exits: [{ wall: "west", cells: [1], width: 1 }],
  };
}

/** A two-room dungeon: entrance (0,0) connected east to hallway (3,0). */
function makeTwoRoomLayout(): DungeonLayoutData {
  return {
    rooms: [
      {
        roomId: "entrance",
        roomName: "Entrance Hall",
        grid: make3x3Room(),
        globalOffsetX: 0,
        globalOffsetY: 0,
      },
      {
        roomId: "hallway",
        roomName: "Dark Hallway",
        grid: make3x3RoomWestExit(),
        globalOffsetX: 3,
        globalOffsetY: 0,
      },
    ],
    globalWidth: 6,
    globalHeight: 3,
  };
}

/** A three-room dungeon for fog of war testing. */
function makeThreeRoomLayout(): DungeonLayoutData {
  return {
    rooms: [
      {
        roomId: "entrance",
        roomName: "Entrance Hall",
        grid: make3x3Room(),
        globalOffsetX: 0,
        globalOffsetY: 0,
      },
      {
        roomId: "hallway",
        roomName: "Dark Hallway",
        grid: make3x3RoomWestExit(),
        globalOffsetX: 3,
        globalOffsetY: 0,
      },
      {
        roomId: "secret",
        roomName: "Secret Chamber",
        grid: make3x3Room(),
        globalOffsetX: 6,
        globalOffsetY: 0,
      },
    ],
    globalWidth: 9,
    globalHeight: 3,
  };
}

// ── Lazy imports — component doesn't exist yet (RED phase) ──────────────────

async function importDungeonMapRenderer() {
  const mod = await import("@/components/DungeonMapRenderer");
  return mod.DungeonMapRenderer;
}

async function importAutomapper() {
  const mod = await import("@/components/Automapper");
  return mod.Automapper;
}

// ── AC-1: All discovered rooms render at correct global positions ───────────

describe("DungeonMapRenderer — room positioning (AC-1)", () => {
  it("renders all discovered rooms in the SVG", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    // Both discovered rooms should be present
    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    const hallwayGroup = container.querySelector('[data-room-id="hallway"]');
    expect(entranceGroup).not.toBeNull();
    expect(hallwayGroup).not.toBeNull();
  });

  it("positions rooms at correct global offsets via transform", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    // Entrance at (0,0) — transform should be translate(0, 0) or absent
    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    expect(entranceGroup).not.toBeNull();
    const entranceTransform = entranceGroup!.getAttribute("transform");
    // Should translate by globalOffset * cellSize
    // Exact value depends on cellSize, but entrance is at (0,0) so offset is 0
    if (entranceTransform) {
      expect(entranceTransform).toMatch(/translate\(0/);
    }

    // Hallway at (3,0) — should have a positive X offset
    const hallwayGroup = container.querySelector('[data-room-id="hallway"]');
    expect(hallwayGroup).not.toBeNull();
    const hallwayTransform = hallwayGroup!.getAttribute("transform");
    expect(hallwayTransform).not.toBeNull();
    // X offset should be > 0 (3 * cellSize)
    expect(hallwayTransform).toMatch(/translate\(\d+/);
    // Parse the X value and verify it's positive
    const match = hallwayTransform!.match(/translate\((\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  it("renders SVG with viewBox encompassing all rooms", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const viewBox = svg!.getAttribute("viewBox");
    expect(viewBox).not.toBeNull();
    // viewBox should encompass globalWidth * cellSize
    const parts = viewBox!.split(/\s+/).map(Number);
    expect(parts.length).toBe(4);
    // Width (parts[2]) should be at least globalWidth * some cellSize
    expect(parts[2]).toBeGreaterThan(0);
    expect(parts[3]).toBeGreaterThan(0);
  });
});

// ── AC-2: Shared walls render once (no double-wall artifact) ────────────────

describe("DungeonMapRenderer — shared walls (AC-2)", () => {
  it("does not render double wall cells at shared boundary", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    // Count all wall cells rendered in the SVG
    const wallCells = container.querySelectorAll('[data-cell-type="wall"]');
    // Two 3x3 rooms share a wall column — so total walls should be less than
    // 2 * (single room wall count). Single 3x3 has 8 wall cells.
    // Two rooms sharing 3 wall cells (column) = 8 + 8 - 3 = 13 max
    // (exact count depends on implementation, but must be < 16)
    expect(wallCells.length).toBeLessThan(16);

    // At the shared boundary (x=2/x=3 depending on merge), there should be
    // exactly one set of wall cells, not two overlapping sets
    // We check by looking at global positions — no two wall cells share the same coords
    const wallPositions = new Set<string>();
    for (const cell of wallCells) {
      const x = cell.getAttribute("data-global-x") ?? cell.getAttribute("data-x");
      const y = cell.getAttribute("data-global-y") ?? cell.getAttribute("data-y");
      if (x !== null && y !== null) {
        const key = `${x},${y}`;
        expect(wallPositions.has(key)).toBe(false);
        wallPositions.add(key);
      }
    }
  });
});

// ── AC-3: Undiscovered rooms are completely invisible ────────────────────────

describe("DungeonMapRenderer — fog of war: undiscovered (AC-3)", () => {
  it("does not render rooms not in discoveredRoomIds", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeThreeRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    // Secret room is NOT discovered — should not be in DOM at all
    const secretGroup = container.querySelector('[data-room-id="secret"]');
    expect(secretGroup).toBeNull();
  });

  it("renders no cells for undiscovered rooms", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeThreeRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance"]}
        theme={CAVERN_THEME}
      />
    );

    // Only entrance is discovered — total cell count should match one 3x3 room (9 cells)
    const allCells = container.querySelectorAll("[data-cell-type]");
    expect(allCells.length).toBe(9);
  });
});

// ── AC-4: Discovered-but-not-current rooms at reduced opacity ───────────────

describe("DungeonMapRenderer — fog of war: discovered non-current (AC-4)", () => {
  it("renders discovered non-current rooms at reduced opacity", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const hallwayGroup = container.querySelector('[data-room-id="hallway"]');
    expect(hallwayGroup).not.toBeNull();

    // Non-current discovered rooms should have reduced opacity
    const opacity = hallwayGroup!.getAttribute("opacity");
    expect(opacity).not.toBeNull();
    const opacityVal = parseFloat(opacity!);
    expect(opacityVal).toBeLessThan(1);
    expect(opacityVal).toBeGreaterThan(0);
  });

  it("does not render entity tokens in non-current rooms", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    // Place an entity in the hallway (non-current room)
    const entities = [
      {
        id: "goblin-1",
        name: "Goblin",
        position: { x: 4, y: 1 }, // global coords in hallway
        size: 1,
        faction: "hostile" as const,
      },
    ];
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
        entities={entities}
      />
    );

    // Entity tokens should NOT appear in non-current rooms
    const tokenElements = container.querySelectorAll("[data-entity-id]");
    expect(tokenElements.length).toBe(0);
  });

  it("shows room name label on discovered non-current rooms", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    // Hallway (non-current but discovered) should have a name label
    const hallwayGroup = container.querySelector('[data-room-id="hallway"]');
    expect(hallwayGroup).not.toBeNull();
    const label = hallwayGroup!.querySelector("text");
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain("Dark Hallway");
  });
});

// ── AC-5: Current room at full opacity with tokens ──────────────────────────

describe("DungeonMapRenderer — current room rendering (AC-5)", () => {
  it("renders current room at full opacity", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    expect(entranceGroup).not.toBeNull();

    // Current room should have full opacity (1 or absent = default 1)
    const opacity = entranceGroup!.getAttribute("opacity");
    if (opacity !== null) {
      expect(parseFloat(opacity)).toBe(1);
    }
    // If opacity is null/absent, that's also valid (SVG default is 1)
  });

  it("renders entity tokens in current room", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const entities = [
      {
        id: "player-1",
        name: "Gruk",
        position: { x: 1, y: 1 }, // global coords in entrance
        size: 1,
        faction: "player" as const,
      },
    ];
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance"]}
        theme={CAVERN_THEME}
        entities={entities}
      />
    );

    const tokenElements = container.querySelectorAll("[data-entity-id]");
    expect(tokenElements.length).toBe(1);
    expect(tokenElements[0].getAttribute("data-entity-id")).toBe("player-1");
  });

  it("renders current room with full cell detail (data-cell-type attributes)", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance"]}
        theme={CAVERN_THEME}
      />
    );

    // Current room should have individual cell elements
    const cellElements = container.querySelectorAll("[data-cell-type]");
    expect(cellElements.length).toBeGreaterThan(0);

    // Should include floor and wall cells
    const floorCells = container.querySelectorAll('[data-cell-type="floor"]');
    const wallCells = container.querySelectorAll('[data-cell-type="wall"]');
    expect(floorCells.length).toBeGreaterThan(0);
    expect(wallCells.length).toBeGreaterThan(0);
  });
});

// ── AC-6: Zoom overview — rooms as shapes with labels ───────────────────────

describe("DungeonMapRenderer — zoom overview mode (AC-6)", () => {
  it("in overview mode, rooms render as simplified shapes", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    // Overview is the default mode — rooms shown as shapes
    // Look for room group elements with labels
    const roomGroups = container.querySelectorAll("[data-room-id]");
    expect(roomGroups.length).toBe(2);

    // Each room should have a name label
    for (const group of roomGroups) {
      const label = group.querySelector("text");
      expect(label).not.toBeNull();
      expect(label!.textContent!.length).toBeGreaterThan(0);
    }
  });

  it("overview mode shows current room brighter than discovered rooms", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    const hallwayGroup = container.querySelector('[data-room-id="hallway"]');
    expect(entranceGroup).not.toBeNull();
    expect(hallwayGroup).not.toBeNull();

    // Current room opacity >= discovered room opacity
    const currentOpacity = parseFloat(
      entranceGroup!.getAttribute("opacity") ?? "1"
    );
    const discoveredOpacity = parseFloat(
      hallwayGroup!.getAttribute("opacity") ?? "1"
    );
    expect(currentOpacity).toBeGreaterThan(discoveredOpacity);
  });
});

// ── AC-7: Zoom tactical — current room with full cell detail ────────────────

describe("DungeonMapRenderer — zoom tactical mode (AC-7)", () => {
  it("zoomed-in view shows individual cell grid lines", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    // Simulate zoom to current room by clicking it
    const handleRoomClick = vi.fn();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
        onRoomClick={handleRoomClick}
      />
    );

    // Click the entrance room to zoom in
    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    expect(entranceGroup).not.toBeNull();
    fireEvent.click(entranceGroup!);

    // After zoom, current room should show full cell detail
    const cellElements = container.querySelectorAll("[data-cell-type]");
    expect(cellElements.length).toBeGreaterThan(0);
  });
});

// ── AC-8: Smooth viewBox transition between zoom levels ─────────────────────

describe("DungeonMapRenderer — zoom transitions (AC-8)", () => {
  it("SVG viewBox changes between overview and zoomed states", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const overviewViewBox = svg!.getAttribute("viewBox");
    expect(overviewViewBox).not.toBeNull();

    // Click a room to zoom in
    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    expect(entranceGroup).not.toBeNull();
    fireEvent.click(entranceGroup!);

    // viewBox should now be different (zoomed to room)
    const zoomedViewBox = svg!.getAttribute("viewBox");
    expect(zoomedViewBox).not.toBeNull();
    // After clicking, if zoom happens, viewBox should differ from overview
    // (The exact behavior depends on whether zoom is via click or props)
    expect(zoomedViewBox).not.toBe(overviewViewBox);
  });

  it("SVG or its container has transition/animation CSS for smooth zoom", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    // SVG should have a transition or animation style for smooth viewBox changes
    const style = svg!.getAttribute("style") ?? "";
    const className = svg!.getAttribute("class") ?? "";
    // Accept either inline transition style or a CSS class
    const hasTransition =
      style.includes("transition") || className.length > 0;
    expect(hasTransition).toBe(true);
  });
});

// ── AC-9: Click room in overview zooms and emits onRoomClick ────────────────

describe("DungeonMapRenderer — room click (AC-9)", () => {
  it("onRoomClick fires with roomId when a room is clicked", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const handleRoomClick = vi.fn<(roomId: string) => void>();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
        onRoomClick={handleRoomClick}
      />
    );

    // Click the hallway room
    const hallwayGroup = container.querySelector('[data-room-id="hallway"]');
    expect(hallwayGroup).not.toBeNull();
    fireEvent.click(hallwayGroup!);

    expect(handleRoomClick).toHaveBeenCalledTimes(1);
    expect(handleRoomClick).toHaveBeenCalledWith("hallway");
  });

  it("does not throw when onRoomClick is not provided", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance"]}
        theme={CAVERN_THEME}
      />
    );

    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    expect(entranceGroup).not.toBeNull();
    expect(() => fireEvent.click(entranceGroup!)).not.toThrow();
  });

  it("clicking current room also fires onRoomClick", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const handleRoomClick = vi.fn<(roomId: string) => void>();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance"]}
        theme={CAVERN_THEME}
        onRoomClick={handleRoomClick}
      />
    );

    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    fireEvent.click(entranceGroup!);
    expect(handleRoomClick).toHaveBeenCalledWith("entrance");
  });
});

// ── AC-10: Automapper three-way delegation ──────────────────────────────────

describe("Automapper — three-way delegation (AC-10, story 29-8)", () => {
  it("delegates to DungeonMapRenderer when multiple rooms have grids", async () => {
    const Automapper = await importAutomapper();
    const rooms = [
      {
        id: "r1",
        name: "Entrance",
        room_type: "chamber",
        size: "medium",
        is_current: true,
        exits: [{ direction: "east", exit_type: "corridor", to_room_id: "r2" }],
        grid: make3x3Room(),
      },
      {
        id: "r2",
        name: "Hallway",
        room_type: "passage",
        size: "small",
        is_current: false,
        exits: [{ direction: "west", exit_type: "corridor", to_room_id: "r1" }],
        grid: make3x3RoomWestExit(),
      },
    ];
    const { container } = render(
      <Automapper rooms={rooms} currentRoomId="r1" />
    );

    // With multiple grid rooms, should delegate to DungeonMapRenderer
    // which renders data-room-id groups (not schematic rectangles or single-room grid)
    const roomGroups = container.querySelectorAll("[data-room-id]");
    expect(roomGroups.length).toBe(2);
  });

  it("still delegates to TacticalGridRenderer for single grid room", async () => {
    const Automapper = await importAutomapper();
    // Image-mode fixture (ADR-096) — new TacticalGridData shape.
    const cavernGrid = {
      room_id: "lone_room",
      room_name: "Lone Room",
      room_type: "cavern" as const,
      mask: "...\n...\n...",
      cavern_image_url: "/genre/test/lone_room.cavern.png",
      cell_size: 24,
      cellular: { size: [3, 3] as [number, number], seed: 1, density: 0.55, cutoff: 5, passes: 4 },
      derived: { floor_count: 9, exits: {}, pois: [] as [number, number][] },
      tokens: [],
    };
    const rooms = [
      {
        id: "r1",
        name: "Lone Room",
        room_type: "cavern",
        size: "medium",
        is_current: true,
        exits: [],
        grid: cavernGrid,
      },
    ];
    const { container } = render(
      <Automapper rooms={rooms} currentRoomId="r1" />
    );

    // Single cavern grid room → TacticalGridRenderer (image mode),
    // which renders data-testid="cavern-floor", not SVG data-cell-type cells.
    const cavernFloor = container.querySelector('[data-testid="cavern-floor"]');
    expect(cavernFloor).not.toBeNull();

    // Should NOT have multi-room data-room-id groups
    const roomGroups = container.querySelectorAll("[data-room-id]");
    expect(roomGroups.length).toBe(0);
  });

  it("falls back to schematic view when no rooms have grids", async () => {
    const Automapper = await importAutomapper();
    const rooms = [
      {
        id: "r1",
        name: "Plain Room",
        room_type: "chamber",
        size: "medium",
        is_current: true,
        exits: [],
      },
      {
        id: "r2",
        name: "Another Room",
        room_type: "passage",
        size: "small",
        is_current: false,
        exits: [],
      },
    ];
    const { container } = render(
      <Automapper rooms={rooms} currentRoomId="r1" />
    );

    // Schematic view uses data-room-id on rect elements
    const roomRects = container.querySelectorAll("rect[data-room-id]");
    expect(roomRects.length).toBeGreaterThan(0);

    // Should NOT have tactical cell elements
    const tacticalCells = container.querySelectorAll("[data-cell-type]");
    expect(tacticalCells.length).toBe(0);
  });
});

// ── Wiring test — DungeonMapRenderer is importable ──────────────────────────

describe("DungeonMapRenderer — wiring test", () => {
  it("DungeonMapRenderer is importable from components", async () => {
    const mod = await import("@/components/DungeonMapRenderer");
    expect(mod.DungeonMapRenderer).toBeDefined();
    expect(typeof mod.DungeonMapRenderer).toBe("function");
  });

  it("DungeonLayoutData type is exported from tactical types", async () => {
    // This test verifies the type exists — if the import succeeds, the type is exported
    const mod = await import("@/types/tactical");
    // DungeonLayoutData should be a type export — we can't check types at runtime
    // but we can verify the module exports exist
    expect(mod).toBeDefined();
    // Check for a runtime sentinel if one is added, otherwise just verify module loads
  });
});

// ── TypeScript lang-review rule enforcement ─────────────────────────────────

describe("DungeonMapRenderer — TypeScript rule compliance", () => {
  // Rule #4: Null/undefined — optional callback handling
  it("handles missing onRoomClick gracefully (Rule #4)", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    // No onRoomClick provided — clicking should not throw
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance"]}
        theme={CAVERN_THEME}
      />
    );

    const room = container.querySelector("[data-room-id]");
    expect(room).not.toBeNull();
    expect(() => fireEvent.click(room!)).not.toThrow();
  });

  // Rule #6: React/JSX — stable keys on room groups
  it("room groups use roomId-based keys, not array indices (Rule #6)", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    // Every room group should have a data-room-id for identification
    const roomGroups = container.querySelectorAll("[data-room-id]");
    expect(roomGroups.length).toBe(2);

    const ids = Array.from(roomGroups).map((g) =>
      g.getAttribute("data-room-id")
    );
    expect(ids).toContain("entrance");
    expect(ids).toContain("hallway");
  });

  // Rule #6: React/JSX — SVG has proper viewBox and preserveAspectRatio
  it("SVG has viewBox and preserveAspectRatio (Rule #6)", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance"]}
        theme={CAVERN_THEME}
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("viewBox")).not.toBeNull();
    expect(svg!.getAttribute("preserveAspectRatio")).not.toBeNull();
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe("DungeonMapRenderer — edge cases", () => {
  it("renders single discovered room without crashing", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout: DungeonLayoutData = {
      rooms: [
        {
          roomId: "only",
          roomName: "Lonely Chamber",
          grid: make3x3Room(),
          globalOffsetX: 0,
          globalOffsetY: 0,
        },
      ],
      globalWidth: 3,
      globalHeight: 3,
    };
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="only"
        discoveredRoomIds={["only"]}
        theme={CAVERN_THEME}
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const roomGroup = container.querySelector('[data-room-id="only"]');
    expect(roomGroup).not.toBeNull();
  });

  it("handles empty discoveredRoomIds (nothing visible)", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={[]}
        theme={CAVERN_THEME}
      />
    );

    // No rooms should be visible
    const roomGroups = container.querySelectorAll("[data-room-id]");
    expect(roomGroups.length).toBe(0);
  });

  it("currentRoomId not in discoveredRoomIds renders nothing for it", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["hallway"]}
        theme={CAVERN_THEME}
      />
    );

    // Entrance is current but not discovered — should not render
    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    expect(entranceGroup).toBeNull();

    // Hallway is discovered but not current — should render at reduced opacity
    const hallwayGroup = container.querySelector('[data-room-id="hallway"]');
    expect(hallwayGroup).not.toBeNull();
  });

  it("entities in non-existent rooms are ignored", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const entities = [
      {
        id: "ghost",
        name: "Ghost",
        position: { x: 100, y: 100 }, // way outside any room
        size: 1,
        faction: "hostile" as const,
      },
    ];
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance"]}
        theme={CAVERN_THEME}
        entities={entities}
      />
    );

    // Entity outside any room should not crash — just don't render it
    const tokens = container.querySelectorAll("[data-entity-id]");
    expect(tokens.length).toBe(0);
  });

  it("handles rooms with different grid sizes", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const w: TacticalCell = { type: "wall" };
    const f: TacticalCell = { type: "floor" };
    const bigRoom: TacticalGridData = {
      width: 5,
      height: 5,
      cells: [
        [w, w, w, w, w],
        [w, f, f, f, w],
        [w, f, f, f, w],
        [w, f, f, f, w],
        [w, w, w, w, w],
      ],
      legend: {},
      exits: [{ wall: "east", cells: [2], width: 1 }],
    };
    const layout: DungeonLayoutData = {
      rooms: [
        {
          roomId: "big",
          roomName: "Great Hall",
          grid: bigRoom,
          globalOffsetX: 0,
          globalOffsetY: 0,
        },
        {
          roomId: "small",
          roomName: "Closet",
          grid: make3x3Room(),
          globalOffsetX: 5,
          globalOffsetY: 1,
        },
      ],
      globalWidth: 8,
      globalHeight: 5,
    };
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="big"
        discoveredRoomIds={["big", "small"]}
        theme={CAVERN_THEME}
      />
    );

    const roomGroups = container.querySelectorAll("[data-room-id]");
    expect(roomGroups.length).toBe(2);
  });
});

// ── Pulsing highlight on current room ───────────────────────────────────────

describe("DungeonMapRenderer — current room highlight", () => {
  it("current room has a highlight class or attribute", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const entranceGroup = container.querySelector('[data-room-id="entrance"]');
    expect(entranceGroup).not.toBeNull();

    // Current room should be distinguishable — either via class or data attribute
    const hasHighlight =
      entranceGroup!.classList.contains("current-room") ||
      entranceGroup!.getAttribute("data-current") === "true";
    expect(hasHighlight).toBe(true);
  });

  it("non-current room does NOT have highlight", async () => {
    const DungeonMapRenderer = await importDungeonMapRenderer();
    const layout = makeTwoRoomLayout();
    const { container } = render(
      <DungeonMapRenderer
        layout={layout}
        currentRoomId="entrance"
        discoveredRoomIds={["entrance", "hallway"]}
        theme={CAVERN_THEME}
      />
    );

    const hallwayGroup = container.querySelector('[data-room-id="hallway"]');
    expect(hallwayGroup).not.toBeNull();

    const hasHighlight =
      hallwayGroup!.classList.contains("current-room") ||
      hallwayGroup!.getAttribute("data-current") === "true";
    expect(hasHighlight).toBe(false);
  });
});
