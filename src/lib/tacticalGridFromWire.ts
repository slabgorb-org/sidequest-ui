import type {
  FeatureType,
  TacticalAdjudication,
  TacticalGridData,
  TacticalToken,
} from "@/types/tactical";

const FACTIONS = ["player", "ally", "neutral", "hostile"] as const;

// Real server wire shape — matches sidequest-server TokenPayload (protocol/models.py).
// token_id/label/position are always present; faction/hp/ac are always populated for
// PCs and revealed creatures the server emits (see map_emit.py _place_tokens_on_anchors).
interface WireToken {
  token_id: string;
  label: string;
  position: [number, number];
  faction?: string;               // server: "player"|"ally"|"neutral"|"hostile" (default "neutral")
  hp?: { current: number; max: number } | null;
  ac?: number | null;
}

interface WirePayload {
  room_id: string;
  room_name: string;
  room_type: "cavern" | "settlement";
  mask: string | null;
  cavern_image_url: string | null;
  cell_size: number | null;
  cellular: {
    size: [number, number]; seed: number; density: number;
    cutoff: number; passes: number;
  } | null;
  derived: {
    floor_count: number;
    exits: Record<string, [number, number] | null>;
    pois: [number, number][];
  } | null;
  tokens: WireToken[];
  // feature cell is an ARRAY [x,y] on the wire (uniform with other positions)
  features?: { feature_type: string; cell: [number, number]; label: string }[];
  // Additive tactical math echo (Story 165-4). Absent on pre-165-4 payloads.
  adjudications?: {
    actor: string;
    kind: string;
    valid: boolean;
    cells_spent?: number | null;
    cells_budget?: number | null;
    distance_cells?: number | null;
    max_cells?: number | null;
    mode?: string | null;
    reason?: string;
    cells?: [number, number][];
  }[];
}

export function tacticalGridFromWire(p: WirePayload): TacticalGridData | null {
  if (p.room_type !== "cavern") return null;
  // Story 52-5: cellular may be null for runtime-procedural caverns (ADR-106) —
  // the mask BLOB does not persist generation params. Renderers derive dimensions
  // from the mask string. mask + cavern_image_url + cell_size + derived stay required.
  if (!p.mask || !p.cavern_image_url || !p.cell_size || !p.derived) {
    throw new Error(
      `tacticalGridFromWire: cavern room ${p.room_id} missing required fields`,
    );
  }
  return {
    room_id: p.room_id,
    room_name: p.room_name,
    room_type: "cavern",
    mask: p.mask,
    cavern_image_url: p.cavern_image_url,
    cell_size: p.cell_size,
    cellular: p.cellular,
    derived: p.derived,
    tokens: p.tokens.map((t): TacticalToken => ({
      id: t.token_id,
      name: t.label,
      initial: (t.label?.[0] ?? "?").toUpperCase(),
      faction: (FACTIONS as readonly string[]).includes(t.faction ?? "neutral")
        ? ((t.faction ?? "neutral") as TacticalToken["faction"])
        : "neutral",
      cell: { x: t.position[0], y: t.position[1] },
      // Server always sends hp/ac for PCs and revealed creatures; coalesce is
      // defensive only (guards the impossible-miss path for TS satisfaction).
      hp: t.hp ?? { current: 0, max: 0 },
      ac: t.ac ?? 0,
    })),
    features: (p.features ?? []).map(f => ({
      feature_type: f.feature_type as FeatureType | "water",
      cell: { x: f.cell[0], y: f.cell[1] },   // ARRAY [x,y] → {x,y}
      label: f.label,
    })),
    // Additive (Story 165-4): default [] so pre-165-4 payloads (and Track B's
    // SITE_MAP cutover) parse — the renderer always maps over a real array.
    adjudications: (p.adjudications ?? []).map((a): TacticalAdjudication => ({
      actor: a.actor,
      kind: a.kind,
      valid: a.valid,
      cells_spent: a.cells_spent ?? undefined,
      cells_budget: a.cells_budget ?? undefined,
      distance_cells: a.distance_cells ?? undefined,
      max_cells: a.max_cells ?? undefined,
      mode: a.mode ?? undefined,
      reason: a.reason ?? "",
      cells: (a.cells ?? []).map(c => [c[0], c[1]] as const),
    })),
  };
}
