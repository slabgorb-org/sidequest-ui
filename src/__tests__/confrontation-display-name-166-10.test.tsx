/**
 * RED — Story 166-10 (ADR-156 §6): the coal→diamond stage name.
 *
 * A generic, unnamed enemy ("the Scrapborn" — a `generics:` bestiary row, a stat
 * donor, not a person) is seated as the confrontation Other. The narrator's prose
 * then names it: "Ihnsch of the Rusted Works". The table reads
 *
 *     NARRATION:  "Ihnsch of the Rusted Works spits and raises the bar."
 *     PANEL:      [ the Scrapborn ]  HP 8/8
 *
 * One enemy, two names, both on screen.
 *
 * WHY THE FIX IS A NEW FIELD AND NOT A RENAME
 * -------------------------------------------
 * The server's first attempt repointed `EncounterActor.name` to the prose name,
 * and the enemy became **impossible to hit**: `name` is a load-bearing entity id,
 * not a label — the engine resolves the opponent's stat block by it, and this
 * file's own `humanizeActorName` docstring already says so ("that field is a
 * load-bearing entity id (tag targets / last_beat_impacts keys reference it) — so
 * we humanize for DISPLAY only and never rewrite the id").
 *
 * So the server now sends a SEPARATE `display_name` and leaves `name` canonical.
 * The overlay's job — pinned here — is to render `display_name ?? name` and to
 * keep using `name` as the id it always was. Two names, two surfaces.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// R3F + drei mocks — ConfrontationOverlay renders InlineDiceTray → DiceScene which calls useLoader.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
  useLoader: () => {
    const tex = { wrapS: 0, wrapT: 0, clone() { return { ...this, clone: this.clone }; } };
    return tex;
  },
}));
vi.mock("@react-three/rapier", () => ({
  Physics: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RigidBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CuboidCollider: () => null,
  ConvexHullCollider: () => null,
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import {
  ConfrontationOverlay,
  type ConfrontationData,
  type EncounterActor,
} from "@/components/ConfrontationOverlay";

/** The coal: the seat id the engine keys on. Never changes. */
const COAL = "the Scrapborn";
/** The diamond: the name the narrator's prose gave it. Display only. */
const PROSE = "Ihnsch of the Rusted Works";

function makeData(actors: EncounterActor[]): ConfrontationData {
  return {
    type: "combat",
    label: "Salt Camp Brawl",
    category: "combat",
    actors,
    player_metric: { name: "resolve", current: 0, starting: 0, threshold: 1000000 },
    opponent_metric: { name: "menace", current: 0, starting: 0, threshold: 1000000 },
    win_condition: "hp_depletion",
    player_hp: { current: 12, max: 12 },
    opponent_hp: { current: 8, max: 8 },
    beats: [
      { id: "swing", label: "Swing", kind: "strike", base: 4, stat_check: "STR", difficulty: 12 },
    ],
    secondary_stats: null,
    genre_slug: "mutant_wasteland",
    mood: "grim",
  } as ConfrontationData;
}

function renderOverlay(data: ConfrontationData) {
  return render(<ConfrontationOverlay data={data} playerId="player-1" />);
}

function themPanel() {
  return within(screen.getByTestId("confrontation-them-panel"));
}

describe("ConfrontationOverlay stage name (166-10)", () => {
  it("shows the narrator's prose name once the coal Other has been named", () => {
    renderOverlay(
      makeData([
        { name: "Magpie", role: "scavenger", side: "player" },
        { name: COAL, display_name: PROSE, role: "foe", side: "opponent" },
      ] as EncounterActor[]),
    );

    // The player must read the name the narration used — not the stat-donor placeholder.
    expect(themPanel().getByText(PROSE)).toBeInTheDocument();
    expect(themPanel().queryByText(/Scrapborn/)).not.toBeInTheDocument();
  });

  it("falls back to the seat id when the Other has not been named yet", () => {
    // The overwhelmingly common case: no promotion has happened, display_name is
    // absent, and the panel must look exactly as it always has. This is the
    // regression guard for every actor in every existing confrontation.
    renderOverlay(
      makeData([
        { name: "Magpie", role: "scavenger", side: "player" },
        { name: COAL, role: "foe", side: "opponent" },
      ] as EncounterActor[]),
    );

    expect(themPanel().getByText("The Scrapborn")).toBeInTheDocument();
  });

  it("humanizes a slug display_name the same way it humanizes a slug id", () => {
    // A narrator-invented name can arrive slugged; display_name goes through the
    // same DISPLAY transform as `name` ever did — it is not exempt from it.
    renderOverlay(
      makeData([
        { name: "unknown_dark_contact", display_name: "ihnsch_of_the_rusted_works", role: "foe", side: "opponent" },
      ] as EncounterActor[]),
    );

    expect(themPanel().getByText("Ihnsch Of The Rusted Works")).toBeInTheDocument();
  });

  it("draws the avatar initial from the prose name, not the seat id", () => {
    // THE FIFTH DISPLAY SITE. Round 2's assessment claimed "all four display sites"
    // and counted the four that called `actorDisplayName`. `ActorChip`'s no-portrait
    // fallback still reads the raw id:
    //
    //     ActorChip: actor.name.charAt(0).toUpperCase()
    //
    // A coal Other essentially never has a portrait — it is a `generics:` bestiary
    // row, a stat donor, and portraits are authored for named entities. So the
    // overwhelmingly common promoted case renders a chip reading "T" (from "the
    // Scrapborn") immediately beside a label reading "Ihnsch of the Rusted Works".
    // The coal name leaks out one character at a time, in the very component this
    // story fixed.
    renderOverlay(
      makeData([
        { name: "Magpie", role: "scavenger", side: "player" },
        { name: COAL, display_name: PROSE, role: "foe", side: "opponent" },
      ] as EncounterActor[]),
    );

    const initials = screen
      .getAllByTestId("actor-portrait")
      .filter((el) => el.getAttribute("data-has-portrait") === "false")
      .map((el) => el.textContent);

    // THREE chips, because `ActorChip` is mounted at two sites — the StatusLine
    // roster (player + foes) and the THEM panel (the foe again). So the coal initial
    // leaks TWICE per promoted Other, not once. Both flow through the same component,
    // so both are one fix.
    //
    // "Magpie" -> M (the player: unpromoted, correct either way).
    // the Other -> I (Ihnsch), NOT T (the Scrapborn). Twice.
    expect(initials).toEqual(["M", "I", "I"]);
  });
});
