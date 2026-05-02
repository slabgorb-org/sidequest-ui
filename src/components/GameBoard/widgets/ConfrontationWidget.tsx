import {
  ConfrontationOverlay,
  type ConfrontationData,
  type ConfrontationOutcome,
} from "@/components/ConfrontationOverlay";
import type { DiceRequestPayload, DiceResultPayload, DiceThrowParams } from "@/types/payloads";

interface ConfrontationWidgetProps {
  data: ConfrontationData;
  /** Phase 5 (Story 47-3): branch-explicit outcome reveal payload. */
  outcome?: ConfrontationOutcome | null;
  onBeatSelect?: (beatId: string) => void;
  diceRequest?: DiceRequestPayload | null;
  diceResult?: DiceResultPayload | null;
  playerId?: string;
  onDiceThrow?: (params: DiceThrowParams, face: number[]) => void;
  onYield?: () => void;
}

export function ConfrontationWidget({
  data,
  outcome,
  onBeatSelect,
  diceRequest,
  diceResult,
  playerId,
  onDiceThrow,
  onYield,
}: ConfrontationWidgetProps) {
  return (
    <ConfrontationOverlay
      data={data}
      outcome={outcome ?? null}
      onBeatSelect={onBeatSelect}
      inline
      diceRequest={diceRequest}
      diceResult={diceResult}
      playerId={playerId}
      onDiceThrow={onDiceThrow}
      onYield={onYield}
    />
  );
}
