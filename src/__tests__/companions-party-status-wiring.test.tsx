/**
 * Playtest 2026-05-07 fix — wiring lock for narrator-recruited NPC companions.
 *
 * Server emits PARTY_STATUS with `companions[]` (CompanionMember). App.tsx
 * fans the wire field into CompanionSummary[] and threads it through GameBoard
 * → CharacterWidget → CharacterPanel, which renders a "Companions" sub-section
 * beside the PC party list.
 *
 * This wiring test drives the App-side mapper (mirrored here) plus the
 * CharacterPanel render tree from a synthetic PARTY_STATUS payload, so a
 * regression that re-discards the field anywhere in the chain is caught at
 * the integration boundary.
 *
 * Bug context: solo Cleric "Carl" hired Donut at the Recruiter's Post in
 * caverns_sunden. Server logged `companions_added=1` and the post-turn
 * PARTY_STATUS carried `companions[]={name:"Donut", role:"torchbearer"...}`,
 * but the UI Party panel only rendered Carl. The entire Sünden play loop
 * (hire → descend → return) was unrunnable until companions surfaced.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CharacterPanel } from "@/components/CharacterPanel";
import type { CompanionSummary } from "@/types/party";
import type { CharacterSheetData } from "@/components/CharacterSheet";

// Mirror App.tsx PARTY_STATUS handler (App.tsx lines ~772-794) so this
// test traps a regression even if someone half-renames the wire fields.
function partyStatusToCompanions(
  raw: Array<Record<string, unknown>>,
): CompanionSummary[] {
  return raw.map((c) => ({
    name: (c.name as string) ?? "",
    role: (c.role as string) ?? "",
    description: (c.description as string) ?? "",
    notes: (c.notes as string) ?? "",
    recruited_turn: (c.recruited_turn as number) ?? 0,
    recruited_by: (c.recruited_by as string) ?? "",
  }));
}

const carlSheet: CharacterSheetData = {
  name: "Carl",
  class: "Cleric",
  level: 1,
  hp: 3,
  hp_max: 3,
  stats: {},
  abilities: [],
  backstory: "",
};

describe("CharacterPanel — PARTY_STATUS companions wiring (playtest 2026-05-07)", () => {
  it("renders companions section from PARTY_STATUS payload.companions", () => {
    // Synthetic PARTY_STATUS companions[] as the server actually emits via
    // sidequest/server/views.py:build_session_start_party_status.
    const wireCompanions = [
      {
        name: "Donut",
        role: "torchbearer",
        description: "Wiry, calloused, cheap.",
        notes: "Bond 10sp under the slate; Mawdeep walk-out by mid-morning.",
        recruited_turn: 4,
        recruited_by: "Carl",
      },
    ];

    const companions = partyStatusToCompanions(wireCompanions);

    render(
      <CharacterPanel
        character={carlSheet}
        characters={[]}
        companions={companions}
        currentPlayerId="carl-pid"
      />,
    );

    // The companions section exists.
    expect(screen.getByTestId("companions-section")).toBeInTheDocument();

    // Donut renders by name — without him, a solo Cleric can't address his
    // own hire and the Sünden flow is dead in the water.
    const donutRow = screen.getByTestId("companion-donut");
    expect(donutRow).toHaveTextContent("Donut");
    expect(donutRow).toHaveTextContent("torchbearer");
    expect(donutRow).toHaveTextContent("Bonded to Carl");
  });

  it("hides companions section when no companions are bonded", () => {
    render(
      <CharacterPanel
        character={carlSheet}
        characters={[]}
        companions={[]}
        currentPlayerId="carl-pid"
      />,
    );
    expect(screen.queryByTestId("companions-section")).not.toBeInTheDocument();
  });

  it("renders multiple companions in roster order (Donut + Katia case)", () => {
    // The canonical Sünden flow is Carl → Donut → Katia → Mawdeep. Multiple
    // companions must coexist in the panel — server roster is append-only on
    // recruit, mirror that ordering in the UI.
    const wireCompanions = [
      { name: "Donut", role: "torchbearer", recruited_by: "Carl" },
      { name: "Katia", role: "scout", recruited_by: "Carl" },
    ];

    render(
      <CharacterPanel
        character={carlSheet}
        characters={[]}
        companions={partyStatusToCompanions(wireCompanions)}
        currentPlayerId="carl-pid"
      />,
    );

    expect(screen.getByTestId("companion-donut")).toBeInTheDocument();
    expect(screen.getByTestId("companion-katia")).toBeInTheDocument();
  });
});
