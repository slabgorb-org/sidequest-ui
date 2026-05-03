import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OrbitalChartView } from "../OrbitalChartView";

const mockSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-400 -400 800 800">
  <g id="viewport">
    <g id="layer-engraved">
      <g class="drillable" data-action="drill_in:red_prospect" data-body-id="red_prospect">
        <circle cx="100" cy="0" r="4" data-body-id="red_prospect"/>
      </g>
    </g>
  </g>
</svg>`;

const drillOutSvg = `<svg viewBox="0 0 800 800">
  <g id="viewport">
    <g data-action="drill_out"><text>← COYOTE SYSTEM</text></g>
  </g>
</svg>`;

const defaultProps = {
  scopeCenter: "coyote",
  tHours: 0,
  epochDays: 0,
  nextConjunction: null,
  onIntent: () => {},
};

describe("OrbitalChartView", () => {
  it("renders the provided SVG markup", () => {
    render(<OrbitalChartView {...defaultProps} svg={mockSvg} />);
    const host = screen.getByTestId("orbital-chart-host");
    expect(host.querySelector('[data-body-id="red_prospect"]')).not.toBeNull();
  });

  it("fires drill_in intent on click of element with data-action drill_in", () => {
    const onIntent = vi.fn();
    render(
      <OrbitalChartView {...defaultProps} svg={mockSvg} onIntent={onIntent} />
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
        {...defaultProps}
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
      <OrbitalChartView {...defaultProps} svg={mockSvg} />
    );
    expect(
      screen.getByTestId("orbital-chart-host").querySelector(
        '[data-body-id="red_prospect"]'
      )
    ).not.toBeNull();

    rerender(
      <OrbitalChartView
        {...defaultProps}
        svg={drillOutSvg}
        scopeCenter="red_prospect"
      />
    );
    // Outer wrapper keys impl by svg → impl remounts → re-query host.
    const host = screen.getByTestId("orbital-chart-host");
    expect(host.querySelector('[data-body-id="red_prospect"]')).toBeNull();
    expect(host.querySelector('[data-action="drill_out"]')).not.toBeNull();
  });

  it("exposes scope_center on the container for assertions", () => {
    render(<OrbitalChartView {...defaultProps} svg={mockSvg} />);
    const container = screen.getByTestId("orbital-chart-container");
    expect(container.getAttribute("data-scope-center")).toBe("coyote");
  });

  it("renders the HUD top strip with stardate / day / clock", () => {
    render(
      <OrbitalChartView
        {...defaultProps}
        svg={mockSvg}
        tHours={24 * 100 + 14}
        epochDays={147.6}
      />
    );
    expect(screen.getByTestId("hud-top-strip")).toBeInTheDocument();
    expect(screen.getByTestId("hud-stardate").textContent).toMatch(/STARDATE/);
    expect(screen.getByTestId("hud-day").textContent).toMatch(/DAY\s*100/);
    expect(screen.getByTestId("hud-clock").textContent).toMatch(/14:00/);
  });

  it("renders the HUD bottom strip with conjunction event when present", () => {
    render(
      <OrbitalChartView
        {...defaultProps}
        svg={mockSvg}
        nextConjunction={{
          body_a_id: "alpha",
          body_b_id: "beta",
          label: "ALPHA ↔ BETA",
          t_hours_event: 100,
          t_hours_until: 100,
        }}
      />
    );
    expect(screen.getByTestId("hud-conjunction-label").textContent).toBe(
      "ALPHA ↔ BETA"
    );
    expect(screen.getByTestId("hud-conjunction-countdown").textContent).toMatch(
      /T\+4d\s*04h/
    );
    expect(screen.getByTestId("hud-scale-ruler")).toBeInTheDocument();
  });

  it("hides conjunction panel when nextConjunction is null but keeps scale ruler", () => {
    render(<OrbitalChartView {...defaultProps} svg={mockSvg} />);
    expect(screen.queryByTestId("hud-conjunction")).toBeNull();
    expect(screen.getByTestId("hud-conjunction-empty")).toBeInTheDocument();
    expect(screen.getByTestId("hud-scale-ruler")).toBeInTheDocument();
  });
});
