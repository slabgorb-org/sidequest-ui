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

  it("renders the container with both buttons disabled when pack is missing", () => {
    render(<ReferenceLinks pack={null} world="glenross" />);
    expect(screen.getByTestId("reference-links")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^rules$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^lore$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/^rules$/i).closest('[aria-disabled="true"]')).not.toBeNull();
    expect(screen.getByText(/^lore$/i).closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it("renders Rules as a link and Lore as disabled when world is missing", () => {
    render(<ReferenceLinks pack="tea_and_murder" world={null} />);
    expect(screen.getByRole("link", { name: /^rules$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^lore$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/^lore$/i).closest('[aria-disabled="true"]')).not.toBeNull();
  });
});
