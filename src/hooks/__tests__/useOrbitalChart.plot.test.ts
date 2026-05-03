import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useOrbitalChart } from "@/hooks/useOrbitalChart";
import type { OrbitalIntentResponse } from "@/types/orbital-intent";

const baseResponse: OrbitalIntentResponse = {
  scope_center: "coyote",
  svg: "<svg />",
  t_hours: 0,
  epoch_days: 0,
  party_at: "near",
  next_conjunction: null,
  plotted_course: null,
};

describe("useOrbitalChart — plotted_course refetch", () => {
  it("kicks an initial view_map on enable", () => {
    const sendIntent = vi.fn();
    renderHook(() =>
      useOrbitalChart({
        enabled: true,
        sendIntent,
        lastResponse: null,
        plottedCourseRevision: 0,
      } as any),
    );
    expect(sendIntent).toHaveBeenCalledWith({
      kind: "view_map",
      scope: "system_root",
    });
  });

  it("re-fetches view_map when plottedCourseRevision changes", () => {
    const sendIntent = vi.fn();
    const { rerender } = renderHook(
      ({ rev }: { rev: number }) =>
        useOrbitalChart({
          enabled: true,
          sendIntent,
          lastResponse: baseResponse,
          plottedCourseRevision: rev,
        } as any),
      { initialProps: { rev: 0 } },
    );
    sendIntent.mockClear();
    rerender({ rev: 1 });
    expect(sendIntent).toHaveBeenCalledWith({
      kind: "view_map",
      scope: "system_root",
    });
  });

  it("does NOT re-fetch when plottedCourseRevision is unchanged", () => {
    const sendIntent = vi.fn();
    const { rerender } = renderHook(
      ({ rev }: { rev: number }) =>
        useOrbitalChart({
          enabled: true,
          sendIntent,
          lastResponse: baseResponse,
          plottedCourseRevision: rev,
        } as any),
      { initialProps: { rev: 5 } },
    );
    sendIntent.mockClear();
    rerender({ rev: 5 }); // same value, different render
    expect(sendIntent).not.toHaveBeenCalled();
  });
});
