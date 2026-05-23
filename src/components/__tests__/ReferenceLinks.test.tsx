import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReferenceLinks } from "@/components/ReferenceLinks";


describe("ReferenceLinks", () => {
  it("renders Rules and Lore links with correct hrefs", () => {
    render(<ReferenceLinks pack="tea_and_murder" world="glenross" />);
    const rules = screen.getByRole("link", { name: /^rules$/i });
    const lore = screen.getByRole("link", { name: /^lore$/i });
    expect(rules).toHaveAttribute("href", "/reference/rules/tea_and_murder");
    expect(lore).toHaveAttribute("href", "/reference/lore/tea_and_murder/glenross");
  });

  it("opens links in a new tab with noopener", () => {
    render(<ReferenceLinks pack="tea_and_murder" world="glenross" />);
    const rules = screen.getByRole("link", { name: /^rules$/i });
    expect(rules).toHaveAttribute("target", "_blank");
    expect(rules).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders nothing when pack is missing", () => {
    const { container } = render(<ReferenceLinks pack={null} world="glenross" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only Rules link when world is missing", () => {
    render(<ReferenceLinks pack="tea_and_murder" world={null} />);
    expect(screen.queryByRole("link", { name: /^rules$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^lore$/i })).not.toBeInTheDocument();
  });
});
