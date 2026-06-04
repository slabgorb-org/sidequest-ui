import { LocationPanel } from "@/components/LocationPanel";
import type { LocationDescriptionPayload } from "@/types/payloads";

interface LocationWidgetProps {
  data: LocationDescriptionPayload | null;
  /** Story 85-2: the LOCAL player's per-PC current_location, rendered as the
   * subregion segment of the "Region — Subregion" breadcrumb. */
  subregion?: string | null;
}

// Thin adapter mirroring KnowledgeWidget / InventoryWidget so GameBoard's
// renderWidgetContent only threads data, not styling. The widget stays in
// the GameBoard subtree; LocationPanel can be reused elsewhere unchanged.
export function LocationWidget({ data, subregion }: LocationWidgetProps) {
  return <LocationPanel data={data} subregion={subregion} />;
}
