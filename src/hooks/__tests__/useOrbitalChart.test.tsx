import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useOrbitalChart } from "@/hooks/useOrbitalChart";
import type { OrbitalIntentResponse } from "@/types/orbital-intent";

const stubResponse = (svg: string, scope = "coyote"): OrbitalIntentResponse => ({
  scope_center: scope,
  svg,
  t_hours: 0,
  epoch_days: 0,
  party_at: null,
  next_conjunction: null,
});

describe("useOrbitalChart", () => {
  it("fires view_map on enable when no chart cached", () => {
    const sendIntent = vi.fn();
    renderHook(() =>
      useOrbitalChart({ enabled: true, sendIntent, lastResponse: null })
    );
    expect(sendIntent).toHaveBeenCalledWith({
      kind: "view_map",
      scope: "system_root",
    });
  });

  it("does not fire view_map when disabled", () => {
    const sendIntent = vi.fn();
    renderHook(() =>
      useOrbitalChart({ enabled: false, sendIntent, lastResponse: null })
    );
    expect(sendIntent).not.toHaveBeenCalled();
  });

  it("caches the latest response via lastResponse", () => {
    const sendIntent = vi.fn();
    const { result, rerender } = renderHook(
      ({ lastResponse }) =>
        useOrbitalChart({ enabled: true, sendIntent, lastResponse }),
      { initialProps: { lastResponse: null as OrbitalIntentResponse | null } }
    );
    expect(result.current.chart).toBeNull();

    rerender({ lastResponse: stubResponse("<svg/>") });
    expect(result.current.chart?.svg).toBe("<svg/>");
  });

  it("clears chart when disabled again", () => {
    const sendIntent = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled, lastResponse }) =>
        useOrbitalChart({ enabled, sendIntent, lastResponse }),
      {
        initialProps: {
          enabled: true,
          lastResponse: stubResponse("<svg/>") as OrbitalIntentResponse | null,
        },
      }
    );
    expect(result.current.chart?.svg).toBe("<svg/>");

    rerender({ enabled: false, lastResponse: null });
    expect(result.current.chart).toBeNull();
  });

  it("forwards onIntent calls through sendIntent", () => {
    const sendIntent = vi.fn();
    const { result } = renderHook(() =>
      useOrbitalChart({ enabled: true, sendIntent, lastResponse: null })
    );
    sendIntent.mockClear();

    act(() => {
      result.current.onIntent({ kind: "drill_in", body_id: "red_prospect" });
    });
    expect(sendIntent).toHaveBeenCalledWith({
      kind: "drill_in",
      body_id: "red_prospect",
    });
  });
});
