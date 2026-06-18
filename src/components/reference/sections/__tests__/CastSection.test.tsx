// Story 100-11 (Phase 3) — RED.
//
// Dedicated Cast section renderer. Consumes the server `cast` section shape from
// sidequest-server/sidequest/server/reference_projection.py::build_cast_section:
//
//   {
//     id: "cast",
//     label: "Cast",
//     members: [
//       { slug, name, role: string|null, appearance: string|null, portrait_url: string|null }
//     ]
//   }
//
// IMPORTANT contract facts pinned from the server:
//   - `portrait_url` IS nullable: the server resolves the R2 URL server-side
//     only when the portrait slug is on R2, otherwise it emits `null`. The
//     component must render the member (name still shown) WITHOUT emitting a
//     broken <img> (no img element, or no empty/`null` src) when portrait_url is
//     null. A member with no art is NOT dropped — only its image is.
//   - `role` and `appearance` are nullable — render without crashing and without
//     printing the literal "null".
//   - Portrait URLs are already resolved server-side; the component renders them
//     verbatim (no client-side key→URL resolution).
//
// a11y: every portrait image MUST carry alt text naming the cast member.
// Testing-Library output assertions only — no snapshots, no implementation
// coupling.
//
// Component under test (Dev creates in GREEN):
//   src/components/reference/sections/CastSection.tsx
//     → export function CastSection({ section }: { section: CastSectionData })
// Types (Dev creates in GREEN):
//   src/types/reference.ts → CastMember, CastSectionData

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CastSection } from "@/components/reference/sections/CastSection";
import type { CastSectionData } from "@/types/reference";

const fixture: CastSectionData = {
  id: "cast",
  label: "Cast",
  members: [
    {
      slug: "marshal-vex",
      name: "Marshal Vex",
      role: "Foundry-Marshal",
      appearance: "Soot-streaked plate, a hammer slung across her back.",
      portrait_url: "https://r2.example.com/heavy_metal/evropi/portraits/marshal-vex.png",
    },
    {
      // No portrait on R2 → server emits portrait_url: null. Member still shown.
      slug: "the-grey-cantor",
      name: "The Grey Cantor",
      role: null,
      appearance: null,
      portrait_url: null,
    },
  ],
};

describe("CastSection — dedicated Cast renderer (100-11)", () => {
  // NOTE (2026-06-17 shell-accordion refactor): the section label heading and the
  // `section-cast` deep-link anchor moved UP to the shell's section accordion
  // (ReferenceDocument); they are asserted there now (ReferenceShell.test.tsx).
  // This renderer is headless — it returns only the Cast body.

  it("renders every member's display name", () => {
    render(<CastSection section={fixture} />);
    expect(screen.getByText("Marshal Vex")).toBeInTheDocument();
    expect(screen.getByText("The Grey Cantor")).toBeInTheDocument();
  });

  it("renders a portrait image with alt text from the R2 URL (a11y)", () => {
    render(<CastSection section={fixture} />);
    const portrait = screen.getByRole("img", { name: /Marshal Vex/i });
    expect(portrait).toBeInTheDocument();
    expect(portrait).toHaveAttribute(
      "src",
      "https://r2.example.com/heavy_metal/evropi/portraits/marshal-vex.png",
    );
  });

  it("renders the role and appearance when present", () => {
    render(<CastSection section={fixture} />);
    expect(screen.getByText("Foundry-Marshal")).toBeInTheDocument();
    expect(
      screen.getByText("Soot-streaked plate, a hammer slung across her back."),
    ).toBeInTheDocument();
  });

  it("renders a member with null portrait_url WITHOUT a broken image", () => {
    render(<CastSection section={fixture} />);
    // The Grey Cantor has no portrait — name shows, but there must be exactly one
    // <img> in the whole section (Marshal Vex's), never a second img with an
    // empty/"null" src for the portrait-less member.
    expect(screen.getByText("The Grey Cantor")).toBeInTheDocument();
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    for (const img of images) {
      expect(img.getAttribute("src")).toBeTruthy();
      expect(img.getAttribute("src")).not.toBe("null");
    }
  });

  it("never leaks the literal 'null' for missing role/appearance", () => {
    render(<CastSection section={fixture} />);
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });
});

describe("CastSection — Folio placeholder (2026-06-09 redesign)", () => {
  it("renders the Folio initials placeholder for a portrait-less member", () => {
    const { container } = render(<CastSection section={fixture} />);
    // The Grey Cantor has portrait_url: null → a .ref-placeholder with the
    // member's initials keeps the card grid shape (aria-hidden; the name is
    // adjacent text).
    const placeholders = container.querySelectorAll(".ref-placeholder");
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toHaveTextContent("GC");
    expect(placeholders[0]).toHaveAttribute("aria-hidden", "true");
  });
  // The `section-cast` deep-link anchor moved to the shell accordion item
  // (2026-06-17) — asserted in ReferenceShell.test.tsx, not on the headless
  // renderer.
});
