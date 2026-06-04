import { QuestsPanel } from "@/components/QuestsPanel";
import type { QuestsPayload } from "@/types/payloads";

interface QuestsWidgetProps {
  data: QuestsPayload | null;
}

// Thin adapter mirroring RelationshipsWidget / LocationWidget so GameBoard's
// renderWidgetContent only threads data, not styling. QuestsPanel can be
// reused elsewhere unchanged.
export function QuestsWidget({ data }: QuestsWidgetProps) {
  return <QuestsPanel data={data} />;
}
