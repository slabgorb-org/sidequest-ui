/**
 * Story 118-2 (ADR-144 F3b): protocol + payload parity for the Fate spine (RED).
 *
 * The server (Story 118-1 / server #880) emits a FATE_STATE snapshot carrying a
 * rich FateStatePayload — the RELATIONSHIPS/QUESTS analog for Fate Core. The
 * client must (a) define MessageType.FATE_STATE so the mirror can route it, and
 * (b) mirror the rich payload shape EXACTLY so the panel can render every
 * mechanical number (the Sebastien/Jade legibility mandate — no thinning).
 *
 * Server source of truth: sidequest-server/sidequest/protocol/models.py
 *   FateSkillEntry(name, rating, ladder)
 *   FateAspectEntry(text, kind, free_invokes)
 *   FateStressBox(value, checked)
 *   FateConsequenceEntry(level, value, filled, text)
 *   FateCharacterEntry(name, fate_points, refresh, skills, aspects, stress, consequences)
 *   FateConflictParticipant(name, side)
 *   FateConflictEntry(active, participants)
 *   FateStatePayload(characters, scene_aspects, conflict)
 * built by sidequest-server/sidequest/game/ruleset/fate_projection.py:build_fate_state_payload.
 */
import { describe, it, expect } from "vitest";
import { MessageType } from "../protocol";
import type {
  FateStatePayload,
  FateCharacterEntry,
  FateSkillEntry,
  FateAspectEntry,
  FateStressBox,
  FateConsequenceEntry,
  FateConflictEntry,
  FateConflictParticipant,
} from "../payloads";

describe("Fate protocol completeness (Story 118-2)", () => {
  it("MessageType enum includes FATE_STATE", () => {
    // Value-level assertion: undefined at runtime until the enum entry lands → RED.
    expect(MessageType.FATE_STATE).toBe("FATE_STATE");
  });
});

describe("FateStatePayload mirrors the server shape exactly (no fabrication)", () => {
  it("carries per-PC sheets: fate points, refresh, skills, aspects, stress, consequences", () => {
    // Constructing this typed literal is the compile-time guard: if the dev
    // thinned any nested field, this fixture would not compile. At runtime it
    // asserts every rich field is present and addressable.
    const skill: FateSkillEntry = { name: "Investigate", rating: 4, ladder: "Great" };
    const aspect: FateAspectEntry = {
      text: "Hard-boiled detective with a soft heart",
      kind: "high_concept",
      free_invokes: 0,
    };
    const stressBox: FateStressBox = { value: 2, checked: true };
    const consequence: FateConsequenceEntry = {
      level: "mild",
      value: 2,
      filled: true,
      text: "Twisted ankle",
    };
    const character: FateCharacterEntry = {
      name: "Sam Spadework",
      fate_points: 3,
      refresh: 3,
      skills: [skill],
      aspects: [aspect],
      stress: { physical: [stressBox], mental: [] },
      consequences: [consequence],
    };
    const payload: FateStatePayload = {
      characters: [character],
      scene_aspects: [],
      conflict: null,
    };

    expect(payload.characters[0].fate_points).toBe(3);
    expect(payload.characters[0].refresh).toBe(3);
    expect(payload.characters[0].skills[0].rating).toBe(4);
    expect(payload.characters[0].skills[0].ladder).toBe("Great");
    expect(payload.characters[0].aspects[0].kind).toBe("high_concept");
    expect(payload.characters[0].aspects[0].free_invokes).toBe(0);
    expect(payload.characters[0].stress.physical[0].checked).toBe(true);
    expect(payload.characters[0].consequences[0].level).toBe("mild");
    expect(payload.characters[0].consequences[0].value).toBe(2);
    expect(payload.characters[0].consequences[0].filled).toBe(true);
  });

  it("permits a negative skill rung (Terrible -2) — the ladder is signed", () => {
    // The Fate ladder runs Terrible -2 .. Legendary +8; negative rungs are
    // valid. A thin shape that clamped to >=0 would lose this — guard it.
    const terrible: FateSkillEntry = { name: "Fight", rating: -2, ladder: "Terrible" };
    expect(terrible.rating).toBe(-2);
    expect(terrible.ladder).toBe("Terrible");
  });

  it("carries scene aspects (situation + boost) distinct from character aspects", () => {
    const situation: FateAspectEntry = {
      text: "Rain-slicked streets",
      kind: "situation",
      free_invokes: 0,
    };
    const boost: FateAspectEntry = { text: "Off balance", kind: "boost", free_invokes: 1 };
    const payload: FateStatePayload = {
      characters: [],
      scene_aspects: [situation, boost],
      conflict: null,
    };
    expect(payload.scene_aspects).toHaveLength(2);
    expect(payload.scene_aspects[1].kind).toBe("boost");
    expect(payload.scene_aspects[1].free_invokes).toBe(1);
  });

  it("carries the active conflict's participants by side", () => {
    const me: FateConflictParticipant = { name: "Sam Spadework", side: "player" };
    const them: FateConflictParticipant = { name: "The Fat Man", side: "opponent" };
    const conflict: FateConflictEntry = { active: true, participants: [me, them] };
    const payload: FateStatePayload = {
      characters: [],
      scene_aspects: [],
      conflict,
    };
    expect(payload.conflict?.active).toBe(true);
    expect(payload.conflict?.participants).toHaveLength(2);
    expect(payload.conflict?.participants[1].side).toBe("opponent");
  });

  it("permits a null conflict (no active conflict — clean empty-but-valid snapshot)", () => {
    const payload: FateStatePayload = {
      characters: [],
      scene_aspects: [],
      conflict: null,
    };
    expect(payload.conflict).toBeNull();
  });
});
