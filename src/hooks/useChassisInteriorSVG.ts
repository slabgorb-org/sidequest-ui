import { useEffect, useState } from "react";

/**
 * Fetches the chassis interior SVG once on mount.
 *
 * Live PC overlay (positions changing during play) is a Phase 2
 * follow-on: the server-rendered SVG is the static layout (rooms +
 * stations + default-positioned crew NPCs), and PC markers will be
 * rendered as a React overlay on top of the SVG using state.characters
 * once the state-mirror reducer is extended to carry current_room.
 *
 * For now, the SVG is fetched once when the Ship tab opens and not
 * refetched. The layout doesn't change mid-session.
 */
export function useChassisInteriorSVG(chassisInstanceId: string): string | null {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chassis/${chassisInstanceId}/interior`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.statusText))))
      .then((body) => {
        if (!cancelled) setSvg(body);
      })
      .catch(() => {
        // Graceful degradation — keep the last good SVG (or null on
        // initial fail, which renders the loading state).
      });
    return () => {
      cancelled = true;
    };
  }, [chassisInstanceId]);

  return svg;
}
