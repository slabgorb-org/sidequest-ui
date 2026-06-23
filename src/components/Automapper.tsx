// Automapper — Story 19-8: SVG room graph renderer for dungeon crawl UI
// Delegates to TacticalGridRenderer when the current room has grid data (Story 29-4).

import { TacticalGridRenderer } from "@/components/TacticalGridRenderer";
import { SettlementRoomView } from "@/components/SettlementRoomView";
import type { TacticalGridData } from "@/types/tactical";

export interface ExitInfo {
  direction: string;
  exit_type: string; // "door" | "corridor" | "stairs" | "chute"
  to_room_id?: string;
}

export interface ExploredRoom {
  id: string;
  name: string;
  room_type: string;
  size: string;
  is_current: boolean;
  exits: ExitInfo[];
  /** Image-mode cavern grid for TacticalGridRenderer (single-room cavern view, ADR-096). */
  cavernGrid?: TacticalGridData;
  settlement?: {
    description: string;
    exits: { to: string; label: string }[];
  };
}

export interface ThemeConfig {
  colors: {
    accent: string;
    primary: string;
    secondary: string;
    background: string;
  };
}

export interface AutomapperProps {
  rooms: ExploredRoom[];
  currentRoomId: string;
  theme?: ThemeConfig;
}

// --- Layout engine ---

interface RoomPosition {
  id: string;
  x: number;
  y: number;
}

const DIRECTION_OFFSETS: Record<string, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
  up: [0, -1],
  down: [0, 1],
};

const GRID_SPACING = 150;
const ROOM_WIDTH = 100;
const ROOM_HEIGHT = 60;
const PADDING = 80;

function layoutRooms(rooms: ExploredRoom[]): RoomPosition[] {
  if (rooms.length === 0) return [];

  // If no exit anywhere has a known compass direction (e.g. topological room
  // graphs from room_graph navigation mode — ADR-055), fall back to layered
  // BFS placement: rooms at BFS depth N form column N, siblings stacked
  // vertically. Without this, the directional layout collapses every child
  // onto the same point because unknown directions all default to east.
  const hasAnyDirection = rooms.some((r) =>
    r.exits.some((e) => DIRECTION_OFFSETS[e.direction] !== undefined)
  );
  if (!hasAnyDirection && rooms.length > 1) {
    return layoutRoomsLayered(rooms);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  // BFS from first room, placing neighbors by exit direction
  const queue: string[] = [rooms[0].id];
  positions.set(rooms[0].id, { x: 0, y: 0 });

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = roomMap.get(currentId);
    if (!current) continue;
    const currentPos = positions.get(currentId)!;

    for (const ex of current.exits) {
      if (!ex.to_room_id || positions.has(ex.to_room_id)) continue;
      if (!roomMap.has(ex.to_room_id)) continue;

      const offset = DIRECTION_OFFSETS[ex.direction] ?? [1, 0];
      positions.set(ex.to_room_id, {
        x: currentPos.x + offset[0],
        y: currentPos.y + offset[1],
      });
      queue.push(ex.to_room_id);
    }
  }

  // Place any unconnected rooms in a row below
  let unconnectedIdx = 0;
  for (const r of rooms) {
    if (!positions.has(r.id)) {
      positions.set(r.id, { x: unconnectedIdx, y: 10 });
      unconnectedIdx++;
    }
  }

  return rooms.map((r) => {
    const pos = positions.get(r.id)!;
    return { id: r.id, x: pos.x * GRID_SPACING, y: pos.y * GRID_SPACING };
  });
}

/**
 * Layered BFS placement for direction-less room graphs.
 *
 * Breadth-first traversal from the first room (or the current room if
 * designated by is_current flag); each BFS depth becomes a column, and
 * siblings within a column are stacked vertically, centered on y=0.
 * Produces a clean left-to-right tree view that's legible without any
 * compass orientation data.
 */
function layoutRoomsLayered(rooms: ExploredRoom[]): RoomPosition[] {
  // Seed BFS from the current room if one exists — keeps "here" on the left
  // and makes the layout feel oriented around the player.
  const seedId =
    rooms.find((r) => r.is_current)?.id ?? rooms[0].id;

  const depth = new Map<string, number>();
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const queue: string[] = [seedId];
  depth.set(seedId, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const r = roomMap.get(id);
    if (!r) continue;
    const d = depth.get(id)!;
    for (const ex of r.exits) {
      if (!ex.to_room_id || depth.has(ex.to_room_id)) continue;
      if (!roomMap.has(ex.to_room_id)) continue;
      depth.set(ex.to_room_id, d + 1);
      queue.push(ex.to_room_id);
    }
  }

  // Place any disconnected rooms in a final column past the deepest reachable.
  let maxDepth = 0;
  for (const d of depth.values()) if (d > maxDepth) maxDepth = d;
  for (const r of rooms) {
    if (!depth.has(r.id)) depth.set(r.id, maxDepth + 2);
  }

  // Group by depth and assign vertical slots.
  const byDepth = new Map<number, string[]>();
  for (const r of rooms) {
    const d = depth.get(r.id)!;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(r.id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of byDepth) {
    const count = ids.length;
    ids.forEach((id, i) => {
      const y = (i - (count - 1) / 2) * GRID_SPACING;
      const x = d * GRID_SPACING;
      positions.set(id, { x, y });
    });
  }

  return rooms.map((r) => {
    const pos = positions.get(r.id)!;
    return { id: r.id, x: pos.x, y: pos.y };
  });
}

// --- Default theme ---

const DEFAULT_THEME: ThemeConfig = {
  colors: {
    accent: "#e6c84c",
    primary: "#2a2a3a",
    secondary: "#4a4a5a",
    background: "#1a1a2a",
  },
};

// --- Exit type icons ---

const EXIT_ICONS: Record<string, string> = {
  door: "▯",
  stairs: "⇅",
  chute: "↓",
};

// --- Component ---

export function Automapper({ rooms, currentRoomId, theme }: AutomapperProps) {
  // Settlement branch — non-tactical room view (ADR-096)
  const currentRoom = rooms.find((r) => r.id === currentRoomId);
  if (currentRoom?.room_type === "settlement" && currentRoom.settlement) {
    return (
      <SettlementRoomView
        name={currentRoom.name}
        description={currentRoom.settlement.description}
        exits={currentRoom.settlement.exits}
      />
    );
  }

  // Cavern room → TacticalGridRenderer (image-mode, ADR-096)
  if (currentRoom?.cavernGrid) {
    return (
      <div style={{ maxWidth: "100%" }}>
        <TacticalGridRenderer grid={currentRoom.cavernGrid} />
      </div>
    );
  }

  // No grids → schematic view (room graph)
  const t = theme ?? DEFAULT_THEME;
  const positions = layoutRooms(rooms);
  const posMap = new Map(positions.map((p) => [p.id, p]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  // Compute viewBox from positions
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + ROOM_WIDTH > maxX) maxX = p.x + ROOM_WIDTH;
    if (p.y + ROOM_HEIGHT > maxY) maxY = p.y + ROOM_HEIGHT;
  }
  const vbX = minX - PADDING;
  const vbY = minY - PADDING;
  const vbW = Math.max(maxX - minX + PADDING * 2, 200);
  const vbH = Math.max(maxY - minY + PADDING * 2, 200);

  // Dedup connections: track "A->B" pairs to avoid drawing twice
  const drawnConnections = new Set<string>();

  // Collect connections and unknown exits
  const connectionElements: React.ReactNode[] = [];
  const unknownExitElements: React.ReactNode[] = [];

  for (const rm of rooms) {
    const fromPos = posMap.get(rm.id);
    if (!fromPos) continue;
    const fromCx = fromPos.x + ROOM_WIDTH / 2;
    const fromCy = fromPos.y + ROOM_HEIGHT / 2;

    for (const ex of rm.exits) {
      if (ex.to_room_id && roomMap.has(ex.to_room_id)) {
        // Known connection — dedup by sorted pair
        const pairKey = [rm.id, ex.to_room_id].sort().join(":");
        if (drawnConnections.has(pairKey)) continue;
        drawnConnections.add(pairKey);

        const toPos = posMap.get(ex.to_room_id);
        if (!toPos) continue;
        const toCx = toPos.x + ROOM_WIDTH / 2;
        const toCy = toPos.y + ROOM_HEIGHT / 2;
        const midX = (fromCx + toCx) / 2;
        const midY = (fromCy + toCy) / 2;

        connectionElements.push(
          <line
            key={`conn-${pairKey}`}
            data-connection=""
            data-exit-type={ex.exit_type}
            x1={fromCx}
            y1={fromCy}
            x2={toCx}
            y2={toCy}
            stroke={t.colors.secondary}
            strokeWidth={2}
          />
        );

        // Exit type icon at midpoint
        if (ex.exit_type !== "corridor") {
          connectionElements.push(
            <g key={`icon-${pairKey}`} data-exit-type={ex.exit_type}>
              <text
                x={midX}
                y={midY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                fill={t.colors.secondary}
              >
                {EXIT_ICONS[ex.exit_type] ?? "?"}
              </text>
            </g>
          );
        }
      } else if (!ex.to_room_id) {
        // Unknown exit — fog of war dashed line
        const offset = DIRECTION_OFFSETS[ex.direction] ?? [1, 0];
        const toX = fromCx + offset[0] * 60;
        const toY = fromCy + offset[1] * 60;

        unknownExitElements.push(
          <line
            key={`unk-${rm.id}-${ex.direction}`}
            className="unknown-exit"
            data-exit-type={ex.exit_type}
            x1={fromCx}
            y1={fromCy}
            x2={toX}
            y2={toY}
            stroke={t.colors.secondary}
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.5}
          />
        );
        unknownExitElements.push(
          <text
            key={`unk-label-${rm.id}-${ex.direction}`}
            className="unknown-label"
            x={toX}
            y={toY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fill={t.colors.secondary}
            opacity={0.5}
          >
            ?
          </text>
        );
      }
    }
  }

  return (
    <div style={{ maxWidth: "100%" }}>
      <svg
        role="img"
        width="100%"
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Graph-paper grid pattern */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" fill={t.colors.background} />
            <line x1="20" y1="0" x2="20" y2="20" stroke={t.colors.secondary} strokeWidth={0.3} opacity={0.3} />
            <line x1="0" y1="20" x2="20" y2="20" stroke={t.colors.secondary} strokeWidth={0.3} opacity={0.3} />
          </pattern>
        </defs>

        {/* Background with grid */}
        <rect data-bg="grid" x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#grid)" />

        {/* Connections (drawn under rooms) */}
        {connectionElements}

        {/* Unknown exits (fog of war) */}
        {unknownExitElements}

        {/* Rooms */}
        {rooms.map((rm) => {
          const pos = posMap.get(rm.id);
          if (!pos) return null;
          const isCurrent = rm.id === currentRoomId;
          return (
            <g key={rm.id}>
              <rect
                data-room-id={rm.id}
                className={isCurrent ? "current-room" : undefined}
                x={pos.x}
                y={pos.y}
                width={ROOM_WIDTH}
                height={ROOM_HEIGHT}
                rx={4}
                fill={t.colors.primary}
                stroke={isCurrent ? t.colors.accent : t.colors.secondary}
                strokeWidth={isCurrent ? 3 : 1}
              />
              <text
                x={pos.x + ROOM_WIDTH / 2}
                y={pos.y + ROOM_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill={isCurrent ? t.colors.accent : "#ccc"}
              >
                {rm.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
