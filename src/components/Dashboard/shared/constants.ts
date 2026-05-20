/** Span colors for the flame chart — keyed by span name or component. */
export const SPAN_COLORS: Record<string, string> = {
  prompt_build: "#4fc3f7",
  barrier: "#ffcc02",
  preprocess: "#03dac6",
  preprocessor: "#03dac6",
  agent_llm: "#bb86fc",
  state_update: "#81c784",
  state_patch: "#ffb74d",
  system_tick: "#f06292",
  media: "#e57373",
  persist: "#80cbc4",
  intent_route: "#4fc3f7",
  extraction: "#81c784",
  broadcast: "#90a4ae",
  music_director: "#f06292",
  render_pipeline: "#e57373",
  prerender_scheduler: "#80cbc4",
};

/** Component colors for health grid. */
export const COMP_COLORS: Record<string, string> = {
  game: "#4fc3f7",
  agent: "#bb86fc",
  state: "#81c784",
  trope: "#ffb74d",
  combat: "#e57373",
  // Story 54-8 / ADR-109: location subsystem — entity resolver + overlay
  // activate/deactivate. Distinct cyan hue so the GM panel can lane the
  // rows without conflicting with the existing palette.
  location: "#26c6da",
  music_director: "#f06292",
  multiplayer: "#ce93d8",
  orchestrator: "#03dac6",
};

/** Agent colors for timing charts. */
export const AGENT_COLORS: Record<string, string> = {
  narrator: "#bb86fc",
  creature_smith: "#e57373",
  ensemble: "#81c784",
  dialectician: "#4fc3f7",
};

/** CSS custom properties for the dashboard dark theme. */
export const THEME = {
  bg: "#1a1a2e",
  surface: "#16213e",
  border: "#333",
  accent: "#00d4ff",
  purple: "#bb86fc",
  teal: "#03dac6",
  green: "#4caf50",
  amber: "#ff9800",
  red: "#f44336",
  text: "#e0e0e0",
  muted: "#888",
  pink: "#f06292",
  sky: "#4fc3f7",
} as const;

/**
 * Safely extract a string from a value that may be a plain string or a Rust
 * serde-serialized tagged enum like `{kind: "variant"}`.
 */
export function safeStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "kind" in val) return String((val as Record<string, unknown>).kind);
  return String(val);
}
