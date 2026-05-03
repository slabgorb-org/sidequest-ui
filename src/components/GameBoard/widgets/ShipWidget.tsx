import { useChassisInteriorSVG } from "@/hooks/useChassisInteriorSVG";

export interface ShipWidgetProps {
  chassisInstanceId: string;
}

/**
 * Ship tab — server-rendered SVG of the chassis interior.
 *
 * The SVG carries the static layout (rooms, stations, default-positioned
 * crew NPCs). PC overlays driven by current_room are deferred — see
 * useChassisInteriorSVG for the Phase 2 plan.
 */
export function ShipWidget({ chassisInstanceId }: ShipWidgetProps) {
  const svg = useChassisInteriorSVG(chassisInstanceId);

  if (!svg) {
    return (
      <div className="flex h-full items-center justify-center text-amber-100/40">
        Loading ship interior…
      </div>
    );
  }

  return (
    <div
      className="h-full w-full"
      // Server SVG is trusted (same origin). Inline render keeps any
      // future pan/zoom CSS transformations available without rewriting
      // the layout.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
