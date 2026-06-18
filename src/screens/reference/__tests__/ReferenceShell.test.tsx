// 2026-06-09 reference redesign — page shell tests.
// 2026-06-17 shell-accordion refactor — every top-level section is a collapsible
// panel in ONE controlled section accordion, COLLAPSED by default; the section
// chrome (the `section-{slug}` anchor + the `.reference-section__label` <h2>) now
// lives on the shell accordion item/trigger, and TOC clicks open the containing
// section (and any SRD chapter) before scrolling.
//
// Covers:
//   - Masthead: eyebrow · title · dateline per docType, fed by `meta`; skipped
//     (no crash, sections still render) when an older server omits `meta`.
//   - Section accordion backbone: collapsed by default; section labels are <h2>;
//     exactly ONE element per `section-{id}`; only renderable sections get items.
//   - TOC navigation: a TOC section link opens its section; a TOC SRD chapter
//     sub-link opens the section AND the nested chapter (target becomes visible).
//   - Headless lore: poi/cast sections render under the accordion (no double
//     chrome) once expanded.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { Masthead } from "@/screens/reference/Masthead";
import { ReferenceDocument } from "@/screens/reference/ReferenceDocument";
import type {
  CastSectionData,
  PoiSectionData,
  ReferenceMeta,
  ReferenceSection,
  RulesDocumentSection,
} from "@/types/reference";

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

const castSection: CastSectionData = {
  id: "cast",
  label: "Cast",
  members: [
    {
      slug: "marshal-vex",
      name: "Marshal Vex",
      role: "Foundry-Marshal",
      appearance: null,
      portrait_url: "https://r2.example.com/portraits/marshal-vex.png",
    },
  ],
};

const poiSection: PoiSectionData = {
  id: "poi",
  label: "Points of Interest",
  entries: [
    {
      slug: "the-long-foundry",
      name: "The Long Foundry",
      region: "Evropi",
      description: "Cathedral of hammers.",
      image_url: "https://r2.example.com/poi/the-long-foundry.png",
    },
  ],
};

const rulesetSection: RulesDocumentSection = {
  id: "ruleset_reference",
  type: "rules_document",
  label: "The Rules of Fate Core",
  ruleset: "fate",
  chapters: [
    { anchor: "fate-basics", title: "The Basics", order: 1, srd_ref: "B", body_markdown: "Play uses **aspects**." },
    { anchor: "fate-skills", title: "Skills", order: 2, srd_ref: "S", body_markdown: "Skills measure what you can do." },
  ],
  provenance: { source: "Fate Core System", license: "ccby", attribution: "CC BY 3.0." },
};

function renderShell(sections: ReferenceSection[], docType: "lore" | "rules" = "lore") {
  return render(
    <ReferenceDocument
      docType={docType}
      loading={false}
      error={null}
      sections={sections}
      meta={undefined}
    />,
  );
}

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

describe("ReferenceDocument — section accordion backbone (2026-06-17)", () => {
  it("renders every section COLLAPSED by default — section bodies are not in the DOM", () => {
    renderShell([worldSection, castSection]);
    // Section labels (triggers) are present...
    expect(screen.getByRole("heading", { level: 2, name: /The world/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Cast/ })).toBeInTheDocument();
    // ...but the bodies (subsection anchor, cast member name) are NOT yet mounted.
    expect(document.getElementById("world--premise")).toBeNull();
    expect(screen.queryByText("Marshal Vex")).not.toBeInTheDocument();
  });

  it("renders section labels as <h2> (heading hierarchy + .reference-section__label)", () => {
    const { container } = renderShell([worldSection]);
    const h2 = screen.getByRole("heading", { level: 2, name: /The world/ });
    expect(h2).toBeInTheDocument();
    // The label element keeps its styling hook for the existing CSS + queries.
    expect(container.querySelector(".reference-section__label")).not.toBeNull();
  });

  it("has exactly ONE element per section-{id} (the accordion item carries it)", () => {
    renderShell([worldSection, castSection, poiSection]);
    for (const id of ["section-world", "section-cast", "section-poi"]) {
      expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);
    }
  });

  it("does not create an accordion item for an unknown, node-less section", () => {
    const unknown = { id: "ledger", label: "Ledger" } as unknown as ReferenceSection;
    renderShell([worldSection, unknown]);
    // The renderable section has an item; the node-less unknown does not.
    expect(document.getElementById("section-world")).not.toBeNull();
    expect(document.getElementById("section-ledger")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /Ledger/ })).not.toBeInTheDocument();
  });
});

describe("ReferenceDocument — headless section bodies render under the accordion", () => {
  it("expanding a lore POI section reveals the headless POI body (no double chrome)", async () => {
    const user = userEvent.setup();
    const { container } = renderShell([poiSection]);
    await user.click(screen.getByRole("button", { name: /Points of Interest/i }));
    expect(await screen.findByText("The Long Foundry")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Long Foundry/i })).toBeInTheDocument();
    // No double chrome: the headless body emits no nested section-poi wrapper.
    expect(container.querySelectorAll("#section-poi")).toHaveLength(1);
  });

  it("expanding a generic dict section mounts its NodeTree subsection anchor", async () => {
    const user = userEvent.setup();
    renderShell([worldSection]);
    await user.click(screen.getByRole("button", { name: /The world/i }));
    expect(await screen.findByText(/p{150}/)).toBeInTheDocument();
    expect(document.getElementById("world--premise")).not.toBeNull();
  });
});

describe("ReferenceDocument — TOC navigation opens collapsed targets (2026-06-17)", () => {
  it("clicking a TOC section link opens that section (body becomes visible)", async () => {
    const user = userEvent.setup();
    renderShell([worldSection, castSection]);
    const toc = screen.getByRole("navigation", { name: "Contents" });
    // Before the click the Cast body is collapsed.
    expect(screen.queryByText("Marshal Vex")).not.toBeInTheDocument();
    await user.click(within(toc).getByRole("link", { name: "Cast" }));
    expect(await screen.findByText("Marshal Vex")).toBeInTheDocument();
  });

  it("clicking a TOC SRD chapter sub-link opens the section AND the nested chapter", async () => {
    const user = userEvent.setup();
    renderShell([rulesetSection], "rules");
    const toc = screen.getByRole("navigation", { name: "Contents" });
    // Collapsed: neither the chapter trigger nor its body is mounted yet.
    expect(screen.queryByText(/Skills measure what you can do/)).not.toBeInTheDocument();
    // The chapter sub-link lives under the section item in the TOC.
    await user.click(within(toc).getByRole("link", { name: "Skills" }));
    // Section opened → chapter accordion mounts; chapter opened → body visible.
    expect(await screen.findByText(/Skills measure what you can do/)).toBeInTheDocument();
  });
});

describe("ReferenceDocument shell WIRING (2026-06-09 redesign)", () => {
  it("renders masthead, TOC and sections together from one projection", async () => {
    const user = userEvent.setup();
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
    // The section item is anchored (always present).
    expect(document.getElementById("section-world")).not.toBeNull();
    // The subsection anchor mounts once the section is expanded.
    await user.click(screen.getByRole("button", { name: /The world/i }));
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
    // The section label still renders (as an h2 trigger).
    expect(screen.getByRole("heading", { level: 2, name: /The world/ })).toBeInTheDocument();
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
