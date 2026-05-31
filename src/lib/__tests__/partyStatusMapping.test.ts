// Wiring test for the PARTY_STATUS → UI-type mappers extracted from App.tsx.
//
// These are the ONLY tests that prove the wire field `player_identity`
// (story 67-6) is carried through the production assembly. The CharacterPanel
// component tests render the suffix but feed fixtures that bypass App.tsx, so
// they cannot catch a missing field in the wire→sheet map. Per
// sidequest-ui/CLAUDE.md "Every Test Suite Needs a Wiring Test."

import { describe, it, expect } from "vitest";
import {
  toCharacterSummary,
  toCharacterSheetData,
} from "../partyStatusMapping";

// A representative PARTY_STATUS member (the raw wire object App.tsx maps).
function wireMember(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    player_id: "Sebastien",
    player_identity: "sebastien@example.com",
    name: "Sebastien",
    character_name: "Kael",
    current_hp: 24,
    max_hp: 30,
    class: "Ranger",
    level: 3,
    portrait_url: "/renders/kael.png",
    current_location: "The Rusty Cantina",
    statuses: ["poisoned"],
    sheet: {
      race: "Wood Elf",
      stats: { strength: 14, dexterity: 18 },
      abilities: [],
      class_moves: [],
      backstory: "Born in the Ashwood.",
    },
    ...overrides,
  };
}

describe("toCharacterSummary — roster wire mapping (story 67-6)", () => {
  it("carries player_identity through to CharacterSummary when present", () => {
    const summary = toCharacterSummary(wireMember());
    expect(summary.player_identity).toBe("sebastien@example.com");
    // Sibling fields still mapped (regression guard for the extraction).
    expect(summary.player_id).toBe("Sebastien");
    expect(summary.character_name).toBe("Kael");
    expect(summary.hp).toBe(24);
    expect(summary.hp_max).toBe(30);
  });

  it("leaves player_identity undefined when the wire field is absent", () => {
    const { player_identity: _omit, ...withoutIdentity } = wireMember();
    const summary = toCharacterSummary(withoutIdentity);
    expect(summary.player_identity).toBeUndefined();
  });

  it("leaves player_identity undefined when the wire field is empty string", () => {
    const summary = toCharacterSummary(wireMember({ player_identity: "" }));
    expect(summary.player_identity).toBeUndefined();
  });
});

describe("toCharacterSheetData — local-player sheet assembly (story 67-6)", () => {
  it("MP + player_identity present → CharacterSheetData.player_identity is set", () => {
    const raw = wireMember();
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, /* isMultiplayer */ true);
    expect(built.player_identity).toBe("sebastien@example.com");
    // player_id still carried (story 56-1 path intact).
    expect(built.player_id).toBe("Sebastien");
  });

  it("single-player → player_identity (and player_id) suppressed to undefined", () => {
    const raw = wireMember();
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, /* isMultiplayer */ false);
    expect(built.player_identity).toBeUndefined();
    expect(built.player_id).toBeUndefined();
  });

  it("MP but player_identity absent on the wire → player_identity undefined (no fabrication)", () => {
    const { player_identity: _omit, ...raw } = wireMember();
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, /* isMultiplayer */ true);
    expect(built.player_identity).toBeUndefined();
    // player_id still flows so the 56-1 fallback path remains live.
    expect(built.player_id).toBe("Sebastien");
  });

  it("preserves the rest of the sheet assembly (extraction regression guard)", () => {
    const raw = wireMember();
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, true);
    expect(built.name).toBe("Kael"); // character_name wins over name
    expect(built.class).toBe("Ranger");
    expect(built.race).toBe("Wood Elf");
    expect(built.level).toBe(3);
    expect(built.hp).toBe(24);
    expect(built.hp_max).toBe(30);
    expect(built.backstory).toBe("Born in the Ashwood.");
  });
});
