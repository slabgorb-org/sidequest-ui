import { LocationPanel } from "@/components/LocationPanel";
import type { LocationDescriptionPayload } from "@/types/payloads";

interface LocationWidgetProps {
  data: LocationDescriptionPayload | null;
}

// Thin adapter mirroring KnowledgeWidget / InventoryWidget so GameBoard's
// renderWidgetContent only threads data, not styling. The widget stays in
// the GameBoard subtree; LocationPanel can be reused elsewhere unchanged.
export function LocationWidget({ data }: LocationWidgetProps) {
  return <LocationPanel data={data} />;
}
