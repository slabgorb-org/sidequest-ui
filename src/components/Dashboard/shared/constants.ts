// ─────────────────────────────────────────────────────────────────────────────
// Tufte-inspired dark palette for the SideQuest Inspector.
//
// Brought across from the Claude Design handoff "tufte-inspired-visualization-
// improvements" (SideQuest Inspector.dc.html, 2026-06-16). The previous palette
// was a "flashy consumer" dark-blue + bright-cyan scheme; this one is a flat
// dark ground with muted context and high data-ink:
//   - one flat background (#19191b), hairline rules + whitespace for structure
//   - data is the brightest ink; context (axes, leaders) recedes
//   - a single accent (#4ab4cf) reserved for emphasis: active tab, selection,
//     reference lines, degraded points
//   - muted agent/component hues (steel/sage/mauve/ochre) instead of neon
//
// Every legacy THEME key is preserved (so all nine tabs still compile) but
// remapped onto the muted palette; the named Tufte tokens (ink, muted, faint,
// rule, steel, …) are added for the redesigned Timing + Timeline tabs.
// ─────────────────────────────────────────────────────────────────────────────

/** Serif label stack (Tufte-classic). Used for section titles + small-caps labels. */
export const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";
/** Monospace stack for every data value. */
export const MONO = "'JetBrains Mono', ui-monospace, 'Fira Code', monospace";

/** Span colors for the flame chart — keyed by span name or component. Muted by family. */
export const SPAN_COLORS: Record<string, string> = {
  prompt_build: "#8fa3c0", // steel — prompt family
  intent_route: "#8fa3c0",
  barrier: "#b3a578", // ochre
  preprocess: "#8fb39a", // sage
  preprocessor: "#8fb39a",
  agent_llm: "#bf9fb3", // mauve — agent family
  state_update: "#b3a578", // ochre — state family
  state_patch: "#b3a578",
  system_tick: "#86847d", // muted
  media: "#b6b4ac", // inkDim — media family
  render_pipeline: "#b6b4ac",
  persist: "#86847d", // muted — emit family
  broadcast: "#86847d",
  prerender_scheduler: "#86847d",
  extraction: "#8fb39a", // sage — extraction family
  music_director: "#bf9fb3",
};

/** Component colors for health grid. Muted Tufte hues. */
export const COMP_COLORS: Record<string, string> = {
  game: "#8fa3c0", // steel
  agent: "#bf9fb3", // mauve
  state: "#8fb39a", // sage
  trope: "#b3a578", // ochre
  combat: "#cd6a4e", // terracotta (reserved alert hue)
  // Story 54-8 / ADR-109: location subsystem — entity resolver + overlay
  // activate/deactivate. Kept as a distinct dim-steel so the GM panel can lane
  // the rows without colliding with the `game` steel above.
  location: "#5e6b80", // steelDim
  music_director: "#bf9fb3",
  multiplayer: "#bf9fb3",
  orchestrator: "#8fb39a",
};

/** Agent colors for timing charts. Mirrors the design's agentColor(). */
export const AGENT_COLORS: Record<string, string> = {
  narrator: "#8fa3c0", // steel
  creature_smith: "#bf9fb3", // mauve
  ensemble: "#8fb39a", // sage
  dialectician: "#b3a578", // ochre
};

/**
 * Dashboard dark theme. Legacy keys (surface/border/text/purple/teal/green/
 * amber/red/pink/sky) are preserved for the un-redesigned tabs but remapped to
 * the muted palette; named Tufte tokens are added for the redesigned tabs.
 */
export const THEME = {
  // — core ground / ink —
  bg: "#19191b", // flat dark ground
  ink: "#e7e5df", // brightest data ink
  inkDim: "#b6b4ac", // dimmed ink (context data)
  muted: "#86847d", // labels, secondary text
  faint: "#3a3a40", // faint axis / range-frame lines
  rule: "#2a2a2e", // hairline rules / borders
  dot: "#6a6a64", // dotted leaders
  accent: "#4ab4cf", // single emphasis accent (active/selection/refs/degraded)
  good: "#7faa86", // live / healthy dot

  // — muted data hues —
  steel: "#8fa3c0",
  steelDim: "#5e6b80",
  ochre: "#b3a578",
  sage: "#8fb39a",
  mauve: "#bf9fb3",

  // — legacy aliases (preserved so the other tabs compile; remapped to palette) —
  surface: "#1f1f22", // a hair above bg so residual cards recede into the ground
  border: "#2a2a2e", // = rule
  text: "#e7e5df", // = ink
  purple: "#bf9fb3", // = mauve
  teal: "#8fb39a", // = sage
  green: "#7faa86", // = good
  amber: "#b3a578", // = ochre
  red: "#cd6a4e", // terracotta — reserved alert / error hue
  pink: "#bf9fb3", // = mauve
  sky: "#8fa3c0", // = steel
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
