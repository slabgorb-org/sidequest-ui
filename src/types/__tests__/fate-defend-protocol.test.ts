/**
 * Story 126-17 (ADR-148/149): protocol + payload parity for the Fate DEFEND
 * surface (RED).
 *
 * 126-8 shipped the server DEFEND barrier: when an NPC attack seats on a PC the
 * round PARKS and the server broadcasts a FATE_DEFEND_REQUEST (one per incoming
 * attack), then blocks on the defender's answer. The UI has ZERO defend handling
 * today — no FATE_DEFEND_REQUEST MessageType, no FateDefendRequestPayload, and the
 * FateThrowPayload action union (overcome|create_advantage|attack) has neither a
 * 'defend' verb nor the 126-14 concede field — so the unknown message is dropped
 * and the exchange hangs forever (the showstopper this story closes).
 *
 * Pins the client contract to the SERVER source of truth
 * (sidequest-server/sidequest/protocol/fate.py):
 *   FateDefendRequestPayload(request_id, defender, attacker, attack_skill,
 *                            attack_total, mental)   # server -> client, 126-8 §6
 *   FateThrowPayload.action  += "defend"             # the defend answer (126-8)
 *   FateThrowPayload.concede : bool                  # 126-14 fold-without-rolling
 *
 * The typed-literal constructions are COMPILE-TIME guards (tsc -b / client-build):
 * if the dev omits a field or forgets to widen the action union they will not
 * compile. The MessageType assertion is the RUNTIME guard (undefined until the
 * enum entry lands → RED under vitest). Mirrors fate-protocol.test.ts (Story 118-2).
 */
import { describe, it, expect } from "vitest";
import { MessageType } from "../protocol";
import type { FateDefendRequestPayload, FateThrowPayload } from "../payloads";

describe("Fate DEFEND protocol completeness (Story 126-17)", () => {
  it("MessageType enum includes FATE_DEFEND_REQUEST", () => {
    // Value-level (runtime) assertion: undefined until the enum entry lands → RED.
    expect(MessageType.FATE_DEFEND_REQUEST).toBe("FATE_DEFEND_REQUEST");
  });
});

describe("FateDefendRequestPayload mirrors the server shape exactly (126-8 §6)", () => {
  it("carries request_id, defender, attacker, attack_skill, attack_total, mental", () => {
    // Compile-time guard: a thinned shape (missing attack_total / mental, etc.)
    // would not compile. Runtime asserts every field is addressable so the defend
    // tray can read attacker / skill / total straight off the payload (118-5
    // anti-drift — no hardcoded mechanical literals).
    const req: FateDefendRequestPayload = {
      request_id: "d-7",
      defender: "Sam Spadework",
      attacker: "The Fat Man",
      attack_skill: "Shoot",
      attack_total: 5,
      mental: false,
    };
    expect(req.request_id).toBe("d-7");
    expect(req.defender).toBe("Sam Spadework");
    expect(req.attacker).toBe("The Fat Man");
    expect(req.attack_skill).toBe("Shoot");
    expect(req.attack_total).toBe(5);
    expect(req.mental).toBe(false);
  });

  it("permits a mental (social) defense — the defense track is mental, not physical", () => {
    const social: FateDefendRequestPayload = {
      request_id: "d-8",
      defender: "Sam Spadework",
      attacker: "Brigid O'Shaughnessy",
      attack_skill: "Rapport",
      attack_total: 7,
      mental: true,
    };
    expect(social.mental).toBe(true);
    expect(social.attack_skill).toBe("Rapport");
  });
});

describe("FateThrowPayload carries the defend answer (action='defend' + concede)", () => {
  it("admits action='defend' with four settled faces (the defender's roll IS the roll)", () => {
    // Compile-time guard: the action union MUST widen to include "defend" (126-8).
    // A defend throw answers the request, echoing its request_id with the four
    // settled dF faces — physics-is-the-roll, exactly like the proactive throw.
    const defend: FateThrowPayload = {
      request_id: "d-7",
      action: "defend",
      throw_params: { velocity: [0, 4, -1], angular: [0.5, 0.5, 0.5], position: [0.5, 0.5] },
      face: [1, 0, -1, 1],
    };
    expect(defend.action).toBe("defend");
    expect(defend.request_id).toBe("d-7");
    expect(defend.face).toEqual([1, 0, -1, 1]);
  });

  it("admits a concede defend throw — concede=true, NO dice faces (126-14)", () => {
    // The 126-14 fold-without-rolling path: a concession folds against this attack
    // and throws no dice, so it carries NO `face`. `throw_params` stays present —
    // the server model requires it even on a concede (no default), so the client
    // must synthesize a neutral gesture (see TEA Delivery Findings).
    const concede: FateThrowPayload = {
      request_id: "d-7",
      action: "defend",
      concede: true,
      throw_params: { velocity: [0, 0, 0], angular: [0, 0, 0], position: [0.5, 0.5] },
    };
    expect(concede.concede).toBe(true);
    expect(concede.action).toBe("defend");
    expect(concede.face).toBeUndefined();
  });
});
