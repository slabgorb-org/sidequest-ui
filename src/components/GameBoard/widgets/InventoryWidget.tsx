import { InventoryPanel, type InventoryData } from "@/components/InventoryPanel";

interface InventoryWidgetProps {
  data: InventoryData;
  /** Forwarded to InventoryPanel — false on a Fate pack (no economy). */
  showCurrency?: boolean;
}

export function InventoryWidget({ data, showCurrency = true }: InventoryWidgetProps) {
  return <InventoryPanel data={data} showCurrency={showCurrency} />;
}
