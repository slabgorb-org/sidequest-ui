import { useCallback, useEffect, useRef } from "react";
import type {
  OrbitalIntent,
  OrbitalIntentResponse,
} from "@/types/orbital-intent";

export interface UseOrbitalChartArgs {
  /** True when the active world has an orbital tier. */
  enabled: boolean;
  /** Send an OrbitalIntent over the WebSocket. */
  sendIntent: (intent: OrbitalIntent) => void;
  /** Most recent ORBITAL_CHART response, or null if none yet. */
  lastResponse: OrbitalIntentResponse | null;
  /**
   * Bumps when the server-side plotted_course changes (via STATE_PATCH).
   * Drives a re-fetch of the current view so the chart redraws with the
   * new overlay (or without it on cancel). Caller derives this from the
   * snapshot mirror — typically ``plotted_course?.to_body_id`` hashed
   * with ``plotted_course?.plotted_at_t_hours``.
   */
  plottedCourseRevision: number;
}

export interface UseOrbitalChartReturn {
  /** Cached last chart — the SVG to render. */
  chart: OrbitalIntentResponse | null;
  /** Forward a click intent from the chart to the WebSocket. */
  onIntent: (intent: OrbitalIntent) => void;
}

/**
 * Drives the orbital chart: requests an initial view_map when enabled,
 * passes through the latest server response, and forwards click intents.
 *
 * Chart is derived directly from ``lastResponse`` (gated by ``enabled``)
 * — no internal cache state, no setState-in-effect cascade. Disabling
 * clears the chart implicitly. The auto-fetch fires exactly once per
 * enable transition: an internal ref tracks whether we've already kicked
 * the initial view_map for the current enable cycle, so re-renders don't
 * spam additional fetches while the response is in flight.
 *
 * ``plottedCourseRevision`` drives a re-fetch whenever the server-side
 * plotted_course changes. The initial enable suppresses the watcher (the
 * existing initial-fetch effect handles that), so we don't double-fetch
 * on mount.
 */
export function useOrbitalChart({
  enabled,
  sendIntent,
  lastResponse,
  plottedCourseRevision,
}: UseOrbitalChartArgs): UseOrbitalChartReturn {
  const fetchedForCycle = useRef(false);
  const lastPlottedRevision = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      fetchedForCycle.current = false;
      return;
    }
    if (!fetchedForCycle.current) {
      fetchedForCycle.current = true;
      sendIntent({ kind: "view_map", scope: "system_root" });
    }
  }, [enabled, sendIntent]);

  useEffect(() => {
    if (!enabled) {
      lastPlottedRevision.current = null;
      return;
    }
    if (lastPlottedRevision.current === null) {
      lastPlottedRevision.current = plottedCourseRevision;
      return; // initial enable handles its own fetch via the existing effect
    }
    if (plottedCourseRevision !== lastPlottedRevision.current) {
      lastPlottedRevision.current = plottedCourseRevision;
      sendIntent({ kind: "view_map", scope: "system_root" });
    }
  }, [enabled, plottedCourseRevision, sendIntent]);

  const onIntent = useCallback(
    (intent: OrbitalIntent) => sendIntent(intent),
    [sendIntent]
  );

  const chart = enabled ? lastResponse : null;
  return { chart, onIntent };
}
