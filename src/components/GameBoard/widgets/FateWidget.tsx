import { FatePanel } from "@/components/FatePanel";
import type { FateStatePayload } from "@/types/payloads";

interface FateWidgetProps {
  data: FateStatePayload | null;
}

// Thin adapter mirroring QuestsWidget / RelationshipsWidget so GameBoard's
// renderWidgetContent only threads data, not styling. FatePanel can be reused
// elsewhere unchanged.
export function FateWidget({ data }: FateWidgetProps) {
  return <FatePanel data={data} />;
}
