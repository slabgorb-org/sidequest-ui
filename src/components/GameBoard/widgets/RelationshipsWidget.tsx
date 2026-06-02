import { RelationshipsPanel } from "@/components/RelationshipsPanel";
import type { RelationshipEntryPayload } from "@/types/payloads";

interface RelationshipsWidgetProps {
  data: RelationshipEntryPayload[] | null;
}

// Thin adapter mirroring KnowledgeWidget / LocationWidget so GameBoard's
// renderWidgetContent only threads data, not styling. RelationshipsPanel
// can be reused elsewhere unchanged.
export function RelationshipsWidget({ data }: RelationshipsWidgetProps) {
  return <RelationshipsPanel data={data} />;
}
