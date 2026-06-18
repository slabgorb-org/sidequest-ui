// sidequest-ui/src/components/reference/sections/__tests__/RulesDocument.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RulesDocument } from "../RulesDocument";
import type { RulesDocumentSection } from "../../../../types/reference";

const section: RulesDocumentSection = {
  id: "ruleset_reference",
  type: "rules_document",
  label: "The Rules of Fate Core",
  ruleset: "fate",
  chapters: [
    { anchor: "fate-basics", title: "The Basics", order: 1, srd_ref: "Basics", body_markdown: "Play uses **aspects**." },
    { anchor: "fate-skills", title: "Skills", order: 2, srd_ref: "Skills", body_markdown: "## Skills\n\nSkills measure what you can do." },
  ],
  provenance: { source: "Fate Core System", license: "ccby", attribution: "Licensed under Creative Commons Attribution 3.0." },
};

describe("RulesDocument", () => {
  it("renders the label heading and an anchor per chapter", () => {
    const { container } = render(<RulesDocument section={section} />);
    expect(screen.getByRole("heading", { name: "The Rules of Fate Core" })).toBeInTheDocument();
    expect(container.querySelector("#fate-basics")).not.toBeNull();
    expect(container.querySelector("#fate-skills")).not.toBeNull();
    expect(container.querySelector("#section-ruleset-reference")).not.toBeNull();
  });

  it("renders markdown bodies", () => {
    render(<RulesDocument section={section} />);
    expect(screen.getByText("aspects")).toBeInTheDocument(); // <strong>aspects</strong>
    expect(screen.getByRole("heading", { name: "Skills", level: 2 })).toBeInTheDocument();
  });

  it("renders the provenance attribution", () => {
    render(<RulesDocument section={section} />);
    expect(screen.getByText(/Creative Commons Attribution 3.0/)).toBeInTheDocument();
  });
});
