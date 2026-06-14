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
import type { CreationAnswer } from "@/types/payloads";

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

// ---------------------------------------------------------------------------
// Story 93-3: creation_answers provenance carried wire → sheet.
//
// 93-2 puts the durable per-scene chargen answers on the sheet facet
// (CharacterSheetDetails.creation_answers). The 93-3 History section reads
// CharacterSheetData.creation_answers — so toCharacterSheetData must thread
// sheetFacet.creation_answers through. These are the ONLY tests that prove the
// wire field survives the production wire→sheet map (the component tests feed
// fixtures that bypass App.tsx). Per sidequest-ui/CLAUDE.md "Every Test Suite
// Needs a Wiring Test."
// ---------------------------------------------------------------------------

const WIRE_CREATION_ANSWERS: CreationAnswer[] = [
  {
    scene_id: "origin_scene",
    prompt: "Where do you hail from?",
    kind: "freeform",
    value: "I crawled out of a suspension pod beneath the salt flats.",
    archetype_inferred: true,
  },
  {
    scene_id: "calling_scene",
    prompt: "What is your calling?",
    kind: "choice",
    value: "Wasteland Mechanic",
    archetype_inferred: false,
  },
];

describe("toCharacterSheetData — creation_answers provenance (story 93-3)", () => {
  it("carries creation_answers from the sheet facet into CharacterSheetData", () => {
    const raw = wireMember({
      sheet: {
        race: "Wood Elf",
        stats: {},
        abilities: [],
        class_moves: [],
        backstory: "Born in the Ashwood.",
        creation_answers: WIRE_CREATION_ANSWERS,
      },
    });
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, true);
    expect(built.creation_answers).toEqual(WIRE_CREATION_ANSWERS);
  });

  it("preserves the archetype_inferred flag per entry through the map (badge survives the boundary)", () => {
    const raw = wireMember({
      sheet: {
        stats: {},
        abilities: [],
        class_moves: [],
        backstory: "x",
        creation_answers: WIRE_CREATION_ANSWERS,
      },
    });
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, true);
    expect(built.creation_answers?.[0]?.archetype_inferred).toBe(true);
    expect(built.creation_answers?.[1]?.archetype_inferred).toBe(false);
  });

  it("carries creation_answers in single-player too — provenance is NOT identity-gated", () => {
    // Regression guard: creation_answers must not be suppressed behind the
    // isMultiplayer flag the way player_id / player_identity are. A solo
    // player's own chargen history is theirs to see.
    const raw = wireMember({
      sheet: {
        stats: {},
        abilities: [],
        class_moves: [],
        backstory: "x",
        creation_answers: WIRE_CREATION_ANSWERS,
      },
    });
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, /* isMultiplayer */ false);
    expect(built.creation_answers).toHaveLength(2);
  });

  it("yields an empty (falsy) creation_answers when the facet omits it — graceful legacy save, no fabrication", () => {
    // The legacy sheet facet (wireMember default) has no creation_answers; the
    // map must not invent any. AC-4 graceful path: the component then renders
    // no History section.
    const raw = wireMember();
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, true);
    expect(built.creation_answers ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ADR-143 Task 11: skills/foci carried wire → sheet.
//
// The server stamps WN-family skills + foci onto members[].sheet.skills /
// .foci (CharacterSheetDetails). The CharacterSheet Skills/Foci sections read
// CharacterSheetData.skills / .foci — so toCharacterSheetData must thread
// sheetFacet.skills / .foci through. These are the ONLY tests that prove the
// wire fields reach the production assembly (the component tests hand-construct
// `data={...}` and bypass this mapper). Per sidequest-ui/CLAUDE.md "Every Test
// Suite Needs a Wiring Test."
// ---------------------------------------------------------------------------

describe("toCharacterSheetData — skills/foci wiring (ADR-143 Task 11)", () => {
  it("carries skills from the sheet facet into CharacterSheetData", () => {
    const raw = wireMember({
      sheet: {
        race: "Human",
        stats: { strength: 14 },
        abilities: [],
        class_moves: [],
        backstory: "Born in the caverns.",
        skills: { Sneak: 1, Exert: 0 },
        foci: ["Die Hard"],
      },
    });
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, true);
    expect(built.skills).toEqual({ Sneak: 1, Exert: 0 });
  });

  it("carries foci (raw snake_case ids) from the sheet facet into CharacterSheetData", () => {
    // The server ships focus IDS raw (Character.foci holds ids). The mapper
    // threads them verbatim; the CharacterSheet title-cases them at render.
    const raw = wireMember({
      sheet: {
        race: "Human",
        stats: { strength: 14 },
        abilities: [],
        class_moves: [],
        backstory: "Born in the caverns.",
        skills: { Sneak: 1 },
        foci: ["die_hard", "night_warrior"],
      },
    });
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, true);
    expect(built.foci).toEqual(["die_hard", "night_warrior"]);
  });

  it("carries skills/foci in single-player too — the mechanical surface is NOT identity-gated", () => {
    const raw = wireMember({
      sheet: {
        race: "Human",
        stats: { strength: 14 },
        abilities: [],
        class_moves: [],
        backstory: "Born in the caverns.",
        skills: { Notice: 1 },
        foci: ["Wanderer"],
      },
    });
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, /* isMultiplayer */ false);
    expect(built.skills).toEqual({ Notice: 1 });
    expect(built.foci).toEqual(["Wanderer"]);
  });

  it("keeps non-WN empty skills/foci hidden — empty {} / [] survives so no section renders", () => {
    // The server sends skills: {} / foci: [] for non-WN characters. The
    // CharacterSheet renders the Skills/Foci sections only when non-empty, so
    // the mapper must pass an empty (falsy-for-rendering) value through — never
    // fabricate content for a non-WN pack.
    const raw = wireMember({
      sheet: {
        race: "Human",
        stats: { strength: 14 },
        abilities: [],
        class_moves: [],
        backstory: "Born in the caverns.",
        skills: {},
        foci: [],
      },
    });
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, true);
    expect(Object.keys(built.skills ?? {})).toHaveLength(0);
    expect(built.foci ?? []).toHaveLength(0);
  });

  it("yields undefined skills/foci when the facet omits them — graceful legacy save, no fabrication", () => {
    // The legacy sheet facet (wireMember default) carries no skills/foci; the
    // map must not invent any. The component then renders no Skills/Foci.
    const raw = wireMember();
    const sheetFacet = raw.sheet as Record<string, unknown>;
    const built = toCharacterSheetData(raw, sheetFacet, true);
    expect(built.skills).toBeUndefined();
    expect(built.foci).toBeUndefined();
  });
});
