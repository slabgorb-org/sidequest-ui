import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReferenceLinks } from "@/components/ReferenceLinks";

describe("ReferenceLinks disabled states", () => {
  it("renders both buttons enabled when pack and world are set", () => {
    render(<ReferenceLinks pack="tea_and_murder" world="glenross" />);
    const rules = screen.getByRole("link", { name: /rules/i });
    const lore = screen.getByRole("link", { name: /lore/i });
    expect(rules).toHaveAttribute("href", "/reference/rules/tea_and_murder");
    expect(lore).toHaveAttribute(
      "href",
      "/reference/lore/tea_and_murder/glenross",
    );
  });

  it("renders Lore as aria-disabled when world is missing", () => {
    render(<ReferenceLinks pack="tea_and_murder" world={null} />);
    const lore = screen.getByText(/lore/i).closest('[aria-disabled="true"]');
    expect(lore).not.toBeNull();
    // Rules is still a real link.
    expect(screen.getByRole("link", { name: /rules/i })).toBeInTheDocument();
  });

  it("renders both buttons as aria-disabled when pack is missing", () => {
    render(<ReferenceLinks pack={null} world={null} />);
    const rules = screen.getByText(/rules/i).closest('[aria-disabled="true"]');
    const lore = screen.getByText(/lore/i).closest('[aria-disabled="true"]');
    expect(rules).not.toBeNull();
    expect(lore).not.toBeNull();
    expect(screen.queryByRole("link", { name: /rules/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /lore/i })).toBeNull();
  });

  it("wrapping div always renders regardless of prop state", () => {
    const { rerender } = render(<ReferenceLinks pack={null} world={null} />);
    expect(screen.getByTestId("reference-links")).toBeInTheDocument();

    rerender(<ReferenceLinks pack="tea_and_murder" world={null} />);
    expect(screen.getByTestId("reference-links")).toBeInTheDocument();

    rerender(<ReferenceLinks pack="tea_and_murder" world="glenross" />);
    expect(screen.getByTestId("reference-links")).toBeInTheDocument();
  });
});
