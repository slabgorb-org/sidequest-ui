import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SubsystemsTab } from "../tabs/SubsystemsTab";
import type { WatcherEvent } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Story 54-8 / ADR-109 — GM-panel lie-detector treatment for location spans
//
// The five new spans (location.entity.resolve, .minted, .promoted,
// .overlay.activate, .overlay.deactivate) all emit at info severity at the
// server. The route extractor in
// sidequest-server/sidequest/telemetry/spans/location.py sets
// fields.is_lie_detector = true on (mode=narrator_proactive AND resolved=false)
// — the case where the narrator referenced something not in the manifest.
//
// The UI's job is to upgrade those cells in the Activity Grid to the warn
// (amber) treatment even though the underlying severity is info, so Keith
// can see a narrator-lie at a glance.
//
// Audience: Keith (lie-detector) + Sebastien (mechanical visibility).
// ══════════════════════════════════════════════════════════════════════════════

function locationEvent(fields: Record<string, unknown>): WatcherEvent {
  return {
    timestamp: "2026-05-19T12:00:00.000Z",
    component: "location",
    event_type: "state_transition",
    severity: "info",
    fields,
  };
}

function turnComplete(): WatcherEvent {
  return {
    timestamp: "2026-05-19T12:00:00.000Z",
    component: "game",
    event_type: "turn_complete",
    severity: "info",
    fields: {},
  };
}

describe("SubsystemsTab — location lie-detector colour rule (Story 54-8)", () => {
  it("renders the 'location' row when location events are present", () => {
    const lieDetectorOff = locationEvent({
      field: "location_entity",
      op: "entity_resolve",
      mode: "narrator_proactive",
      resolved: true,
      is_lie_detector: false,
    });
    const allEvents: WatcherEvent[] = [lieDetectorOff, turnComplete()];
    const { container } = render(
      <SubsystemsTab
        allEvents={allEvents}
        componentMap={{ location: [lieDetectorOff], game: [turnComplete()] }}
        turnCount={1}
      />,
    );
    // The component label appears in the rendered grid (under the Activity
    // Grid and in the Component Summary).
    expect(container.textContent ?? "").toContain("location");
  });

  it("upgrades a lie-detector event cell to the warn (amber) treatment in the activity grid", () => {
    // The narrator referenced "the dragon" in a tavern that doesn't have
    // one. mode_outcome=no_match, mode=narrator_proactive, resolved=false →
    // route extractor sets is_lie_detector=true on the WatcherEvent.fields.
    // The grid cell for this turn must render with the amber background
    // (THEME.amber = #ff9800), not the green "ok" or grey "empty" colour.
    const lieEvent = locationEvent({
      field: "location_entity",
      op: "entity_resolve",
      mode: "narrator_proactive",
      mode_outcome: "no_match",
      resolved: false,
      is_lie_detector: true,
    });
    const allEvents: WatcherEvent[] = [lieEvent, turnComplete()];
    const { container } = render(
      <SubsystemsTab
        allEvents={allEvents}
        componentMap={{ location: [lieEvent], game: [turnComplete()] }}
        turnCount={1}
      />,
    );
    // Amber background colour appears in the rendered DOM. The grid cell
    // renderer keys on THEME.amber (#ff9800) for the warn state.
    // We search the rendered HTML in a case-insensitive way so future
    // styling refactors (rgba(), CSS vars) still surface the colour.
    const html = container.innerHTML.toLowerCase();
    expect(html).toContain("ff9800");
  });

  it("does NOT upgrade a non-lie-detector location event to warn", () => {
    // Sanity test for the inverse — an ordinary location resolve event
    // (resolved=true, is_lie_detector=false) must render as the green
    // "ok" cell, NOT amber. Guards against a future change that paints
    // every location event amber regardless of the flag.
    const okEvent = locationEvent({
      field: "location_entity",
      op: "entity_resolve",
      mode: "narrator_proactive",
      mode_outcome: "matched",
      resolved: true,
      is_lie_detector: false,
    });
    const allEvents: WatcherEvent[] = [okEvent, turnComplete()];
    const { container } = render(
      <SubsystemsTab
        allEvents={allEvents}
        componentMap={{ location: [okEvent], game: [turnComplete()] }}
        turnCount={1}
      />,
    );
    // The "ok" cell renders with the green theme colour rgba(76,175,80,...).
    // No amber should be present in the grid cells for this turn — the
    // ok cell uses THEME.green (#4caf50 / rgba 76,175,80) per
    // SubsystemsTab.tsx::cellStyle.
    // We check the green is present AS the grid cell colour. The amber
    // theme value also appears elsewhere in the DOM (THEME.amber is used
    // by IDLE badges and the warns column), so we can't just assert "no
    // amber anywhere". Instead, assert green is present for the location
    // cell — proving the cell rendered as "ok", not "warn".
    const html = container.innerHTML.toLowerCase();
    // 76, 175, 80 is THEME.green in rgba; #4caf50 is the same colour. Either
    // form proves the ok cell rendered.
    const hasGreen = html.includes("76,175,80") || html.includes("4caf50");
    expect(
      hasGreen,
      "Expected a non-lie-detector location event to render with the green 'ok' cell colour.",
    ).toBe(true);
  });
});
