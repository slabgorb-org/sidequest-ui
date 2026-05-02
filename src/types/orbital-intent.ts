/**
 * Wire protocol for orbital chart intents — must mirror
 * sidequest-server/sidequest/protocol/orbital_intent.py.
 */
export type OrbitalIntent =
  | { kind: "view_map"; scope: string }
  | { kind: "drill_in"; body_id: string }
  | { kind: "drill_out" };

export interface OrbitalIntentResponse {
  scope_center: string;
  svg: string;
  t_hours: number;
  party_at: string | null;
}
