// ArchetypesSection — per-archetype collapse (2026-06-18).
//
// The `archetypes` section's projection is a `node` of type list, each item a
// deep dict (name + description + personality_traits + typical_classes +
// stat_ranges + … ). The dedicated renderer makes each archetype a collapsible
// accordion item: name = trigger, structured block = on-demand body.
//
// Invariants under test:
//   1. One accordion item per archetype (a tidy list of name rows)
//   2. Archetype structured body NOT in the DOM until its item is expanded
//      (progressive disclosure)
//   3. Structured fields (rendered via NodeTree) present after expanding
//   4. Multiple archetypes can be open independently
//   5. Headless — no nested section chrome (no `section-archetypes`, no
//      `.reference-section__label`); the shell provides those
//   6. WIRING: reachable from SectionDispatch case "archetypes"
//
// Synthetic fixtures only — no live pack slugs.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";

import { ArchetypesSection } from "../ArchetypesSection";
import { SectionDispatch } from "../SectionDispatch";
import type { GenericSection } from "../../../../types/reference";

const section: GenericSection = {
  id: "archetypes",
  label: "Archetypes",
  node: {
    type: "list",
    items: [
      {
        type: "dict",
        entries: [
          { key: "name", label: "Name", node: { type: "scalar", value: "The Innocent" } },
          {
            key: "description",
            label: "Description",
            node: { type: "scalar", value: "A wide-eyed wanderer who trusts the world too readily." },
          },
          {
            key: "personality_traits",
            label: "Personality traits",
            node: {
              type: "list",
              items: [
                { type: "scalar", value: "earnest" },
                { type: "scalar", value: "hopeful" },
              ],
            },
          },
          {
            key: "stat_ranges",
            label: "Stat ranges",
            node: {
              type: "dict",
              entries: [
                { key: "wits", label: "Wits", node: { type: "scalar", value: "2-3" } },
                { key: "heart", label: "Heart", node: { type: "scalar", value: "4-5" } },
              ],
            },
          },
        ],
      },
      {
        type: "dict",
        entries: [
          { key: "name", label: "Name", node: { type: "scalar", value: "The Wit" } },
          {
            key: "description",
            label: "Description",
            node: { type: "scalar", value: "A sharp tongue that turns every room into a stage." },
          },
        ],
      },
    ],
  },
};

describe("ArchetypesSection — per-archetype accordion (2026-06-18)", () => {
  it("renders one accordion item per archetype — names visible on landing", () => {
    const { container } = render(<ArchetypesSection section={section} />);
    expect(screen.getByText("The Innocent")).toBeInTheDocument();
    expect(screen.getByText("The Wit")).toBeInTheDocument();
    const items = container.querySelectorAll('[data-slot="accordion-item"]');
    expect(items).toHaveLength(2);
  });

  it("does NOT render the archetype body before disclosure (progressive disclosure)", () => {
    render(<ArchetypesSection section={section} />);
    expect(
      screen.queryByText(/A wide-eyed wanderer who trusts the world too readily/),
    ).not.toBeInTheDocument();
    // A structured field label from the body is also absent until expanded.
    expect(screen.queryByText("earnest")).not.toBeInTheDocument();
  });

  it("reveals the structured body (via NodeTree) after expanding", async () => {
    const user = userEvent.setup();
    render(<ArchetypesSection section={section} />);
    await user.click(screen.getByText("The Innocent"));
    // Description prose renders.
    expect(
      screen.getByText("A wide-eyed wanderer who trusts the world too readily."),
    ).toBeInTheDocument();
    // List field formatting preserved (NodeTree inline run).
    expect(screen.getByText("earnest")).toBeInTheDocument();
    expect(screen.getByText("hopeful")).toBeInTheDocument();
    // Stat-range dict field formatting preserved (NodeTree pairs).
    expect(screen.getByText("2-3")).toBeInTheDocument();
    expect(screen.getByText("4-5")).toBeInTheDocument();
  });

  it("does NOT repeat the archetype name inside its own body (name is the trigger)", async () => {
    const user = userEvent.setup();
    render(<ArchetypesSection section={section} />);
    await user.click(screen.getByText("The Innocent"));
    // "The Innocent" appears exactly once — as the trigger, not duplicated in body.
    expect(screen.getAllByText("The Innocent")).toHaveLength(1);
  });

  it("allows multiple archetypes open at once (independent collapse)", async () => {
    const user = userEvent.setup();
    render(<ArchetypesSection section={section} />);
    await user.click(screen.getByText("The Innocent"));
    expect(
      screen.getByText("A wide-eyed wanderer who trusts the world too readily."),
    ).toBeInTheDocument();
    await user.click(screen.getByText("The Wit"));
    expect(
      screen.getByText("A sharp tongue that turns every room into a stage."),
    ).toBeInTheDocument();
    // The first archetype's body stays open.
    expect(
      screen.getByText("A wide-eyed wanderer who trusts the world too readily."),
    ).toBeInTheDocument();
  });

  it("is headless — no nested section chrome (no section-archetypes, no section label)", () => {
    const { container } = render(<ArchetypesSection section={section} />);
    expect(container.querySelector("#section-archetypes")).toBeNull();
    expect(container.querySelector(".reference-section__label")).toBeNull();
  });

  it("falls back to NodeTree (no crash) if the node is not a list of dicts", () => {
    const odd: GenericSection = {
      id: "archetypes",
      label: "Archetypes",
      node: { type: "scalar", value: "unexpected shape" },
    };
    expect(() => render(<ArchetypesSection section={odd} />)).not.toThrow();
    expect(screen.getByText("unexpected shape")).toBeInTheDocument();
  });
});

describe("ArchetypesSection WIRING — reachable from SectionDispatch (2026-06-18)", () => {
  it("dispatches the 'archetypes' section to ArchetypesSection (accordion items, not a flat wall)", () => {
    const { container } = render(<SectionDispatch section={section} />);
    const items = container.querySelectorAll('[data-slot="accordion-item"]');
    expect(items).toHaveLength(2);
    expect(screen.getByText("The Innocent")).toBeInTheDocument();
    expect(screen.getByText("The Wit")).toBeInTheDocument();
  });

  it("dispatched body is collapsed by default, revealed on expand", async () => {
    const user = userEvent.setup();
    render(<SectionDispatch section={section} />);
    expect(
      screen.queryByText(/A wide-eyed wanderer who trusts the world too readily/),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText("The Innocent"));
    expect(
      screen.getByText("A wide-eyed wanderer who trusts the world too readily."),
    ).toBeInTheDocument();
  });
});
