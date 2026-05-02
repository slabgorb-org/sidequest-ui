// TypeScript mirrors of sidequest.magic.models. Hand-maintained; keep
// in sync with the pydantic models. Generation tooling deferred.

export type WorldKnowledgePrimary =
  | "denied"
  | "classified"
  | "esoteric"
  | "mythic_lapsed"
  | "folkloric"
  | "acknowledged";

export interface WorldKnowledge {
  primary: WorldKnowledgePrimary;
  local_register: WorldKnowledgePrimary | null;
}

export type LedgerScope =
  | "character"
  | "world"
  | "item"
  | "faction"
  | "location"
  | "bond_pair";

export type LedgerDirection = "up" | "down" | "bidirectional";

/**
 * Severity tiers for status promotions, mirroring server
 * ``Literal["Scratch", "Wound", "Scar", "Boon"]`` from
 * ``sidequest-server/sidequest/magic/models.py:126``. Exported as a
 * runtime tuple so dropdowns, coloring, and tests share one source of
 * truth without redeclaring the literals.
 */
export const STATUS_PROMOTION_SEVERITIES = [
  "Scratch",
  "Wound",
  "Scar",
  "Boon",
] as const;

export type StatusPromotionSeverity =
  (typeof STATUS_PROMOTION_SEVERITIES)[number];

/**
 * Per-bar config: how a threshold crossing surfaces in the Status panel.
 *
 * World-content, not engine code (architect §5.3, 2026-04-29) — different
 * worlds may map the same bar id to different status text/severity. A bar
 * that omits this block produces no auto-promoted Status; the silent skip
 * is intentional, not a fallback.
 */
export interface StatusPromotion {
  text: string;
  severity: StatusPromotionSeverity;
}

export interface LedgerBarSpec {
  id: string;
  scope: LedgerScope;
  direction: LedgerDirection;
  range: [number, number];
  threshold_high?: number | null;
  threshold_higher?: number | null;
  threshold_low?: number | null;
  threshold_lower?: number | null;
  consequence_on_high_cross?: string | null;
  consequence_on_low_cross?: string | null;
  decay_per_session: number;
  starts_at_chargen: number;
  /**
   * Optional Status-panel promotion: the text + severity surfaced when
   * the bar's threshold crosses (or, in the Phase 5 confrontation
   * outcome path, when a ``status_add_*`` mandatory_output fires).
   * World-scope bars (hegemony_heat etc.) leave this absent.
   */
  promote_to_status?: StatusPromotion | null;
}

export interface LedgerBar {
  spec: LedgerBarSpec;
  value: number;
}

export interface BarKey {
  scope: LedgerScope;
  owner_id: string;
  bar_id: string;
}

export type FlagSeverity = "yellow" | "red" | "deep_red";

export interface Flag {
  severity: FlagSeverity;
  reason: string;
  detail: string;
}

export interface WorldMagicConfig {
  world_slug: string;
  genre_slug: string;
  allowed_sources: string[];
  active_plugins: string[];
  intensity: number;
  world_knowledge: WorldKnowledge;
  visibility: Record<string, string>;
  hard_limits: Array<{ id: string; description: string; references_plugin?: string | null }>;
  cost_types: string[];
  ledger_bars: LedgerBarSpec[];
  can_build_caster: boolean;
  can_build_item_user: boolean;
  narrator_register: string;
}

export interface WorkingRecord {
  plugin: string;
  mechanism: string;
  actor: string;
  costs: Record<string, number>;
  domain: string;
  narrator_basis: string;
  flavor?: string | null;
  consent_state?: string | null;
  item_id?: string | null;
  alignment_with_item_nature?: number | null;
}

export interface MagicState {
  config: WorldMagicConfig;
  // Server serializes ledger as Record<string, LedgerBar> with key = "scope|owner|bar".
  ledger: Record<string, LedgerBar>;
  working_log: WorkingRecord[];
}

export function barKeyToString(k: BarKey): string {
  return `${k.scope}|${k.owner_id}|${k.bar_id}`;
}

export function getCharacterBars(
  magic: MagicState,
  characterId: string,
): LedgerBar[] {
  const prefix = `character|${characterId}|`;
  return Object.entries(magic.ledger)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v);
}

export function getWorldBars(magic: MagicState): LedgerBar[] {
  return Object.entries(magic.ledger)
    .filter(([k]) => k.startsWith("world|"))
    .map(([, v]) => v);
}
