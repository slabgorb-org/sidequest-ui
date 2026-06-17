// ADR-148 / Story 126-7: build the FATE_THROW client→server message.
//
// A player's PROACTIVE Fate roll is physics-is-the-roll — the four settled dF
// faces ARE the roll. This pure builder keeps the wire shape unit-testable and
// is the single construction point the App send path uses (mirrors how the d20
// path builds DICE_THROW).
import { MessageType } from "../types/protocol";
import type { FateThrowMessage, FateThrowPayload } from "../types/payloads";

export function makeFateThrowMessage(
  payload: FateThrowPayload,
  playerId = "",
): FateThrowMessage {
  return { type: MessageType.FATE_THROW, payload, player_id: playerId };
}
