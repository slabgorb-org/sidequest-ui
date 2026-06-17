import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FlameChart } from "../charts/FlameChart";
import { TimelineTab } from "../tabs/TimelineTab";
import { THEME } from "../shared/constants";
import type { TurnSpan, WatcherEvent } from "@/types/watcher";

// ══════════════════════════════════════════════════════════════════════════════
// RED (story 124-2): dependency-aware flame chart. The Tufte design nests spans
// caller▸callee (containment = depth), fades container spans vs solid leaf work,
// and keeps the critical span outlined in accent. The shipped FlameChart is a
// FLAT time-proportional Gantt because TurnSpan carried no depth/leaf. Once the
// server emits hierarchy (parent/depth + leaf flag), the chart must:
//   - lay spans out by depth (depth affects the rendered geometry), and
//   - fade containers (leaf=false) relative to leaves (leaf=true),
// while preserving the flat-Gantt fallback for older servers that emit no
// hierarchy (AC3 — and the No-Silent-Fallbacks rule: absent hierarchy must
// render an honest flat chart, not an empty/broken tree).
//
// `depth`/`leaf` are the fields this story adds to TurnSpan. Typed here as an
// explicit extension (no `as any`) so the contract is legible; Dev folds these
// onto the TurnSpan interface in GREEN.
// ══════════════════════════════════════════════════════════════════════════════

type HierarchySpan = TurnSpan & { depth?: number; leaf?: boolean };

/** Stable geometry fingerprint of every rendered span rect, in document order. */
function rectGeometry(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("rect")).map(
    (r) =>
      [r.getAttribute("x"), r.getAttribute("y"), r.getAttribute("width"), r.getAttribute("height")].join(","),
  );
}

/** Find the span rect whose <title> names `spanName` (FlameChart titles each rect). */
function rectByName(container: HTMLElement, spanName: string): SVGRectElement | undefined {
  return Array.from(container.querySelectorAll("rect")).find((r) =>
    r.querySelector("title")?.textContent?.includes(`${spanName} ·`),
  ) as SVGRectElement | undefined;
}

function opacityOf(rect: Element | undefined): number {
  return parseFloat(rect?.getAttribute("opacity") ?? "1");
}

describe("FlameChart — dependency-aware hierarchy (124-2)", () => {
  it("fades container spans relative to leaf spans (Tufte layering)", () => {
    // RED: current FlameChart paints every span at the same opacity (0.82),
    // so a container is indistinguishable from leaf work.
    const spans: HierarchySpan[] = [
      { name: "turn", component: "pipeline", start_ms: 0, duration_ms: 300, depth: 0, leaf: false },
      { name: "leaf_phase", component: "pipeline", start_ms: 0, duration_ms: 100, depth: 1, leaf: true },
    ];
    const { container } = render(<FlameChart spans={spans} totalMs={300} />);

    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBe(2);
    // rects render in span order: [0] = container (leaf:false), [1] = leaf.
    expect(opacityOf(rects[0])).toBeLessThan(opacityOf(rects[1]));
  });

  it("encodes span depth in the rendered geometry", () => {
    // RED: depth must change the layout. We render the SAME spans (identical
    // name/component/start/duration) twice — once nested, once all-depth-0 —
    // and assert the geometry differs. This pins "laid out by depth" without
    // dictating band-vs-indent (Dev/UX choose the exact encoding).
    const base = [
      { name: "turn", component: "pipeline", start_ms: 0, duration_ms: 300 },
      { name: "child_a", component: "pipeline", start_ms: 0, duration_ms: 120 },
      { name: "child_b", component: "pipeline", start_ms: 120, duration_ms: 80 },
    ];
    const nested: HierarchySpan[] = [
      { ...base[0], depth: 0, leaf: false },
      { ...base[1], depth: 1, leaf: true },
      { ...base[2], depth: 1, leaf: true },
    ];
    const flat: HierarchySpan[] = [
      { ...base[0], depth: 0, leaf: true },
      { ...base[1], depth: 0, leaf: true },
      { ...base[2], depth: 0, leaf: true },
    ];

    const { container: nestedC } = render(<FlameChart spans={nested} totalMs={300} />);
    const { container: flatC } = render(<FlameChart spans={flat} totalMs={300} />);

    expect(rectGeometry(nestedC)).not.toEqual(rectGeometry(flatC));
  });

  it("keeps the slowest span outlined in the accent color", () => {
    // Guard (stays green through GREEN): the critical/bottleneck span must
    // remain accent-outlined whatever the depth layout does.
    const spans: TurnSpan[] = [
      { name: "fast", component: "pipeline", start_ms: 0, duration_ms: 100 },
      { name: "slow", component: "pipeline", start_ms: 100, duration_ms: 900 },
    ];
    const { container } = render(<FlameChart spans={spans} totalMs={1000} />);

    const slow = rectByName(container, "slow");
    expect(slow?.getAttribute("stroke")).toBe(THEME.accent);
  });

  it("falls back to a flat one-row-per-span Gantt when spans carry no hierarchy (older server)", () => {
    // Guard (AC3 + No Silent Fallbacks): spans without depth/leaf — the shape
    // an older server emits — must still render one rect per span and keep the
    // slowest outlined, NOT collapse to an empty or broken tree.
    const spans: TurnSpan[] = [
      { name: "a", component: "pipeline", start_ms: 0, duration_ms: 100 },
      { name: "b", component: "pipeline", start_ms: 100, duration_ms: 400 },
      { name: "c", component: "pipeline", start_ms: 500, duration_ms: 50 },
    ];
    const { container } = render(<FlameChart spans={spans} totalMs={550} />);

    expect(container.querySelectorAll("rect").length).toBe(3);
    expect(rectByName(container, "b")?.getAttribute("stroke")).toBe(THEME.accent);
  });

  it("renders hierarchy layering end-to-end through TimelineTab (wiring)", () => {
    // RED + wiring: proves depth/leaf flow TurnCompleteFields.spans →
    // TimelineTab pass-through → mounted FlameChart, not just that the chart
    // works in isolation. TimelineTab forwards fields.spans verbatim, so the
    // container-vs-leaf layering must surface in the real tab.
    const spans: HierarchySpan[] = [
      { name: "turn", component: "pipeline", start_ms: 0, duration_ms: 300, depth: 0, leaf: false },
      { name: "leaf_phase", component: "pipeline", start_ms: 0, duration_ms: 100, depth: 1, leaf: true },
    ];
    const turn: WatcherEvent = {
      timestamp: "2026-06-17T00:00:00Z",
      component: "sidequest-server",
      event_type: "turn_complete",
      severity: "info",
      fields: { turn_id: 1, agent_name: "narrator", total_duration_ms: 300, spans },
    };

    const { container } = render(
      <TimelineTab turns={[turn]} selectedTurn={0} onSelectTurn={() => {}} />,
    );

    const containerRect = rectByName(container, "turn");
    const leafRect = rectByName(container, "leaf_phase");
    expect(containerRect).toBeTruthy();
    expect(leafRect).toBeTruthy();
    expect(opacityOf(containerRect)).toBeLessThan(opacityOf(leafRect));
  });
});
