/**
 * Story 118-2 (ADR-144 F3b): FatePanel component tests (RED).
 *
 * THE mechanics-legibility surface for Sebastien/Jade (CLAUDE.md): the Fate
 * sheet made legible — per-PC fate points, aspects grouped by kind with
 * free-invoke pips, skills on the Fate ladder (label AND numeric), stress
 * tracks, and the four consequence slots (filled vs open). Read-only — no
 * fate-point spending, no aspect invocation (those land in later F3 stories).
 *
 * Structurally a sibling of QuestsPanel / RelationshipsPanel: a pure
 * presentational component taking a typed `data` prop, an empty-state branch
 * first, and theme-driven styling (genre CSS custom properties).
 *
 * Covered surfaces (all numbers must carry a label — the legibility mandate):
 *   - AC1: per-PC fate-point count rendered WITH a label (not a bare number)
 *   - AC2: aspects grouped by kind (high-concept/trouble/character/situation/
 *          boost/consequence) with free-invoke pips
 *   - AC3: skills on the ladder showing BOTH the rung label AND the numeric
 *          rating, including a negative rung (Terrible -2)
 *   - AC4: consequence slots (mild/moderate/severe/extreme) distinguishing
 *          filled vs open
 *   - stress tracks rendered (epic F3 lists stress boxes; payload carries them)
 *   - conflict participants by side rendered when a conflict is active
 *   - AC5: null/empty projection → clean empty state that does not throw
 *   - AC5: panel root is an ARIA region with an accessible name
 *   - version-skew tolerance: a sheet missing an optional array does not crash
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FatePanel } from "../FatePanel";
import type { FateStatePayload } from "../../types/payloads";

const seeded: FateStatePayload = {
  characters: [
    {
      name: "Sam Spadework",
      fate_points: 3,
      refresh: 3,
      skills: [
        { name: "Investigate", rating: 4, ladder: "Great" },
        { name: "Fight", rating: -2, ladder: "Terrible" },
        { name: "Rapport", rating: 1, ladder: "Average" },
      ],
      aspects: [
        {
          text: "Hard-boiled detective with a soft heart",
          kind: "high_concept",
          free_invokes: 0,
        },
        {
          text: "Can't say no to a dame in trouble",
          kind: "trouble",
          free_invokes: 1,
        },
        { text: "Old friend on the force", kind: "character", free_invokes: 0 },
      ],
      stress: {
        physical: [
          { value: 1, checked: false },
          { value: 2, checked: true },
          { value: 3, checked: false },
        ],
        mental: [
          { value: 1, checked: false },
          { value: 2, checked: false },
        ],
      },
      consequences: [
        { level: "mild", value: 2, filled: true, text: "Twisted ankle" },
        { level: "moderate", value: 4, filled: false, text: "" },
        { level: "severe", value: 6, filled: false, text: "" },
        { level: "extreme", value: 8, filled: false, text: "" },
      ],
    },
  ],
  scene_aspects: [
    { text: "Rain-slicked streets", kind: "situation", free_invokes: 0 },
    { text: "Off balance", kind: "boost", free_invokes: 1 },
  ],
  conflict: {
    active: true,
    participants: [
      { name: "Sam Spadework", side: "player" },
      { name: "The Fat Man", side: "opponent" },
    ],
  },
};

const emptyState: FateStatePayload = {
  characters: [],
  scene_aspects: [],
  conflict: null,
};

/** Find the `fate-skill` row that names a given skill. */
function skillRow(name: string): HTMLElement {
  const rows = screen.getAllByTestId("fate-skill");
  const row = rows.find((r) => within(r).queryByText(name));
  if (!row) throw new Error(`no fate-skill row for "${name}"`);
  return row;
}

/** Find the `fate-aspect` entry that carries a given aspect text. */
function aspectEntry(textFragment: RegExp): HTMLElement {
  const entries = screen.getAllByTestId("fate-aspect");
  const entry = entries.find((e) => within(e).queryByText(textFragment));
  if (!entry) throw new Error(`no fate-aspect entry matching ${textFragment}`);
  return entry;
}

describe("FatePanel — empty + accessibility (Story 118-2)", () => {
  it("renders a clean empty state and does not throw when data is null", () => {
    render(<FatePanel data={null} />);
    expect(screen.getByTestId("fate-empty")).toBeInTheDocument();
  });

  it("renders a clean empty state for a well-formed empty projection (no Fate-sheet PC)", () => {
    render(<FatePanel data={emptyState} />);
    expect(screen.getByTestId("fate-empty")).toBeInTheDocument();
    // No character block when there is no Fate-sheet PC.
    expect(screen.queryByTestId("fate-character")).not.toBeInTheDocument();
  });

  it("exposes the panel as an ARIA region with an accessible name (AC5)", () => {
    render(<FatePanel data={seeded} />);
    expect(
      screen.getByRole("region", { name: /fate/i }),
    ).toBeInTheDocument();
  });
});

describe("FatePanel — fate points (AC1, labeled)", () => {
  it("renders the per-PC fate-point count WITH a label, not a bare number", () => {
    render(<FatePanel data={seeded} />);
    const fp = screen.getByTestId("fate-points");
    // Legibility mandate: the number must carry a label so the player knows
    // what "3" means. Both the label and the value must be present.
    expect(fp).toHaveTextContent(/fate point/i);
    expect(fp).toHaveTextContent(/\b3\b/);
  });

  it("names the PC whose sheet is shown", () => {
    render(<FatePanel data={seeded} />);
    const block = screen.getByTestId("fate-character");
    expect(within(block).getByText(/sam spadework/i)).toBeInTheDocument();
  });
});

describe("FatePanel — skills on the ladder (AC3, label + numeric)", () => {
  it("shows a positive skill with BOTH its ladder name and numeric rating", () => {
    render(<FatePanel data={seeded} />);
    const row = skillRow("Investigate");
    expect(row).toHaveTextContent(/great/i);
    expect(row).toHaveTextContent(/4/);
  });

  it("shows a negative rung with the minus sign preserved (Terrible -2)", () => {
    // The ladder is signed; a negative rating must render its sign, not be
    // clamped or dropped. This is the Sebastien/Jade math-on-screen guarantee.
    render(<FatePanel data={seeded} />);
    const row = skillRow("Fight");
    expect(row).toHaveTextContent(/terrible/i);
    expect(row).toHaveTextContent(/-2/);
  });
});

describe("FatePanel — aspects grouped by kind with free-invoke pips (AC2)", () => {
  it("renders character aspects of every kind (high-concept / trouble / character)", () => {
    render(<FatePanel data={seeded} />);
    expect(
      screen.getByText(/hard-boiled detective with a soft heart/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/can't say no to a dame in trouble/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/old friend on the force/i)).toBeInTheDocument();
  });

  it("renders scene aspects (situation + boost) alongside character aspects", () => {
    render(<FatePanel data={seeded} />);
    expect(screen.getByText(/rain-slicked streets/i)).toBeInTheDocument();
    expect(screen.getByText(/off balance/i)).toBeInTheDocument();
  });

  it("labels the aspect kinds so the grouping is legible", () => {
    render(<FatePanel data={seeded} />);
    // The story enumerates the six kinds as the grouping axis — each kind that
    // has an aspect must surface its kind label somewhere in the panel.
    const panel = screen.getByTestId("fate-panel");
    expect(panel).toHaveTextContent(/high.?concept/i);
    expect(panel).toHaveTextContent(/trouble/i);
    expect(panel).toHaveTextContent(/character/i);
    expect(panel).toHaveTextContent(/situation/i);
    expect(panel).toHaveTextContent(/boost/i);
  });

  it("renders one free-invoke pip per available free invoke", () => {
    render(<FatePanel data={seeded} />);
    // The trouble aspect has one free invoke → exactly one pip.
    const trouble = aspectEntry(/can't say no to a dame/i);
    expect(within(trouble).getAllByTestId("fate-pip")).toHaveLength(1);
  });

  it("renders no pips for an aspect with zero free invokes", () => {
    render(<FatePanel data={seeded} />);
    const highConcept = aspectEntry(/hard-boiled detective/i);
    expect(within(highConcept).queryAllByTestId("fate-pip")).toHaveLength(0);
  });
});

describe("FatePanel — consequence slots (AC4, filled vs open)", () => {
  it("renders all four consequence slots (mild / moderate / severe / extreme)", () => {
    render(<FatePanel data={seeded} />);
    const slots = screen.getAllByTestId("fate-consequence");
    expect(slots).toHaveLength(4);
    const text = slots.map((s) => s.textContent ?? "").join(" ");
    expect(text).toMatch(/mild/i);
    expect(text).toMatch(/moderate/i);
    expect(text).toMatch(/severe/i);
    expect(text).toMatch(/extreme/i);
  });

  it("shows the absorption value for each slot (2 / 4 / 6 / 8)", () => {
    render(<FatePanel data={seeded} />);
    const text = screen
      .getAllByTestId("fate-consequence")
      .map((s) => s.textContent ?? "")
      .join(" ");
    expect(text).toMatch(/\b2\b/);
    expect(text).toMatch(/\b4\b/);
    expect(text).toMatch(/\b6\b/);
    expect(text).toMatch(/\b8\b/);
  });

  it("renders a FILLED consequence with its consequence text", () => {
    render(<FatePanel data={seeded} />);
    expect(screen.getByText(/twisted ankle/i)).toBeInTheDocument();
  });

  it("distinguishes a filled slot from an open one", () => {
    render(<FatePanel data={seeded} />);
    const slots = screen.getAllByTestId("fate-consequence");
    const mild = slots.find((s) => /mild/i.test(s.textContent ?? ""))!;
    const moderate = slots.find((s) => /moderate/i.test(s.textContent ?? ""))!;
    // The filled (mild) slot carries its aspect text; the open (moderate) slot
    // does not — the two must be visibly distinct.
    expect(mild).toHaveTextContent(/twisted ankle/i);
    expect(moderate).not.toHaveTextContent(/twisted ankle/i);
  });
});

describe("FatePanel — stress tracks", () => {
  it("renders a stress box per box on each track, marking checked vs unchecked", () => {
    render(<FatePanel data={seeded} />);
    // physical (3) + mental (2) = 5 boxes total.
    const boxes = screen.getAllByTestId("fate-stress-box");
    expect(boxes).toHaveLength(5);
    // The second physical box is checked — at least one box reflects that.
    const checked = boxes.filter(
      (b) => b.getAttribute("data-checked") === "true",
    );
    expect(checked).toHaveLength(1);
  });
});

describe("FatePanel — active conflict", () => {
  it("renders the conflict participants with their sides", () => {
    render(<FatePanel data={seeded} />);
    const conflict = screen.getByTestId("fate-conflict");
    expect(within(conflict).getByText(/the fat man/i)).toBeInTheDocument();
    // Sides must be legible (player vs opponent), not just a flat name list.
    expect(conflict).toHaveTextContent(/opponent/i);
    expect(conflict).toHaveTextContent(/player/i);
  });

  it("renders no conflict block when there is no active conflict", () => {
    const noConflict: FateStatePayload = { ...seeded, conflict: null };
    render(<FatePanel data={noConflict} />);
    expect(screen.queryByTestId("fate-conflict")).not.toBeInTheDocument();
  });
});

describe("FatePanel — version-skew tolerance (No-Silent-Fallbacks: tolerate, don't crash)", () => {
  it("does not throw when a sheet omits optional arrays", () => {
    // A pre-118-1 / serialization-skew sheet could omit aspects/skills/stress/
    // consequences. The panel must degrade gracefully — render the PC, skip the
    // missing sections, and never white-screen.
    const sparse = {
      characters: [
        { name: "Bare Sheet", fate_points: 1, refresh: 1 },
      ],
      scene_aspects: [],
      conflict: null,
    } as unknown as FateStatePayload;
    expect(() => render(<FatePanel data={sparse} />)).not.toThrow();
    expect(screen.getByText(/bare sheet/i)).toBeInTheDocument();
  });
});
