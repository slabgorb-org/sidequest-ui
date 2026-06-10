// 2026-06-09 reference redesign — page shell tests.
//
// Covers the pieces the redesign added around the section dispatch:
//   - Masthead: eyebrow · title · dateline per docType, fed by the projection
//     `meta` block; skipped entirely (no crash, sections still render) when an
//     older server omits `meta`.
//   - Toc: derived from the projection via buildToc, rendered as a nav with
//     section links; subsection links target the NodeTree anchor ids.
//   - Wiring: ReferenceDocument (the production shell) renders masthead + TOC
//     + sections together — the redesign pieces are reachable from the real
//     page path, not just in isolation.

import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Masthead } from "@/screens/reference/Masthead";
import { ReferenceDocument } from "@/screens/reference/ReferenceDocument";
import type { ReferenceMeta, ReferenceSection } from "@/types/reference";

const meta: ReferenceMeta = {
  pack_label: "Tea and Murder",
  dateline: "the kettle is on and someone won't see breakfast",
  world_name: "Glenross",
};

const worldSection: ReferenceSection = {
  id: "world",
  label: "The world",
  node: {
    type: "dict",
    entries: [
      {
        key: "premise",
        label: "Premise",
        node: { type: "scalar", value: "p".repeat(150) },
      },
    ],
  },
};

describe("Masthead (2026-06-09 redesign)", () => {
  it("lore: eyebrow carries pack label, title is the world name, dateline from meta", () => {
    render(<Masthead docType="lore" meta={meta} />);
    expect(screen.getByText(/World lore/)).toBeInTheDocument();
    expect(screen.getByText(/Tea and Murder/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Glenross" })).toBeInTheDocument();
    expect(
      screen.getByText("the kettle is on and someone won't see breakfast"),
    ).toBeInTheDocument();
  });

  it("rules: title is 'Rules of play' and the dateline is the fixed rulebook copy", () => {
    render(<Masthead docType="rules" meta={{ pack_label: "Tea and Murder" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Rules of play" })).toBeInTheDocument();
    expect(
      screen.getByText("As kept by the narrator. These hold in every world of the pack."),
    ).toBeInTheDocument();
  });

  it("lore without a dateline omits the dateline element (pack had no blurb chrome)", () => {
    const { container } = render(
      <Masthead docType="lore" meta={{ pack_label: "Demo Pack", world_name: "Demoworld" }} />,
    );
    expect(container.querySelector(".reference-masthead__dateline")).toBeNull();
  });
});

describe("ReferenceDocument shell WIRING (2026-06-09 redesign)", () => {
  it("renders masthead, TOC and sections together from one projection", () => {
    render(
      <ReferenceDocument
        docType="lore"
        loading={false}
        error={null}
        sections={[worldSection]}
        meta={meta}
      />,
    );
    // Masthead reached the page.
    expect(screen.getByRole("heading", { level: 1, name: "Glenross" })).toBeInTheDocument();
    // TOC nav with a link to the section anchor and a sub-link to the
    // NodeTree subsection anchor (`{section}--{key}`).
    const toc = screen.getByRole("navigation", { name: "Contents" });
    expect(within(toc).getByRole("link", { name: "The world" })).toHaveAttribute(
      "href",
      "#section-world",
    );
    expect(within(toc).getByRole("link", { name: "Premise" })).toHaveAttribute(
      "href",
      "#world--premise",
    );
    // The section itself rendered, anchored, with the matching subsection id.
    expect(document.getElementById("section-world")).not.toBeNull();
    expect(document.getElementById("world--premise")).not.toBeNull();
  });

  it("renders sections without a masthead when the projection has no meta (older server)", () => {
    render(
      <ReferenceDocument
        docType="lore"
        loading={false}
        error={null}
        sections={[worldSection]}
        meta={undefined}
      />,
    );
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /The world/ })).toBeInTheDocument();
  });

  it("keeps the loading and error contracts (role=status / role=alert)", () => {
    const { unmount } = render(
      <ReferenceDocument
        docType="rules"
        loading={true}
        error={null}
        sections={undefined}
        meta={undefined}
      />,
    );
    expect(screen.getByRole("status")).toHaveClass("reference-document--loading");
    unmount();
    render(
      <ReferenceDocument
        docType="rules"
        loading={false}
        error="boom"
        sections={undefined}
        meta={undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveClass("reference-document--error");
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
