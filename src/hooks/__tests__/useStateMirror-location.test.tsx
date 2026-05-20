/**
 * Story 54-9 / ADR-109: state-mirror tests for the persistent location
 * description pipeline.
 *
 * Two new MessageTypes:
 *   - LOCATION_DESCRIPTION   — snapshot, full replace of state.currentLocation
 *   - LOCATION_OVERLAY_CHANGED — delta, overlays-only replace
 *
 * Spec §6.3 invariants:
 *   - A delta whose region_id matches the current baseline replaces the
 *     overlays slice and nothing else.
 *   - A delta arriving BEFORE a baseline is buffered as `pendingOverlays`
 *     and merges into the next matching baseline.
 *   - A delta whose region_id does NOT match the current baseline is
 *     dropped silently (room-change render is the truth source).
 *   - An empty-overlays delta clears the slice on a matching baseline.
 *
 * Mirrors the existing useStateMirror-50-16-confidence.test.tsx pattern
 * (relative imports, GameStateProvider wrapper, renderHook over messages).
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  GameStateProvider,
  useGameState,
} from "../../providers/GameStateProvider";
import { useStateMirror } from "../../hooks/useStateMirror";
import { MessageType, type GameMessage } from "../../types/protocol";
import type {
  LocationDescriptionPayload,
  LocationOverlayChangedPayload,
} from "../../types/payloads";

function wrapper({ children }: { children: ReactNode }) {
  return <GameStateProvider>{children}</GameStateProvider>;
}

function mirror(messages: GameMessage[]) {
  const { result } = renderHook(
    () => {
      useStateMirror(messages);
      return useGameState();
    },
    { wrapper },
  );
  return result;
}

function descMsg(payload: LocationDescriptionPayload): GameMessage {
  return {
    type: MessageType.LOCATION_DESCRIPTION,
    payload: payload as unknown as Record<string, unknown>,
    player_id: "",
  };
}

function overlayMsg(payload: LocationOverlayChangedPayload): GameMessage {
  return {
    type: MessageType.LOCATION_OVERLAY_CHANGED,
    payload: payload as unknown as Record<string, unknown>,
    player_id: "",
  };
}

describe("useStateMirror — location (Story 54-9)", () => {
  it("starts with currentLocation null", () => {
    const result = mirror([]);
    expect(result.current.state.currentLocation ?? null).toBeNull();
  });

  it("LOCATION_DESCRIPTION populates currentLocation", () => {
    const payload: LocationDescriptionPayload = {
      region_id: "glenross_pub",
      prose: "The pub door is ajar.",
      terrain: "building",
      entities: [
        {
          id: "bar",
          label: "the bar",
          tier: "real_object",
          binding: { kind: "location_feature", ref: "glenross_arms_bar" },
          affordances: [],
          provenance: "authored",
          promoted_at_turn: null,
          promoted_canon: null,
        },
      ],
      overlays: [],
    };
    const result = mirror([descMsg(payload)]);
    const loc = result.current.state.currentLocation;
    expect(loc).not.toBeNull();
    expect(loc!.region_id).toBe("glenross_pub");
    expect(loc!.prose).toBe("The pub door is ajar.");
    expect(loc!.entities).toHaveLength(1);
  });

  it("a later LOCATION_DESCRIPTION fully replaces the prior one", () => {
    const first: LocationDescriptionPayload = {
      region_id: "glenross_pub",
      prose: "The pub door is ajar.",
      terrain: "building",
      entities: [],
      overlays: [],
    };
    const second: LocationDescriptionPayload = {
      region_id: "sunden_square",
      prose: "The square is quiet at dusk.",
      terrain: "settlement",
      entities: [],
      overlays: [],
    };
    const result = mirror([descMsg(first), descMsg(second)]);
    expect(result.current.state.currentLocation!.region_id).toBe(
      "sunden_square",
    );
    expect(result.current.state.currentLocation!.prose).toBe(
      "The square is quiet at dusk.",
    );
  });

  it("LOCATION_OVERLAY_CHANGED after baseline replaces only the overlays slice", () => {
    const base: LocationDescriptionPayload = {
      region_id: "glenross_pub",
      prose: "The pub door is ajar.",
      terrain: "building",
      entities: [],
      overlays: [],
    };
    const delta: LocationOverlayChangedPayload = {
      region_id: "glenross_pub",
      overlays: [
        {
          encounter_id: "tavern_brawl@glenross_pub",
          prose_suffix: "A chair lies in splinters by the door.",
          entity_delta_count: 1,
        },
      ],
    };
    const result = mirror([descMsg(base), overlayMsg(delta)]);
    const loc = result.current.state.currentLocation!;
    expect(loc.region_id).toBe("glenross_pub");
    // Base prose unchanged.
    expect(loc.prose).toBe("The pub door is ajar.");
    // Overlays replaced.
    expect(loc.overlays).toHaveLength(1);
    expect(loc.overlays[0].prose_suffix).toBe(
      "A chair lies in splinters by the door.",
    );
  });

  it("LOCATION_OVERLAY_CHANGED before baseline buffers and lands on next baseline", () => {
    /* Spec §6.3: server may emit LOCATION_OVERLAY_CHANGED before baseline
     * (e.g. encounter activates the same frame a session resumes). The
     * UI buffers the delta and merges it when the next matching baseline
     * arrives. */
    const delta: LocationOverlayChangedPayload = {
      region_id: "glenross_pub",
      overlays: [
        {
          encounter_id: "tavern_brawl@glenross_pub",
          prose_suffix: "A chair lies in splinters by the door.",
          entity_delta_count: 1,
        },
      ],
    };
    const baseline: LocationDescriptionPayload = {
      region_id: "glenross_pub",
      prose: "The pub door is ajar.",
      terrain: "building",
      entities: [],
      overlays: [],
    };
    const result = mirror([overlayMsg(delta), descMsg(baseline)]);
    const loc = result.current.state.currentLocation!;
    expect(loc.region_id).toBe("glenross_pub");
    expect(loc.prose).toBe("The pub door is ajar.");
    expect(loc.overlays).toHaveLength(1);
    expect(loc.overlays[0].prose_suffix).toBe(
      "A chair lies in splinters by the door.",
    );
  });

  it("LOCATION_OVERLAY_CHANGED with mismatched region_id is ignored", () => {
    const base: LocationDescriptionPayload = {
      region_id: "glenross_pub",
      prose: "The pub door is ajar.",
      terrain: "building",
      entities: [],
      overlays: [],
    };
    const delta: LocationOverlayChangedPayload = {
      region_id: "some_other_room",
      overlays: [
        {
          encounter_id: "x@some_other_room",
          prose_suffix: "Should not appear.",
          entity_delta_count: 0,
        },
      ],
    };
    const result = mirror([descMsg(base), overlayMsg(delta)]);
    const loc = result.current.state.currentLocation!;
    expect(loc.region_id).toBe("glenross_pub");
    expect(loc.overlays).toHaveLength(0);
  });

  it("LOCATION_OVERLAY_CHANGED with empty overlays clears the slice", () => {
    const base: LocationDescriptionPayload = {
      region_id: "glenross_pub",
      prose: "The pub door is ajar.",
      terrain: "building",
      entities: [],
      overlays: [
        {
          encounter_id: "old@glenross_pub",
          prose_suffix: "old suffix",
          entity_delta_count: 0,
        },
      ],
    };
    const delta: LocationOverlayChangedPayload = {
      region_id: "glenross_pub",
      overlays: [],
    };
    const result = mirror([descMsg(base), overlayMsg(delta)]);
    expect(result.current.state.currentLocation!.overlays).toHaveLength(0);
  });

  // Mirror's idempotent-replay contract (ADR-026): a buffered delta whose
  // region never receives a matching baseline must not bleed into a later
  // baseline for a DIFFERENT region. The buffer is cleared when the
  // mismatched baseline arrives.
  it("buffered delta is dropped when the next baseline is for a different region", () => {
    const delta: LocationOverlayChangedPayload = {
      region_id: "ghost_room",
      overlays: [
        {
          encounter_id: "phantom@ghost_room",
          prose_suffix: "Should never reach the player.",
          entity_delta_count: 1,
        },
      ],
    };
    const baseline: LocationDescriptionPayload = {
      region_id: "glenross_pub",
      prose: "The pub door is ajar.",
      terrain: "building",
      entities: [],
      overlays: [],
    };
    const result = mirror([overlayMsg(delta), descMsg(baseline)]);
    const loc = result.current.state.currentLocation!;
    expect(loc.region_id).toBe("glenross_pub");
    expect(loc.overlays).toHaveLength(0);
  });
});
