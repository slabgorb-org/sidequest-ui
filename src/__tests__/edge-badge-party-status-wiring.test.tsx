/**
 * S2-BUG (playtest 2026-04-26) — wiring lock for ADR-014 / ADR-078 schema.
 *
 * Server emits PARTY_STATUS with `members[].current_hp` / `members[].max_hp`
 * (legacy wire field names — the values are the EdgePool, not HP). App.tsx
 * fans those into CharacterSummary.hp / hp_max, which the CharacterPanel
 * renders as the Edge badge in the header AND as the inline party-row Edge.
 *
 * This wiring test drives that whole pipeline through the React tree so that
 * a regression that re-introduces an "HP" label anywhere in the path is
 * caught at the integration boundary, not just in the component unit tests.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CharacterPanel } from "@/components/CharacterPanel";
import type { CharacterSummary } from "@/types/party";
import type { CharacterSheetData, AbilityDefinition } from "@/components/CharacterSheet";

// Mirror the App.tsx PARTY_STATUS handler shape (App.tsx:673-694) so that
// when this test wakes someone up two months from now, they can grep the
// app code and find the same field plumbing.
function partyStatusToSummary(
  m: Record<string, unknown>,
): CharacterSummary {
  return {
    player_id: (m.player_id as string) ?? "",
    name: (m.name as string) ?? "",
    character_name:
      (m.character_name as string) ?? (m.name as string) ?? "",
    hp: (m.current_hp as number) ?? 0,
    hp_max: (m.max_hp as number) ?? 0,
    status_effects: (m.statuses as string[]) ?? [],
    class: (m.class as string) ?? "",
    level: (m.level as number) ?? 1,
    portrait_url: (m.portrait_url as string) || undefined,
    current_location: (m.current_location as string) ?? "",
  };
}

function partyStatusToSheet(m: Record<string, unknown>): CharacterSheetData {
  const sheet = (m.sheet as Record<string, unknown>) ?? {};
  return {
    name: (m.character_name as string) ?? (m.name as string) ?? "",
    class: (m.class as string) ?? "",
    race: (sheet.race as string) || undefined,
    level: (m.level as number) ?? 1,
    hp:
      typeof m.current_hp === "number"
        ? (m.current_hp as number)
        : undefined,
    hp_max:
      typeof m.max_hp === "number" ? (m.max_hp as number) : undefined,
    stats: (sheet.stats as Record<string, number>) ?? {},
    abilities: (sheet.abilities as AbilityDefinition[]) ?? [],
    class_moves: (sheet.class_moves as string[]) ?? [],
    backstory: (sheet.backstory as string) ?? "",
    portrait_url: (m.portrait_url as string) || undefined,
    current_location: (m.current_location as string) ?? "",
  };
}

describe("CharacterPanel — PARTY_STATUS wiring (ADR-014 schema)", () => {
  it("renders Edge label end-to-end from a synthetic PARTY_STATUS payload", () => {
    // Synthetic PARTY_STATUS members payload as the server actually emits it
    // (sidequest/server/session_handler.py:_build_session_start_party_status).
    // current_hp / max_hp are pulled from character.core.edge.current/.max
    // — see ADR-014 / ADR-078.
    const members = [
      {
        player_id: "kael-pid",
        name: "KeithPlayer",
        character_name: "Kael",
        class: "Ranger",
        level: 3,
        current_hp: 18,
        max_hp: 30,
        statuses: ["wary"],
        sheet: {
          stats: { dexterity: 18 },
          abilities: ["Tracker"],
          backstory: "Born in the Ashwood.",
          race: "Wood Elf",
        },
      },
      {
        player_id: "lyra-pid",
        name: "JamesPlayer",
        character_name: "Lyra",
        class: "Cleric",
        level: 5,
        current_hp: 7,
        max_hp: 40,
        statuses: [],
      },
    ];

    const characters = members.map(partyStatusToSummary);
    const localSheet = partyStatusToSheet(members[0]);

    render(
      <CharacterPanel
        character={localSheet}
        characters={characters}
        currentPlayerId="kael-pid"
      />,
    );

    // Header badge: "Edge", not "HP".
    const badge = screen.getByTestId("character-edge-badge");
    expect(badge).toHaveTextContent("Edge 18/30");
    expect(screen.queryByTestId("character-hp-badge")).not.toBeInTheDocument();

    // Inline party rows: "Edge N/M", not "HP N/M".
    const kaelRow = screen.getByTestId("party-member-edge-kael-pid");
    expect(kaelRow).toHaveTextContent("Edge 18/30");
    const lyraRow = screen.getByTestId("party-member-edge-lyra-pid");
    expect(lyraRow).toHaveTextContent("Edge 7/40");
    // Lyra at 17.5% should hit the destructive threshold (≤25%).
    expect(lyraRow.className).toMatch(/destructive/);

    // Old testids must not exist anywhere — catches a half-rename.
    expect(
      screen.queryByTestId("party-member-hp-kael-pid"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("party-member-hp-lyra-pid"),
    ).not.toBeInTheDocument();

    // No "HP N/M" text appears anywhere in the panel.
    const panel = screen.getByTestId("character-panel");
    expect(panel.textContent ?? "").not.toMatch(/\bHP\s*\d+\s*\/\s*\d+/);
  });
});
