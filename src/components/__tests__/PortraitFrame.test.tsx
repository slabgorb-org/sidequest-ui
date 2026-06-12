import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortraitFrame } from "../PortraitFrame";

describe("PortraitFrame", () => {
  it("renders an img with the radius class when url is present", () => {
    render(
      <PortraitFrame url="/renders/kael.png" name="Kael Stormbreaker" sizeClass="w-12 h-12" radiusClass="rounded-lg" />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/renders/kael.png");
    expect(img).toHaveClass("rounded-lg");
    expect(img).not.toHaveClass("rounded-full");
    expect(img).toHaveClass("aspect-square");
  });

  it("renders initials when url is absent", () => {
    render(<PortraitFrame name="Kael Stormbreaker" sizeClass="w-12 h-12" radiusClass="rounded-lg" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const placeholder = screen.getByTestId("portrait-frame-initials");
    expect(placeholder).toHaveTextContent("KS");
    expect(placeholder).toHaveClass("rounded-lg");
    expect(placeholder).not.toHaveClass("rounded-full");
  });

  it("swaps img -> initials on image error", () => {
    render(<PortraitFrame url="/renders/missing.png" name="Kael Stormbreaker" sizeClass="w-12 h-12" radiusClass="rounded-lg" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("portrait-frame-initials")).toHaveTextContent("KS");
  });

  it("caps initials at two characters", () => {
    render(<PortraitFrame name="The Cfrom Mountain Stir Trir" sizeClass="w-8 h-8" radiusClass="rounded-md" />);
    expect(screen.getByTestId("portrait-frame-initials")).toHaveTextContent("TC");
  });
});
