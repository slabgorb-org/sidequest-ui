import type { FeatureType, TacticalGridData } from "@/types/tactical";

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
  features?: { feature_type: string; cell: { x: number; y: number }; label: string }[];
}

interface WireToken {
  id: string;
  name: string;
  initial: string;
  faction: "player" | "ally" | "neutral" | "hostile";
  cell: { x: number; y: number };
  hp: { current: number; max: number };
  ac: number;
  class_name?: string;
  speed?: number;
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
    tokens: p.tokens.map(t => ({
      id: t.id, name: t.name, initial: t.initial, faction: t.faction,
      cell: t.cell, hp: t.hp, ac: t.ac,
      className: t.class_name, speed: t.speed,
    })),
    features: (p.features ?? []).map(f => ({
      feature_type: f.feature_type as FeatureType | "water",
      cell: f.cell,
      label: f.label,
    })),
  };
}
