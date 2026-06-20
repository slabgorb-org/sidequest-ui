/**
 * Story 126-31 (RED) — render the OPPONENT stress/consequence track + a taken-out
 * WIN-METER in FateConflictSurface from the now-projected FATE_STATE.conflict data.
 *
 * Today the surface renders only the LOCAL PC's track (`fate-conflict-self-track`)
 * and explicitly punts the opponent track + win-meter to "a server follow-up"
 * (FateConflictSurface.tsx ~L377-382). That server follow-up has LANDED: the server
 * now projects an opponent-side participant's mechanical track onto the wire —
 *   protocol/models.py FateConflictParticipant.{stress, consequences}
 *   game/ruleset/fate_projection.py _project_conflict_participant  (reads core.fate_sheet)
 *   game/ruleset/fate_projection.py conflict_opponent_progress     (used/total → taken-out)
 *   websocket_handlers/fate_state_emit.py  ("fate.conflict.projected" span)
 * — but the CLIENT type `FateConflictParticipant` (payloads.ts) still models only
 * {name, side, committed?}, and the surface draws nothing for the Other.
 *
 * This file pins the player-facing legibility gap (DRIVER's single highest-impact):
 *   AC1  the UI type models opponent stress + consequences (reusing the PC-sheet shapes)
 *   AC2  an opponent with a populated track renders its stress boxes + consequences
 *   AC3  a taken-out win-meter renders, fill = used-absorption / total-capacity,
 *        flagged at-threshold when the next overflow hit would take the Other out
 *   AC4  a player-side participant and a sheetless opponent (capacity 0) draw NO meter
 *
 * Per ADR-143 the win signal is the opponent's STRESS+CONSEQUENCE FILL toward
 * taken-out — NEVER the vestigial native tension dial. The meter MIRRORS
 * ConfrontationOverlay's EdgeBar (data-at-threshold; fill width %; used/total text).
 *
 * R3F / drei / dice-lib are mocked exactly as the sibling FateConflictSurface tests
 * mock them (no WebGL in jsdom).
 *
 * Testid contract this RED phase defines for Dev (mirrors the self-track + EdgeBar):
 *   fate-conflict-opponent-track       — section per opponent w/ a populated track; data-opponent={name}
 *   fate-conflict-opponent-stress-box  — one per opponent stress box; data-checked "true"|"false"
 *   fate-conflict-opponent-consequence — one per opponent consequence; data-filled "true"|"false"
 *   fate-conflict-win-meter            — meter container; data-opponent={name}; data-at-threshold "true" when used>=capacity; visible "used/capacity" text
 *   fate-conflict-win-meter-fill       — the fill bar; inline width "{pct}%"
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type {
  FateCharacterEntry,
  FateConflictParticipant,
  FateConsequenceEntry,
  FateStatePayload,
  FateStressBox,
} from "@/types/payloads";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@local/dice-lib", () => ({
  DiceScene: () => <div data-testid="dice-scene" />,
  D6_RADIUS: 0.36,
  DEFAULT_DICE_THEME: { dieColor: "#4a1a3a", labelColor: "#d4af37" },
  replayThrowParams: () => ({
    position: [0, 0.86, 0],
    rotation: [0, 0, 0],
    linearVelocity: [0, 4, -1],
    angularVelocity: [0.5, 0.5, 0.5],
  }),
}));

import { FateConflictSurface } from "../FateConflictSurface";

// --- fixture builders -------------------------------------------------------

const box = (value: number, checked: boolean): FateStressBox => ({ value, checked });
const conseq = (
  level: string,
  value: number,
  filled: boolean,
  text = "",
): FateConsequenceEntry => ({ level, value, filled, text });

/** An OPPONENT-side participant carrying the server-projected mechanical track.
 *  Typed WITHOUT a cast on purpose: until `FateConflictParticipant` gains
 *  `stress`/`consequences` (AC1) this object literal does not typecheck — that
 *  failed `tsc` IS the AC1 RED signal. */
function opponent(
  name: string,
  stress: Record<string, FateStressBox[]>,
  consequences: FateConsequenceEntry[] = [],
): FateConflictParticipant {
  return { name, side: "opponent", committed: false, stress, consequences };
}

/** The local PC participant — empty mechanical track (the player's full sheet rides
 *  in `characters`, never duplicated onto the conflict participant). */
const SELF_PARTICIPANT: FateConflictParticipant = {
  name: "Sam Spadework",
  side: "player",
  committed: false,
  stress: {},
  consequences: [],
};

/** The local PC sheet — empty stress/consequences so the SELF track (which keys off
 *  `characters[me]`, not the participant) does not render and cannot collide with the
 *  opponent-track assertions. */
const ME: FateCharacterEntry = {
  name: "Sam Spadework",
  fate_points: 3,
  refresh: 3,
  skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
  aspects: [],
  stress: { physical: [], mental: [] },
  consequences: [],
};

function fateStateWith(
  participants: FateConflictParticipant[],
  characters: FateCharacterEntry[] = [ME],
): FateStatePayload {
  return {
    characters,
    scene_aspects: [],
    conflict: { active: true, participants },
  };
}

function renderSurface(
  fateState: FateStatePayload,
  props: Partial<React.ComponentProps<typeof FateConflictSurface>> = {},
) {
  return render(
    <FateConflictSurface
      fateState={fateState}
      fateRoll={null}
      ruleset="fate"
      actorName="Sam Spadework"
      onFateAction={vi.fn()}
      onFateThrow={vi.fn()}
      {...props}
    />,
  );
}

function trackFor(name: string): HTMLElement | undefined {
  return screen
    .queryAllByTestId("fate-conflict-opponent-track")
    .find((el) => el.getAttribute("data-opponent") === name);
}

function meterFor(name: string): HTMLElement | undefined {
  return screen
    .queryAllByTestId("fate-conflict-win-meter")
    .find((el) => el.getAttribute("data-opponent") === name);
}

// Capacity 12, used 3 → 25% (1 checked stress of 6 + 1 filled mild of 6).
const FAT_MAN = opponent(
  "The Fat Man",
  { physical: [box(1, true), box(2, false), box(3, false)] },
  [conseq("mild", 2, true, "Winded"), conseq("moderate", 4, false, "")],
);
// Capacity 5, used 5 → 100% (taken-out imminent).
const BRUTE = opponent(
  "The Brute",
  { physical: [box(1, true), box(2, true)] },
  [conseq("mild", 2, true, "Reeling")],
);
// Capacity 8, used 4 → 50%.
const HEAVY = opponent("The Heavy", {
  physical: [box(2, true), box(2, true), box(2, false), box(2, false)],
});
// No fate sheet → empty projected track → capacity 0.
const SHADE = opponent("The Shade", {}, []);

// --- AC2: opponent stress/consequence track --------------------------------

describe("FateConflictSurface — opponent track (Story 126-31, AC2)", () => {
  it("renders an opponent track section tagged with the opponent's name", () => {
    renderSurface(fateStateWith([SELF_PARTICIPANT, FAT_MAN]));
    const track = trackFor("The Fat Man");
    expect(track).toBeInTheDocument();
  });

  it("renders one stress box per projected box with the checked state reflected", () => {
    renderSurface(fateStateWith([SELF_PARTICIPANT, FAT_MAN]));
    const track = trackFor("The Fat Man")!;
    const boxes = within(track).getAllByTestId("fate-conflict-opponent-stress-box");
    expect(boxes).toHaveLength(3);
    expect(boxes.map((b) => b.getAttribute("data-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    // The box value is the legible absorption number (Sebastien/Jade mandate).
    expect(boxes.map((b) => b.textContent?.trim())).toEqual(["1", "2", "3"]);
  });

  it("renders the opponent's consequences with their filled state", () => {
    renderSurface(fateStateWith([SELF_PARTICIPANT, FAT_MAN]));
    const track = trackFor("The Fat Man")!;
    const cons = within(track).getAllByTestId("fate-conflict-opponent-consequence");
    expect(cons).toHaveLength(2);
    const byFilled = cons.map((c) => c.getAttribute("data-filled"));
    expect(byFilled).toEqual(["true", "false"]);
    // The taken consequence surfaces its text as an invokable aspect; the open one does not.
    expect(cons[0]).toHaveTextContent(/Winded/);
  });

  it("does not render an opponent track for the LOCAL PC's own sheet here", () => {
    // The self track is a separate surface (`fate-conflict-self-track`); the opponent
    // track must never duplicate it. ME has an empty sheet so neither should appear.
    renderSurface(fateStateWith([SELF_PARTICIPANT, FAT_MAN]));
    expect(trackFor("Sam Spadework")).toBeUndefined();
  });
});

// --- AC3: taken-out win-meter (mirror EdgeBar) ------------------------------

describe("FateConflictSurface — taken-out win-meter (Story 126-31, AC3)", () => {
  it("renders a win-meter whose fill = used-absorption / total-capacity", () => {
    renderSurface(fateStateWith([SELF_PARTICIPANT, FAT_MAN]));
    const meter = meterFor("The Fat Man")!;
    expect(meter).toBeInTheDocument();
    // used 3 / capacity 12 → 25%.
    const fill = within(meter).getByTestId("fate-conflict-win-meter-fill");
    expect(fill).toHaveStyle({ width: "25%" });
    // Legible ratio, mirroring EdgeBar's `current/threshold`.
    expect(meter).toHaveTextContent("3/12");
  });

  it("does NOT flag a partially-filled meter at threshold", () => {
    renderSurface(fateStateWith([SELF_PARTICIPANT, FAT_MAN]));
    expect(meterFor("The Fat Man")!).not.toHaveAttribute("data-at-threshold");
  });

  it("flags the meter at threshold when used absorption == total capacity (taken-out imminent)", () => {
    renderSurface(fateStateWith([SELF_PARTICIPANT, BRUTE]));
    const meter = meterFor("The Brute")!;
    expect(meter).toHaveAttribute("data-at-threshold", "true");
    const fill = within(meter).getByTestId("fate-conflict-win-meter-fill");
    expect(fill).toHaveStyle({ width: "100%" });
    expect(meter).toHaveTextContent("5/5");
  });

  it("draws an independent meter per opponent when several are seated (ADR-116)", () => {
    renderSurface(fateStateWith([SELF_PARTICIPANT, FAT_MAN, HEAVY]));
    const fatMan = meterFor("The Fat Man")!;
    const heavy = meterFor("The Heavy")!;
    expect(within(fatMan).getByTestId("fate-conflict-win-meter-fill")).toHaveStyle({
      width: "25%",
    });
    expect(within(heavy).getByTestId("fate-conflict-win-meter-fill")).toHaveStyle({
      width: "50%",
    });
    expect(heavy).toHaveTextContent("4/8");
  });
});

// --- AC4: empty / edge states ----------------------------------------------

describe("FateConflictSurface — empty + side-filter guards (Story 126-31, AC4)", () => {
  it("draws NO win-meter and NO track for a sheetless opponent (capacity 0)", () => {
    // The honest empty state — a 0/0 bar would imply the engine is engaged when the
    // Other has no projected sheet (the #966 seated-without-a-sheet case).
    renderSurface(fateStateWith([SELF_PARTICIPANT, SHADE]));
    expect(meterFor("The Shade")).toBeUndefined();
    expect(trackFor("The Shade")).toBeUndefined();
    expect(screen.queryByTestId("fate-conflict-win-meter")).not.toBeInTheDocument();
  });

  it("draws NO opponent meter for a PLAYER-side participant, even with a populated track", () => {
    // ADR-143/projection: the meter is an OPPONENT signal. A player-side participant
    // (its real sheet rides in `characters`) must never grow an opponent meter — the
    // render must filter on side, not merely on a non-empty track.
    const playerWithTrack: FateConflictParticipant = {
      name: "Sam Spadework",
      side: "player",
      committed: false,
      stress: { physical: [box(2, true), box(2, false)] },
      consequences: [],
    };
    renderSurface(fateStateWith([playerWithTrack]));
    expect(meterFor("Sam Spadework")).toBeUndefined();
    expect(trackFor("Sam Spadework")).toBeUndefined();
    expect(screen.queryByTestId("fate-conflict-win-meter")).not.toBeInTheDocument();
  });

  it("survives a legacy participant with the track fields omitted (?? not ||)", () => {
    // Back-compat: a pre-projection payload has no stress/consequences on the
    // participant. The surface must read them as `?? {}` / `?? []` (never `||`,
    // which would also swallow a real empty object) — no crash, no meter, no track.
    const legacyFoe: FateConflictParticipant = {
      name: "Old Foe",
      side: "opponent",
      committed: false,
    };
    expect(() => renderSurface(fateStateWith([SELF_PARTICIPANT, legacyFoe]))).not.toThrow();
    expect(meterFor("Old Foe")).toBeUndefined();
    expect(trackFor("Old Foe")).toBeUndefined();
  });
});

// --- AC1: UI type parity with the server projection -------------------------

describe("FateConflictParticipant type parity (Story 126-31, AC1)", () => {
  it("models an opponent's stress (by track) and consequences, reusing the PC-sheet shapes", () => {
    // Constructing this typed literal is the compile-time guard (mirrors
    // fate-protocol.test.ts): until FateConflictParticipant gains stress +
    // consequences this file does not typecheck. The runtime asserts confirm the
    // fields are present + addressable once the type lands.
    const participant: FateConflictParticipant = {
      name: "The Fat Man",
      side: "opponent",
      committed: false,
      stress: { physical: [{ value: 2, checked: true }] },
      consequences: [{ level: "mild", value: 2, filled: true, text: "Winded" }],
    };
    expect(participant.stress?.physical[0].checked).toBe(true);
    expect(participant.stress?.physical[0].value).toBe(2);
    expect(participant.consequences?.[0].filled).toBe(true);
    expect(participant.consequences?.[0].text).toBe("Winded");
  });

  it("permits an opponent participant with the track fields ABSENT (additive/back-compat)", () => {
    // Optional like `committed?` — a pre-projection payload omits them entirely.
    const legacy: FateConflictParticipant = { name: "Old Foe", side: "opponent" };
    expect(legacy.stress).toBeUndefined();
    expect(legacy.consequences).toBeUndefined();
  });
});
