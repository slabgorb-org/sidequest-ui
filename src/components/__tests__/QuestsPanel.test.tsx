/**
 * Story 77-5 / ADR-137: QuestsPanel component tests (RED).
 *
 * The player-facing quest spine made legible: the quest_log (what am I doing),
 * the quest_anchors (where/when the objective resolves), and the active_stakes
 * (what's at risk right now). Structurally a sibling of RelationshipsPanel
 * (ADR-136): a pure presentational component taking a typed `data` prop, an
 * empty-state branch first, and theme-driven styling.
 *
 * Covered surfaces:
 *   - AC1: a populated projection renders a quest title, its objective/status,
 *          an anchor (id + resolution), and the active stakes text
 *   - AC1 (no fabrication): the rich nested shape (anchor.resolution,
 *          quest.anchor_id) renders — a thin Record<string,string> could not
 *          carry these, so this guards against the lossy-shape regression
 *   - AC2: null/empty projection → a clean empty state that does not throw
 *   - AC2 (seeded): a single creation-seeded quest+anchor+stakes renders exactly
 *   - AC5: the panel root is an ARIA region with an accessible name
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QuestsPanel } from "../QuestsPanel";
import type { QuestsPayload } from "../../types/payloads";

const seeded: QuestsPayload = {
  quest_log: [
    {
      quest_id: "q_home",
      title: "Find a way home",
      objective: "Reach the Emerald City and ask the Wizard",
      status: "active",
      anchor_id: "emerald_city",
      related_lore: [],
    },
  ],
  quest_anchors: [
    {
      anchor_id: "emerald_city",
      quest_id: "q_home",
      resolution: "Arrive at the Emerald City throne room",
    },
  ],
  active_stakes: "The cyclone could touch down again before nightfall",
};

const empty: QuestsPayload = {
  quest_log: [],
  quest_anchors: [],
  active_stakes: "",
};

describe("QuestsPanel (Story 77-5 / ADR-137)", () => {
  it("renders the quest title, objective, anchor and stakes from a populated projection", () => {
    render(<QuestsPanel data={seeded} />);
    // AC1 — quest_log
    expect(screen.getByText("Find a way home")).toBeInTheDocument();
    expect(
      screen.getByText(/reach the emerald city and ask the wizard/i),
    ).toBeInTheDocument();
    // AC1 — active_stakes
    expect(
      screen.getByText(/the cyclone could touch down again/i),
    ).toBeInTheDocument();
  });

  it("renders the rich anchor resolution (no thin Record<string,string> fabrication)", () => {
    render(<QuestsPanel data={seeded} />);
    // A lossy title->status map could never carry an anchor resolution string.
    expect(
      screen.getByText(/arrive at the emerald city throne room/i),
    ).toBeInTheDocument();
  });

  it("renders a clean empty state and does not throw when data is null", () => {
    render(<QuestsPanel data={null} />);
    expect(screen.getByTestId("quests-empty")).toBeInTheDocument();
    expect(screen.getByText(/no objective/i)).toBeInTheDocument();
  });

  it("renders a clean empty state for a well-formed empty projection (empty lists, empty stakes)", () => {
    render(<QuestsPanel data={empty} />);
    expect(screen.getByTestId("quests-empty")).toBeInTheDocument();
    // No quest rows when the spine is unpopulated.
    expect(screen.queryByText(/find a way home/i)).not.toBeInTheDocument();
  });

  it("exposes the panel as an ARIA region with an accessible name (AC5)", () => {
    render(<QuestsPanel data={seeded} />);
    expect(
      screen.getByRole("region", { name: /quest|objective/i }),
    ).toBeInTheDocument();
  });
});

// Review round-trip 1 (Reviewer REJECT, 2026-06-04). Hardening for the
// blocking findings: dangling-reference anchors must not be silently dropped
// (No-Silent-Fallbacks), and the orphan render branch needs coverage.
describe("QuestsPanel — anchor surfacing (rework: No-Silent-Fallbacks)", () => {
  it("renders an orphan anchor whose quest_id is null", () => {
    const data: QuestsPayload = {
      quest_log: [],
      quest_anchors: [
        { anchor_id: "free_anchor", quest_id: null, resolution: "Stand at the crossroads" },
      ],
      active_stakes: "",
    };
    render(<QuestsPanel data={data} />);
    const orphan = screen.getByTestId("quests-orphan-anchor");
    expect(orphan).toHaveTextContent(/free_anchor/);
    expect(orphan).toHaveTextContent(/stand at the crossroads/i);
  });

  it("surfaces a dangling-reference anchor whose owning quest is absent from the log", () => {
    // The anchor names a quest_id that does NOT appear in quest_log (a stale
    // anchor after a server-side quest prune, or a partial snapshot). It is
    // neither rendered inline (its quest row is absent) nor — pre-fix — caught
    // by the `!a.quest_id` orphan filter (its quest_id is truthy). It MUST still
    // be surfaced; silently dropping it violates No-Silent-Fallbacks and the
    // panel's own comment claims it is not dropped.
    const dangling: QuestsPayload = {
      quest_log: [
        {
          quest_id: "q_home",
          title: "Find a way home",
          objective: "Reach the Emerald City",
          status: "active",
          anchor_id: null,
          related_lore: [],
        },
      ],
      quest_anchors: [
        {
          anchor_id: "lost_anchor",
          quest_id: "q_deleted",
          resolution: "The vault opens at midnight",
        },
      ],
      active_stakes: "high",
    };
    render(<QuestsPanel data={dangling} />);
    expect(
      screen.getByText(/the vault opens at midnight/i),
    ).toBeInTheDocument();
  });
});

// Story 117-7: render the related_lore the server projects (117-5). The "what
// I've learned about this job" block coheres the discovered ScenarioClue facts
// under their owning quest — the visible payoff of the server-side projection.
// Without this block the coherence is on the wire but unseen (Keith's symptom:
// "knowledge has multiple references but nothing pulls them into a coherent
// picture"). Player-facing legibility per CLAUDE.md.
describe("QuestsPanel — related lore (Story 117-7)", () => {
  const withLore: QuestsPayload = {
    quest_log: [
      {
        quest_id: "q_detective",
        title: "Run the floor boss to ground",
        objective: "Find proof of the skim",
        status: "active",
        anchor_id: "back_office",
        related_lore: [
          {
            fact_id: "clue_ledger",
            content: "The floor boss keeps a second ledger in the back office.",
          },
          {
            fact_id: "clue_guard",
            content: "A guard takes a cut every Thursday.",
          },
        ],
      },
    ],
    quest_anchors: [
      { anchor_id: "back_office", quest_id: "q_detective", resolution: null },
    ],
    active_stakes: "The skim is escalating",
  };

  it("renders a 'what I've learned' lore block listing every related fragment", () => {
    render(<QuestsPanel data={withLore} />);
    const lore = screen.getByTestId("quests-lore");
    // The story names this block explicitly — its label must surface.
    expect(lore).toHaveTextContent(/what i've learned/i);
    // Every projected fragment's readable content must render, in full.
    expect(
      within(lore).getByText(
        /the floor boss keeps a second ledger in the back office\./i,
      ),
    ).toBeInTheDocument();
    expect(
      within(lore).getByText(/a guard takes a cut every thursday\./i),
    ).toBeInTheDocument();
  });

  it("renders the actual content string, not the fact_id (no thin-shape fabrication)", () => {
    // A lossy title->status Record could never carry the lore content. The
    // fact_id is an internal dedup key, NOT the player-facing text — it must
    // not be what is shown to the player.
    render(<QuestsPanel data={withLore} />);
    const lore = screen.getByTestId("quests-lore");
    expect(
      within(lore).getByText(/keeps a second ledger/i),
    ).toBeInTheDocument();
    expect(within(lore).queryByText("clue_ledger")).not.toBeInTheDocument();
  });

  it("renders no lore block for a quest with an empty related_lore list", () => {
    const noLore: QuestsPayload = {
      quest_log: [
        {
          quest_id: "q_fresh",
          title: "A brand-new lead",
          objective: "Ask around",
          status: "active",
          anchor_id: null,
          related_lore: [],
        },
      ],
      quest_anchors: [],
      active_stakes: "nothing yet",
    };
    render(<QuestsPanel data={noLore} />);
    // No dangling "What I've learned" header when there is nothing learned.
    expect(screen.queryByTestId("quests-lore")).not.toBeInTheDocument();
    expect(screen.queryByText(/what i've learned/i)).not.toBeInTheDocument();
  });

  it("scopes each quest's lore to its own entry (no cross-quest leakage)", () => {
    const twoQuests: QuestsPayload = {
      quest_log: [
        {
          quest_id: "q_detective",
          title: "Run the floor boss to ground",
          objective: "Find proof of the skim",
          status: "active",
          anchor_id: null,
          related_lore: [
            { fact_id: "f_ledger", content: "There is a second ledger." },
          ],
        },
        {
          quest_id: "q_escort",
          title: "Escort the witness",
          objective: "Get her to the safehouse",
          status: "active",
          anchor_id: null,
          related_lore: [],
        },
      ],
      quest_anchors: [],
      active_stakes: "high",
    };
    render(<QuestsPanel data={twoQuests} />);
    const entries = screen.getAllByTestId("quests-entry");
    expect(entries).toHaveLength(2);

    const detectiveEntry = entries.find((e) =>
      within(e).queryByText(/run the floor boss to ground/i),
    )!;
    const escortEntry = entries.find((e) =>
      within(e).queryByText(/escort the witness/i),
    )!;

    // The lore lives under the detective quest only.
    expect(
      within(detectiveEntry).getByText(/there is a second ledger\./i),
    ).toBeInTheDocument();
    // It must NOT appear under the escort quest (which learned nothing).
    expect(
      within(escortEntry).queryByText(/there is a second ledger\./i),
    ).not.toBeInTheDocument();
    expect(
      within(escortEntry).queryByTestId("quests-lore"),
    ).not.toBeInTheDocument();
  });

  it("renders both fragments even when their content is identical (stable per-fact keys)", () => {
    // Two distinct facts (different fact_id) can carry the same content. Keying
    // the lore list on content (or array index) would collapse or mis-render
    // them; keying on fact_id keeps both. Guards the React key={index}/key=content
    // anti-pattern (lang-review #6).
    const dupContent: QuestsPayload = {
      quest_log: [
        {
          quest_id: "q_detective",
          title: "Run the floor boss to ground",
          objective: "Find proof",
          status: "active",
          anchor_id: null,
          related_lore: [
            { fact_id: "f_a", content: "The vault opens at midnight." },
            { fact_id: "f_b", content: "The vault opens at midnight." },
          ],
        },
      ],
      quest_anchors: [],
      active_stakes: "high",
    };
    render(<QuestsPanel data={dupContent} />);
    const lore = screen.getByTestId("quests-lore");
    expect(
      within(lore).getAllByText(/the vault opens at midnight\./i),
    ).toHaveLength(2);
  });

  it("does not throw when a quest entry omits related_lore (version-skew wire payload)", () => {
    // The server always emits related_lore (never None), but an old/pre-117-5
    // server or a serialization skew could send a quest entry without it. The
    // panel must degrade gracefully — render the quest, render no lore block,
    // and never white-screen (No-Silent-Fallbacks: tolerate, don't crash).
    const legacyEntry = {
      quest_log: [
        {
          quest_id: "q_legacy",
          title: "An old save's quest",
          objective: "Carry on",
          status: "active",
          anchor_id: null,
          // related_lore intentionally absent
        },
      ],
      quest_anchors: [],
      active_stakes: "high",
    } as unknown as QuestsPayload;
    expect(() => render(<QuestsPanel data={legacyEntry} />)).not.toThrow();
    expect(screen.getByText(/an old save's quest/i)).toBeInTheDocument();
    expect(screen.queryByTestId("quests-lore")).not.toBeInTheDocument();
  });
});
