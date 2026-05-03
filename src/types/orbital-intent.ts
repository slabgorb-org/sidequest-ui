/**
 * Wire protocol for orbital chart intents — must mirror
 * sidequest-server/sidequest/protocol/orbital_intent.py.
 */
export type OrbitalIntent =
  | { kind: "view_map"; scope: string }
  | { kind: "drill_in"; body_id: string }
  | { kind: "drill_out" };

/**
 * A scheduled minimum-separation event between two bodies. Drives the
 * chart's bottom-HUD countdown (spec §10).
 */
export interface ConjunctionEventPayload {
  body_a_id: string;
  body_b_id: string;
  label: string;
  t_hours_event: number;
  t_hours_until: number;
}

export interface OrbitalIntentResponse {
  scope_center: string;
  svg: string;
  t_hours: number;
  /** Story-clock origin in days; UI computes stardate as `epoch_days + t_hours/24`. */
  epoch_days: number;
  party_at: string | null;
  /** Soonest watched alignment event, or null if none configured / in horizon. */
  next_conjunction: ConjunctionEventPayload | null;
}
