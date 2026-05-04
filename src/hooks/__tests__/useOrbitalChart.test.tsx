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
  plotted_course: null,
});

describe("useOrbitalChart", () => {
  it("fires view_map on enable when no chart cached", () => {
    const sendIntent = vi.fn();
    renderHook(() =>
      useOrbitalChart({
        enabled: true,
        sendIntent,
        lastResponse: null,
        plottedCourseRevision: 0,
        sessionBoundEpoch: 0,
      })
    );
    expect(sendIntent).toHaveBeenCalledWith({
      kind: "view_map",
      scope: "system_root",
    });
  });

  // Regression guard — sq-playtest-pingpong 2026-05-03
  // [BUG] Map widget stuck at "Loading orbital chart…" after WS resume.
  //
  // The hook fires the initial view_map on mount. If the WebSocket session
  // is still in AwaitingConnect (HMR-restored sessionPhase, or page reload
  // racing the SESSION_EVENT{connect} handshake), the server rejects with
  // session_unbound and the chart never arrives. Without a retry the
  // panel reads "Loading…" forever — the server's auto-recovery contract
  // re-binds the session but the widget's one-shot fetchedForCycle latch
  // doesn't re-fire. The fix: when sessionBoundEpoch bumps (App emits
  // SESSION_EVENT{ready}/{connected}), re-fetch the system_root view.
  it("re-fires view_map when sessionBoundEpoch bumps after a rejected initial fetch", () => {
    const sendIntent = vi.fn();
    const { rerender } = renderHook(
      ({ sessionBoundEpoch }) =>
        useOrbitalChart({
          enabled: true,
          sendIntent,
          lastResponse: null,
          plottedCourseRevision: 0,
          sessionBoundEpoch,
        }),
      { initialProps: { sessionBoundEpoch: 0 } }
    );
    expect(sendIntent).toHaveBeenCalledTimes(1);
    expect(sendIntent).toHaveBeenCalledWith({
      kind: "view_map",
      scope: "system_root",
    });

    // Server confirms session bind — App bumps the epoch. Hook must
    // re-fetch so a chart populated from a successful post-bind round-trip
    // unsticks the "Loading…" state.
    rerender({ sessionBoundEpoch: 1 });
    expect(sendIntent).toHaveBeenCalledTimes(2);

    // A later mid-session reconnect (e.g. uvicorn --reload zombies the
    // bind) bumps the epoch again — re-fetch again so the chart stays
    // current.
    rerender({ sessionBoundEpoch: 2 });
    expect(sendIntent).toHaveBeenCalledTimes(3);
  });

  it("does not re-fire when sessionBoundEpoch is unchanged across re-renders", () => {
    const sendIntent = vi.fn();
    const { rerender } = renderHook(
      ({ lastResponse }) =>
        useOrbitalChart({
          enabled: true,
          sendIntent,
          lastResponse,
          plottedCourseRevision: 0,
          sessionBoundEpoch: 1,
        }),
      { initialProps: { lastResponse: null as OrbitalIntentResponse | null } }
    );
    expect(sendIntent).toHaveBeenCalledTimes(1);
    rerender({ lastResponse: stubResponse("<svg/>") });
    expect(sendIntent).toHaveBeenCalledTimes(1);
  });

  it("does not fire view_map when disabled", () => {
    const sendIntent = vi.fn();
    renderHook(() =>
      useOrbitalChart({
        enabled: false,
        sendIntent,
        lastResponse: null,
        plottedCourseRevision: 0,
        sessionBoundEpoch: 0,
      })
    );
    expect(sendIntent).not.toHaveBeenCalled();
  });

  it("caches the latest response via lastResponse", () => {
    const sendIntent = vi.fn();
    const { result, rerender } = renderHook(
      ({ lastResponse }) =>
        useOrbitalChart({
          enabled: true,
          sendIntent,
          lastResponse,
          plottedCourseRevision: 0,
          sessionBoundEpoch: 0,
        }),
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
        useOrbitalChart({
          enabled,
          sendIntent,
          lastResponse,
          plottedCourseRevision: 0,
          sessionBoundEpoch: 0,
        }),
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
      useOrbitalChart({
        enabled: true,
        sendIntent,
        lastResponse: null,
        plottedCourseRevision: 0,
        sessionBoundEpoch: 0,
      })
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
