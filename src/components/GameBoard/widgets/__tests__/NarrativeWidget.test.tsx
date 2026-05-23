import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NarrativeWidget } from "@/components/GameBoard/widgets/NarrativeWidget";


describe("NarrativeWidget — reference links wiring", () => {
  it("renders the ReferenceLinks when pack and world are supplied", () => {
    render(
      <NarrativeWidget
        messages={[]}
        genreSlug="tea_and_murder"
        worldSlug="glenross"
      />,
    );
    expect(screen.getByTestId("reference-links")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^rules$/i }),
    ).toHaveAttribute("href", "/reference/rules/tea_and_murder");
    expect(
      screen.getByRole("link", { name: /^lore$/i }),
    ).toHaveAttribute("href", "/reference/lore/tea_and_murder/glenross");
  });

  it("does not render reference links when genreSlug is missing", () => {
    render(<NarrativeWidget messages={[]} />);
    expect(screen.queryByTestId("reference-links")).not.toBeInTheDocument();
  });
});
