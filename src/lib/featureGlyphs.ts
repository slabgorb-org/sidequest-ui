import type { FeatureType } from "@/types/tactical";

// Salvaged from the retired DungeonMapRenderer (158-18).
export const FEATURE_MARKERS: Record<FeatureType, string> = {
  cover: "▣",
  hazard: "⚠",
  difficult_terrain: "≋",
  atmosphere: "◌",
  interactable: "⚙",
  door: "▯",
};

export const FEATURE_COLORS: Record<FeatureType, string> = {
  cover: "#9CA3AF",
  hazard: "#DC2626",
  difficult_terrain: "#D97706",
  atmosphere: "#6B7280",
  interactable: "#2563EB",
  door: "#A78BFA",
};

// water is a fill, not a glyph type in the new path; give it a marker too.
export const WATER_MARKER = "≈";
export const WATER_COLOR = "#1D4ED8";
