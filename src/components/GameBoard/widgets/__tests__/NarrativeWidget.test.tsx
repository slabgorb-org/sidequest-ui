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

  it("renders ReferenceLinks as disabled spans when genreSlug is missing", () => {
    render(<NarrativeWidget messages={[]} />);
    // Per reference-pages v2: the wrapper always renders so the affordance
    // stays visible; missing pack/world degrade to aria-disabled spans.
    expect(screen.getByTestId("reference-links")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^rules$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^lore$/i })).toBeNull();
    expect(
      screen.getByText(/^rules$/i).closest('[aria-disabled="true"]'),
    ).not.toBeNull();
    expect(
      screen.getByText(/^lore$/i).closest('[aria-disabled="true"]'),
    ).not.toBeNull();
  });
});
