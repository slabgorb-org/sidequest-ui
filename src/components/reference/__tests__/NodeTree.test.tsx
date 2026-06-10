// Story 100-8 (Phase 2) — RED.
//
// The generic node-tree renderer (AC3) consumes the Phase-1 server projection
// node shape and renders it. The projection emits exactly three node kinds
// (see sidequest-server/sidequest/server/reference_projection.py::_project_node):
//
//   { type: "scalar", value: <primitive> }
//   { type: "list",   items: ReferenceNode[] }
//   { type: "dict",   entries: [{ key, label, node }, ...] }
//
// These tests pin the component CONTRACT (props = a ReferenceNode) and its
// rendered OUTPUT — not internal state. Testing-Library queries on visible
// text, no snapshots, no implementation coupling.
//
// Component under test (to be created by Dev in GREEN):
//   src/components/reference/NodeTree.tsx  →  export function NodeTree({ node }: { node: ReferenceNode })
// Types (to be created by Dev in GREEN):
//   src/types/reference.ts  →  ReferenceNode, ReferenceDictEntry

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NodeTree } from "@/components/reference/NodeTree";
import type { ReferenceNode } from "@/types/reference";

describe("NodeTree — generic node-tree renderer (AC3)", () => {
  it("renders a scalar string value as text", () => {
    const node: ReferenceNode = { type: "scalar", value: "A sworn blade of the Long Foundry" };
    render(<NodeTree node={node} />);
    expect(
      screen.getByText("A sworn blade of the Long Foundry"),
    ).toBeInTheDocument();
  });

  it("renders a scalar numeric value as text", () => {
    const node: ReferenceNode = { type: "scalar", value: 42 };
    render(<NodeTree node={node} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders a null scalar without crashing (defense in depth)", () => {
    const node: ReferenceNode = { type: "scalar", value: null };
    // Must not throw; renders an empty / graceful placeholder.
    expect(() => render(<NodeTree node={node} />)).not.toThrow();
  });

  it("renders each dict entry's humanized label and its nested value", () => {
    const node: ReferenceNode = {
      type: "dict",
      entries: [
        { key: "allegiance", label: "Allegiance", node: { type: "scalar", value: "Evropi" } },
        { key: "rank", label: "Rank", node: { type: "scalar", value: "Foundry-Marshal" } },
      ],
    };
    render(<NodeTree node={node} />);
    expect(screen.getByText("Allegiance")).toBeInTheDocument();
    expect(screen.getByText("Evropi")).toBeInTheDocument();
    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(screen.getByText("Foundry-Marshal")).toBeInTheDocument();
  });

  it("renders every item of a list node", () => {
    const node: ReferenceNode = {
      type: "list",
      items: [
        { type: "scalar", value: "Oathkeeper" },
        { type: "scalar", value: "Stormbreaker" },
        { type: "scalar", value: "Ashmender" },
      ],
    };
    render(<NodeTree node={node} />);
    expect(screen.getByText("Oathkeeper")).toBeInTheDocument();
    expect(screen.getByText("Stormbreaker")).toBeInTheDocument();
    expect(screen.getByText("Ashmender")).toBeInTheDocument();
  });

  it("recurses through nested dict → list → dict → scalar (AC3 nesting)", () => {
    const node: ReferenceNode = {
      type: "dict",
      entries: [
        {
          key: "factions",
          label: "Factions",
          node: {
            type: "list",
            items: [
              {
                type: "dict",
                entries: [
                  { key: "name", label: "Name", node: { type: "scalar", value: "The Long Foundry" } },
                  { key: "creed", label: "Creed", node: { type: "scalar", value: "Forge or be forged" } },
                ],
              },
            ],
          },
        },
      ],
    };
    render(<NodeTree node={node} />);
    // Outer label, plus the deeply nested leaves, must all reach the DOM.
    expect(screen.getByText("Factions")).toBeInTheDocument();
    expect(screen.getByText("The Long Foundry")).toBeInTheDocument();
    expect(screen.getByText("Creed")).toBeInTheDocument();
    expect(screen.getByText("Forge or be forged")).toBeInTheDocument();
    // Redesign: the identity entry titles the item block — "The Long Foundry"
    // is promoted to a heading and its "Name" label no longer renders.
    expect(screen.getByRole("heading", { name: "The Long Foundry" })).toBeInTheDocument();
    expect(screen.queryByText("Name")).not.toBeInTheDocument();
  });

  it("does NOT render dict entries whose key is private/devnote-prefixed (AC5 defense in depth)", () => {
    // The server already suppresses leading-underscore keys at projection time,
    // but the UI must not assume — it independently refuses to surface them.
    const node: ReferenceNode = {
      type: "dict",
      entries: [
        { key: "summary", label: "Summary", node: { type: "scalar", value: "Public flavor" } },
        { key: "_devnote", label: "Devnote", node: { type: "scalar", value: "KEEPER ONLY SECRET" } },
      ],
    };
    render(<NodeTree node={node} />);
    expect(screen.getByText("Public flavor")).toBeInTheDocument();
    expect(screen.queryByText("KEEPER ONLY SECRET")).not.toBeInTheDocument();
    expect(screen.queryByText("Devnote")).not.toBeInTheDocument();
  });
});

describe("NodeTree — shape-aware treatments (2026-06-09 redesign)", () => {
  it("formats snake_case identifiers as words and booleans as Yes/No", () => {
    const node: ReferenceNode = {
      type: "dict",
      entries: [
        { key: "check", label: "Check", node: { type: "scalar", value: "opposed_check" } },
        { key: "lethal", label: "Lethal", node: { type: "scalar", value: false } },
      ],
    };
    render(<NodeTree node={node} />);
    expect(screen.getByText("opposed check")).toBeInTheDocument();
    expect(screen.queryByText("opposed_check")).not.toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("renders a short word-list as an inline lozenge run, not a <ul>", () => {
    const node: ReferenceNode = {
      type: "list",
      items: [
        { type: "scalar", value: "haggle" },
        { type: "scalar", value: "bargain" },
        { type: "scalar", value: "barter" },
      ],
    };
    const { container } = render(<NodeTree node={node} depth={1} />);
    expect(container.querySelector(".reference-inline-run")).not.toBeNull();
    expect(container.querySelector("ul")).toBeNull();
    expect(screen.getByText("haggle")).toBeInTheDocument();
  });

  it("groups consecutive depth-0 compact entries into one spec box", () => {
    const node: ReferenceNode = {
      type: "dict",
      entries: [
        { key: "stat_generation", label: "Stat generation", node: { type: "scalar", value: "point_buy" } },
        { key: "point_buy_budget", label: "Point buy budget", node: { type: "scalar", value: 27 } },
        {
          key: "history",
          label: "History",
          node: { type: "scalar", value: "x".repeat(200) },
        },
      ],
    };
    const { container } = render(<NodeTree node={node} sectionId="rules" />);
    // One ledger holding BOTH config keys — they never each earn a heading.
    const specs = container.querySelectorAll(".reference-dl--spec");
    expect(specs).toHaveLength(1);
    expect(specs[0]).toHaveTextContent("Stat generation");
    expect(specs[0]).toHaveTextContent("point buy");
    expect(specs[0]).toHaveTextContent("Point buy budget");
    // The prose entry gets an anchored subsection heading instead.
    const heading = screen.getByRole("heading", { name: /History/ });
    expect(heading.closest(".reference-subsection")).toHaveAttribute("id", "rules--history");
  });

  it("cards mode renders a root list of shallow dicts as a card grid", () => {
    const node: ReferenceNode = {
      type: "list",
      items: [
        {
          type: "dict",
          entries: [
            { key: "name", label: "Name", node: { type: "scalar", value: "First Pot Brewed" } },
            { key: "description", label: "Description", node: { type: "scalar", value: "Brew tea." } },
          ],
        },
        {
          type: "dict",
          entries: [
            { key: "name", label: "Name", node: { type: "scalar", value: "Parish Notice" } },
            { key: "description", label: "Description", node: { type: "scalar", value: "Be noticed." } },
          ],
        },
      ],
    };
    const { container } = render(<NodeTree node={node} mode="cards" sectionId="achievements" />);
    expect(container.querySelectorAll(".reference-card")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "First Pot Brewed" })).toBeInTheDocument();
  });

  it("cards mode keeps deep structures in full-width flow (cards never nest)", () => {
    const beats: ReferenceNode = {
      type: "list",
      items: [
        {
          type: "dict",
          entries: [
            { key: "label", label: "Label", node: { type: "scalar", value: "Open strong" } },
            {
              key: "deltas",
              label: "Deltas",
              node: {
                type: "dict",
                entries: [
                  {
                    key: "crit_fail",
                    label: "Crit fail",
                    node: {
                      type: "dict",
                      entries: [
                        { key: "own", label: "Own", node: { type: "scalar", value: -2 } },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const node: ReferenceNode = {
      type: "dict",
      entries: [{ key: "confrontations", label: "Confrontations", node: beats }],
    };
    const { container } = render(<NodeTree node={node} mode="cards" sectionId="rules" />);
    // Deep items are NOT cardable → titled item blocks, no cards.
    expect(container.querySelector(".reference-card")).toBeNull();
    expect(container.querySelector(".reference-itemblocks")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Open strong" })).toBeInTheDocument();
  });
});
