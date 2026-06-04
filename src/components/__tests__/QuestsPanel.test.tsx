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
import { render, screen } from "@testing-library/react";
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
