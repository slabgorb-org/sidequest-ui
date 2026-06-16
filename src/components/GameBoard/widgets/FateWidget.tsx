import { FatePanel } from "@/components/FatePanel";
import type { FateRollPayload, FateStatePayload } from "@/types/payloads";

interface FateWidgetProps {
  data: FateStatePayload | null;
  /** Story 118-7 / ADR-144 F3g: the latest 4dF roll, forwarded to FatePanel so
   *  the roll surface mounts when a roll has arrived. */
  latestRoll?: FateRollPayload | null;
  /** The active pack's ruleset ("fate" on a Fate pack) — gates the roll
   *  surface so it never co-renders with the WN/native overlay. */
  ruleset?: string;
}

// Thin adapter mirroring QuestsWidget / RelationshipsWidget so GameBoard's
// renderWidgetContent only threads data, not styling. FatePanel can be reused
// elsewhere unchanged.
export function FateWidget({ data, latestRoll, ruleset }: FateWidgetProps) {
  return <FatePanel data={data} latestRoll={latestRoll} ruleset={ruleset} />;
}
