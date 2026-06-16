import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WatcherEvent } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// Playtest 2026-04-23 regression — GM dashboard deaf despite live server.
//
// Bug: the server emitted ~160 spans/turn but the dashboard's Timeline /
// Subsystems / Lore tabs stayed empty. Root cause was server-side (hub
// singleton replaced on every uvicorn --reload), but the UI had no test
// proving the dashboard parses the canonical `turn_complete` payload shape
// and surfaces it as an incremented Turns counter.
//
// This is the wiring test: synthesize the exact shape the server sends,
// feed it through useWatcherSocket, assert the header updates.
// ══════════════════════════════════════════════════════════════════════════════

// Stub the socket hook so we can drive events synchronously without a real WS.
const onEventCapture: { fn: ((e: WatcherEvent) => void) | null } = {
  fn: null,
};

vi.mock("@/hooks/useWatcherSocket", () => ({
  useWatcherSocket: ({
    onEvent,
  }: {
    onEvent: (e: WatcherEvent) => void;
  }) => {
    onEventCapture.fn = onEvent;
    return { connected: true };
  },
}));

// The dashboard also fetches /api/debug/state on mount; stub it to no-op.
beforeEach(() => {
  vi.spyOn(global, "fetch").mockImplementation(async () =>
    new Response("[]", { status: 200 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  onEventCapture.fn = null;
});

// Defer import until mocks are installed.
async function loadDashboard() {
  const mod = await import("../DashboardApp");
  return mod.DashboardApp;
}

// The Tufte-redesigned header renders a small-caps "turns" label followed by
// the count in a separate value node; the wrapper's textContent is "turns{N}".
// (Case-sensitive "turns" avoids colliding with the Timeline sidebar's "Turns"
// section title.)
function headerTurnsText(): string {
  return screen.getByText("turns").parentElement?.textContent ?? "";
}

describe("DashboardApp event parsing (playtest 2026-04-23)", () => {
  it("increments Turns counter when a turn_complete event arrives", async () => {
    const DashboardApp = await loadDashboard();
    render(<DashboardApp />);

    // Header starts at Turns: 0
    expect(headerTurnsText()).toMatch(/turns\s*0/);

    const event: WatcherEvent = {
      timestamp: "2026-04-23T17:00:00.000Z",
      component: "orchestrator",
      event_type: "turn_complete",
      severity: "info",
      fields: {
        turn_id: 1,
        turn_number: 1,
        agent_name: "narrator",
        agent_duration_ms: 20192,
        player_id: "116f74b2",
        genre: "mutant_wasteland",
        world: "flickering_reach",
      },
    };

    expect(onEventCapture.fn).not.toBeNull();
    act(() => {
      onEventCapture.fn!(event);
    });

    expect(headerTurnsText()).toMatch(/turns\s*1/);
  });

  it("routes agent_span_close events through the reducer without incrementing Turns", async () => {
    const DashboardApp = await loadDashboard();
    render(<DashboardApp />);

    const spanClose: WatcherEvent = {
      timestamp: "2026-04-23T17:00:01.000Z",
      component: "sidequest-server",
      event_type: "agent_span_close",
      severity: "info",
      fields: {
        name: "turn.agent_llm.inference",
        duration_ms: 15000,
      },
    };

    // Switch to Console tab (index 4) first so the Console renders the
    // event on arrival. Tabs are clickable <div>s, not <button>s — use
    // the label text.
    act(() => {
      screen.getByText(/Console/i).click();
    });

    act(() => {
      onEventCapture.fn!(spanClose);
    });

    // turn.agent_llm.inference alone is NOT a turn boundary — it's a
    // contributing signal, but the aggregator waits for
    // orchestrator.process_action before synthesizing a turn.
    expect(headerTurnsText()).toMatch(/turns\s*0/);
    // But it DOES land in allEvents → the Console tab surfaces it.
    expect(
      screen.getByText(/turn\.agent_llm\.inference/),
    ).toBeInTheDocument();
  });

  // ════════════════════════════════════════════════════════════════════════
  // Playtest 2026-04-24 regression — Turns counter stuck at 0.
  //
  // Bug: the semantic `turn_complete` event stopped arriving in live
  // traffic but OTEL span closes (orchestrator.process_action,
  // turn.agent_llm.inference, narrator.canonical_leak_audit) kept
  // flowing — so the Console tab filled while the Turns counter / Timeline
  // / Timing / Prompt / Lore tabs stayed empty.
  //
  // Fix: treat `agent_span_close { name: "orchestrator.process_action" }`
  // as the canonical turn boundary. Accumulate turn_id / player_id from
  // narrator.canonical_leak_audit and duration from turn.agent_llm.inference,
  // then synthesize a turn_complete on the orchestrator.process_action close.
  // ════════════════════════════════════════════════════════════════════════
  it("increments Turns counter when orchestrator.process_action closes (span-close fallback)", async () => {
    const DashboardApp = await loadDashboard();
    render(<DashboardApp />);

    // Mimic the real 2026-04-24 playtest sequence: leak_audit carries
    // turn_id, inference carries duration, then process_action closes.
    const leakAudit: WatcherEvent = {
      timestamp: "2026-04-24T17:00:00.000Z",
      component: "sidequest-server",
      event_type: "agent_span_close",
      severity: "info",
      fields: {
        name: "narrator.canonical_leak_audit",
        duration_ms: 12,
        turn_id: "mutant_wasteland:flickering_reach:Slabgorb:7",
      },
    };
    const inference: WatcherEvent = {
      timestamp: "2026-04-24T17:00:00.100Z",
      component: "sidequest-server",
      event_type: "agent_span_close",
      severity: "info",
      fields: {
        name: "turn.agent_llm.inference",
        duration_ms: 20192,
        model: "claude-opus-4-5",
      },
    };
    const processAction: WatcherEvent = {
      timestamp: "2026-04-24T17:00:00.200Z",
      component: "sidequest-server",
      event_type: "agent_span_close",
      severity: "info",
      fields: {
        name: "orchestrator.process_action",
        duration_ms: 22000,
        action_len: 92,
      },
    };

    expect(headerTurnsText()).toMatch(/turns\s*0/);

    act(() => {
      onEventCapture.fn!(leakAudit);
      onEventCapture.fn!(inference);
      onEventCapture.fn!(processAction);
    });

    // The aggregator synthesized a turn_complete from the span closes.
    expect(headerTurnsText()).toMatch(/turns\s*1/);
  });

  it("does not double-count when a real turn_complete follows a synthesized one for the same turn_id", async () => {
    const DashboardApp = await loadDashboard();
    render(<DashboardApp />);

    const turnKey = "mutant_wasteland:flickering_reach:Slabgorb:7";

    const leakAudit: WatcherEvent = {
      timestamp: "2026-04-24T17:00:00.000Z",
      component: "sidequest-server",
      event_type: "agent_span_close",
      severity: "info",
      fields: {
        name: "narrator.canonical_leak_audit",
        duration_ms: 12,
        turn_id: turnKey,
      },
    };
    const processAction: WatcherEvent = {
      timestamp: "2026-04-24T17:00:00.100Z",
      component: "sidequest-server",
      event_type: "agent_span_close",
      severity: "info",
      fields: {
        name: "orchestrator.process_action",
        duration_ms: 22000,
        action_len: 92,
      },
    };
    // Server eventually also emits the semantic turn_complete with the
    // same turn_id — the aggregator must replace-in-place, not append.
    const semanticTurnComplete: WatcherEvent = {
      timestamp: "2026-04-24T17:00:00.300Z",
      component: "orchestrator",
      event_type: "turn_complete",
      severity: "info",
      fields: {
        turn_id: turnKey,
        turn_number: 7,
        agent_name: "narrator",
        agent_duration_ms: 22000,
        player_id: "Slabgorb",
        genre: "mutant_wasteland",
        world: "flickering_reach",
      },
    };

    act(() => {
      onEventCapture.fn!(leakAudit);
      onEventCapture.fn!(processAction);
    });
    expect(headerTurnsText()).toMatch(/turns\s*1/);

    act(() => {
      onEventCapture.fn!(semanticTurnComplete);
    });
    // Still 1 — the real turn_complete replaced the synthesized entry
    // instead of appending a duplicate.
    expect(headerTurnsText()).toMatch(/turns\s*1/);
  });
});
