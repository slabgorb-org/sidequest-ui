// sidequest-ui/src/components/reference/sections/__tests__/RulesDocument.test.tsx
//
// Tests for the RulesDocument full-width accordion-list (ADR-149 Phase 1).
//
// Invariants under test:
//   1. One accordion item per chapter (a stacked collapsible list, NOT a card grid)
//   2. Full chapter body NOT in the DOM until its item is expanded
//      (progressive disclosure actually works)
//   3. Provenance attribution footer present and verbatim
//   4. Verbatim body text is accessible after expanding
//   5. Multiple chapters can be open independently at once
//   6. Chapter anchor ids present (for deep links and TOC scroll-spy)
//   7. WIRING: RulesDocument is reachable from SectionDispatch (case "ruleset_reference")
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RulesDocument } from "../RulesDocument";
import { SectionDispatch } from "../SectionDispatch";
import type { RulesDocumentSection } from "../../../../types/reference";

const section: RulesDocumentSection = {
  id: "ruleset_reference",
  type: "rules_document",
  label: "The Rules of Fate Core",
  ruleset: "fate",
  chapters: [
    {
      anchor: "fate-basics",
      title: "The Basics",
      order: 1,
      srd_ref: "Basics",
      body_markdown: "Play uses **aspects**.\n\n## Fate Points\n\nSpend fate points to invoke.",
    },
    {
      anchor: "fate-skills",
      title: "Skills",
      order: 2,
      srd_ref: "Skills",
      body_markdown: "## Skills\n\nSkills measure what you can do.",
    },
  ],
  provenance: {
    source: "Fate Core System",
    license: "ccby",
    attribution: "Licensed under Creative Commons Attribution 3.0.",
  },
};

describe("RulesDocument — full-width accordion list (ADR-149 Phase 1)", () => {
  // NOTE (2026-06-17 shell-accordion refactor): RulesDocument is now HEADLESS —
  // the "The Rules of Fate Core" section label and the `section-ruleset-reference`
  // wrapper anchor moved UP to the shell's section accordion (ReferenceDocument),
  // asserted in ReferenceShell.test.tsx. This component returns the SRD body only
  // (the chapter accordion + provenance footer).

  it("renders one accordion item per chapter — chapter titles visible on landing", () => {
    const { container } = render(<RulesDocument section={section} />);
    // Both chapter titles appear immediately (the collapsed accordion rows)
    expect(screen.getByRole("heading", { name: "The Basics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    // One accordion item per chapter
    const items = container.querySelectorAll('[data-slot="accordion-item"]');
    expect(items).toHaveLength(section.chapters.length);
  });

  it("renders NO card grid (the pivot away from cards)", () => {
    const { container } = render(<RulesDocument section={section} />);
    expect(container.querySelector(".rules-document__card-grid")).toBeNull();
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  it("preserves anchor ids for deep links and TOC (scroll-spy)", () => {
    const { container } = render(<RulesDocument section={section} />);
    expect(container.querySelector("#fate-basics")).not.toBeNull();
    expect(container.querySelector("#fate-skills")).not.toBeNull();
    // data-toc-anchor secondary selector used by useScrollSpy
    expect(container.querySelector('[data-toc-anchor="fate-basics"]')).not.toBeNull();
  });

  // The `section-ruleset-reference` wrapper anchor moved to the shell accordion
  // item (2026-06-17) — asserted in ReferenceShell.test.tsx, not on the headless
  // RulesDocument body.

  it("full chapter body text is NOT in the DOM before disclosure (progressive disclosure)", () => {
    render(<RulesDocument section={section} />);
    // "aspects" is inside the first chapter's body_markdown — it must NOT be
    // present until the user expands that item.
    expect(screen.queryByText(/aspects/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Spend fate points/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Skills measure/)).not.toBeInTheDocument();
  });

  it("reveals verbatim chapter body after expanding (accordion discloses text)", async () => {
    const user = userEvent.setup();
    render(<RulesDocument section={section} />);

    // Expand the first chapter via its title heading's trigger row
    await user.click(screen.getByRole("heading", { name: "The Basics" }));

    expect(screen.getByText("aspects")).toBeInTheDocument();
    expect(screen.getByText(/Spend fate points to invoke/)).toBeInTheDocument();
  });

  it("allows multiple chapters open at once (independent collapse)", async () => {
    const user = userEvent.setup();
    render(<RulesDocument section={section} />);

    // Open chapter 1
    await user.click(screen.getByRole("heading", { name: "The Basics" }));
    expect(screen.getByText(/Spend fate points to invoke/)).toBeInTheDocument();

    // Open chapter 2 — chapter 1 must STAY open (multiple-open)
    await user.click(screen.getByRole("heading", { name: "Skills" }));
    expect(screen.getByText(/Skills measure what you can do/)).toBeInTheDocument();
    // Chapter 1's body is still present — not collapsed by opening chapter 2
    expect(screen.getByText(/Spend fate points to invoke/)).toBeInTheDocument();
  });

  it("renders the provenance attribution footer verbatim", () => {
    render(<RulesDocument section={section} />);
    expect(
      screen.getByText("Licensed under Creative Commons Attribution 3.0."),
    ).toBeInTheDocument();
  });

  it("shows a muted one-line preview of H2/H3 section names in the trigger", () => {
    render(<RulesDocument section={section} />);
    // First chapter has an ## "Fate Points" heading → appears in the preview
    expect(screen.getByText(/Fate Points/)).toBeInTheDocument();
  });
});

describe("RulesDocument WIRING — reachable from SectionDispatch (ADR-149 Phase 1)", () => {
  it("dispatches ruleset_reference to RulesDocument — anchor ids present", () => {
    const { container } = render(<SectionDispatch section={section} />);
    // The anchors prove RulesDocument fired (not the fallback NodeTree path)
    expect(container.querySelector("#fate-basics")).not.toBeNull();
    expect(container.querySelector("#fate-skills")).not.toBeNull();
  });

  it("dispatches ruleset_reference — one accordion item per chapter, no card grid", () => {
    const { container } = render(<SectionDispatch section={section} />);
    const items = container.querySelectorAll('[data-slot="accordion-item"]');
    expect(items).toHaveLength(section.chapters.length);
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  it("dispatches ruleset_reference — body absent before expand, verbatim after", async () => {
    const user = userEvent.setup();
    render(<SectionDispatch section={section} />);
    expect(screen.queryByText(/Spend fate points/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("heading", { name: "The Basics" }));
    expect(screen.getByText(/Spend fate points to invoke/)).toBeInTheDocument();
  });

  it("dispatches ruleset_reference — provenance footer present", () => {
    render(<SectionDispatch section={section} />);
    expect(
      screen.getByText("Licensed under Creative Commons Attribution 3.0."),
    ).toBeInTheDocument();
  });
});
