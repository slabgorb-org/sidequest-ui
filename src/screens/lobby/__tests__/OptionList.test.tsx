import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OptionList, type OptionGroup } from "../OptionList";

// Two genres, the first with two worlds and the second with one, so the
// "arrow nav crosses a genre boundary" assertion has a real boundary to cross.
const groups: OptionGroup[] = [
  {
    slug: "elemental_harmony",
    label: "Elemental Harmony",
    rulesHref: "/reference/rules/elemental_harmony",
    items: [
      { slug: "elemental_harmony/the_burning_peace", label: "The Burning Peace" },
      { slug: "elemental_harmony/the_shattered_accord", label: "The Shattered Accord" },
    ],
  },
  {
    slug: "space_opera",
    label: "Space Opera",
    rulesHref: "/reference/rules/space_opera",
    items: [{ slug: "space_opera/the_aureate_span", label: "The Aureate Span" }],
  },
];

beforeEach(() => {
  // jsdom has no scrollIntoView; stub it so the auto-scroll effect is callable.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("OptionList grouped mode", () => {
  it("renders a genre header per group with a Rules link", () => {
    render(
      <OptionList ariaLabel="World" groups={groups} selected={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("Elemental Harmony")).toBeInTheDocument();
    expect(screen.getByText("Space Opera")).toBeInTheDocument();
    const rules = screen.getByRole("link", { name: "Elemental Harmony rules" });
    expect(rules).toHaveAttribute("href", "/reference/rules/elemental_harmony");
    expect(rules).toHaveAttribute("target", "_blank");
    expect(rules).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders one radiogroup spanning every world across groups", () => {
    render(
      <OptionList ariaLabel="World" groups={groups} selected={null} onSelect={() => {}} />,
    );
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.getAllByRole("radio")).toHaveLength(3); // 2 + 1
  });

  it("arrow-key nav flows across genre boundaries and skips headers", () => {
    const onSelect = vi.fn();
    render(
      <OptionList
        ariaLabel="World"
        groups={groups}
        selected="elemental_harmony/the_shattered_accord"
        onSelect={onSelect}
      />,
    );
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowDown" });
    // Next world after the last item of group 1 is the first item of group 2 —
    // proving the keyboard model operates over a flattened list, not per-group.
    expect(onSelect).toHaveBeenCalledWith("space_opera/the_aureate_span");
  });

  it("Home jumps to the first world and End to the last across all groups", () => {
    const onSelect = vi.fn();
    render(
      <OptionList
        ariaLabel="World"
        groups={groups}
        selected="elemental_harmony/the_shattered_accord"
        onSelect={onSelect}
      />,
    );
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "Home" });
    expect(onSelect).toHaveBeenCalledWith("elemental_harmony/the_burning_peace");
    fireEvent.keyDown(group, { key: "End" });
    expect(onSelect).toHaveBeenCalledWith("space_opera/the_aureate_span");
  });

  it("genre headers are presentation rows, not radios", () => {
    render(
      <OptionList ariaLabel="World" groups={groups} selected={null} onSelect={() => {}} />,
    );
    // The header carries the genre label but must NOT be a radio — only the
    // three worlds are in the radio set (asserted above). Confirm no radio is
    // named for a genre header.
    expect(screen.queryByRole("radio", { name: /^Elemental Harmony$/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Space Opera$/ })).toBeNull();
  });

  it("scrolls the selected world into view", () => {
    render(
      <OptionList
        ariaLabel="World"
        groups={groups}
        selected="space_opera/the_aureate_span"
        onSelect={() => {}}
      />,
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("omits the Rules link when rulesHref is null", () => {
    render(
      <OptionList
        ariaLabel="World"
        groups={[{ ...groups[0], rulesHref: null }]}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole("link", { name: /rules/i })).toBeNull();
  });
});

// Regression guard: the existing flat `items` mode must keep working unchanged
// so ModePicker and any genre-only caller are unaffected by the grouped mode.
describe("OptionList flat mode (unchanged)", () => {
  it("still renders a flat radio set from items", () => {
    const onSelect = vi.fn();
    render(
      <OptionList
        ariaLabel="Mode"
        items={[
          { slug: "solo", label: "Solo" },
          { slug: "multiplayer", label: "Multiplayer" },
        ]}
        selected="solo"
        onSelect={onSelect}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith("multiplayer");
  });
});
