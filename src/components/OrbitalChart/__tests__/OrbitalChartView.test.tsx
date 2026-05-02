import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OrbitalChartView } from "../OrbitalChartView";

const mockSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-400 -400 800 800">
  <g id="layer-engraved">
    <g data-action="drill_in:red_prospect" data-body-id="red_prospect">
      <circle cx="100" cy="0" r="4" data-body-id="red_prospect"/>
    </g>
  </g>
</svg>`;

const drillOutSvg = `<svg viewBox="0 0 800 800">
  <g data-action="drill_out"><text>← COYOTE SYSTEM</text></g>
</svg>`;

describe("OrbitalChartView", () => {
  it("renders the provided SVG markup", () => {
    render(
      <OrbitalChartView svg={mockSvg} scopeCenter="coyote" onIntent={() => {}} />
    );
    const host = screen.getByTestId("orbital-chart-host");
    expect(host.querySelector('[data-body-id="red_prospect"]')).not.toBeNull();
  });

  it("fires drill_in intent on click of element with data-action drill_in", () => {
    const onIntent = vi.fn();
    render(
      <OrbitalChartView svg={mockSvg} scopeCenter="coyote" onIntent={onIntent} />
    );
    const host = screen.getByTestId("orbital-chart-host");
    const target = host.querySelector(
      '[data-action="drill_in:red_prospect"]'
    ) as HTMLElement | null;
    expect(target).not.toBeNull();
    fireEvent.click(target!);
    expect(onIntent).toHaveBeenCalledWith({
      kind: "drill_in",
      body_id: "red_prospect",
    });
  });

  it("fires drill_out intent on click of element with data-action drill_out", () => {
    const onIntent = vi.fn();
    render(
      <OrbitalChartView
        svg={drillOutSvg}
        scopeCenter="red_prospect"
        onIntent={onIntent}
      />
    );
    const host = screen.getByTestId("orbital-chart-host");
    const target = host.querySelector(
      '[data-action="drill_out"]'
    ) as HTMLElement | null;
    fireEvent.click(target!);
    expect(onIntent).toHaveBeenCalledWith({ kind: "drill_out" });
  });

  it("re-renders when SVG prop changes", () => {
    const { rerender } = render(
      <OrbitalChartView svg={mockSvg} scopeCenter="coyote" onIntent={() => {}} />
    );
    const host = screen.getByTestId("orbital-chart-host");
    expect(host.querySelector('[data-body-id="red_prospect"]')).not.toBeNull();

    rerender(
      <OrbitalChartView
        svg={drillOutSvg}
        scopeCenter="red_prospect"
        onIntent={() => {}}
      />
    );
    expect(host.querySelector('[data-body-id="red_prospect"]')).toBeNull();
    expect(host.querySelector('[data-action="drill_out"]')).not.toBeNull();
  });

  it("exposes scope_center on the container for assertions", () => {
    render(
      <OrbitalChartView svg={mockSvg} scopeCenter="coyote" onIntent={() => {}} />
    );
    const container = screen.getByTestId("orbital-chart-container");
    expect(container.getAttribute("data-scope-center")).toBe("coyote");
  });
});
