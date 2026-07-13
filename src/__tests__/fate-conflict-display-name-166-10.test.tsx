/**
 * RED (rework round 3) — Story 166-10 (ADR-156 §6): the coal→diamond stage name on
 * the FATE conflict surface.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Round 2 of this story added `EncounterActor.display_name` (the stage name the
 * narrator's prose gives a generic Other) and wired it into `ConfrontationOverlay`.
 * That is the confrontation panel for the seven Without-Number packs.
 *
 * It is NOT the confrontation panel for the other four. `pulp_noir`,
 * `spaghetti_western`, `tea_and_murder` and `wry_whimsy` bind Fate (ADR-144), and
 * their panel is THIS component. The server-side promotion has no ruleset gate — it
 * fires for a Fate encounter exactly as it fires for a WN one, sets `display_name`,
 * and emits `green_room.actor_promoted` announcing that the player's panel now shows
 * the proper name.
 *
 * Then `fate_projection._project_conflict_participant` drops the field on the floor,
 * and this component renders the coal name anyway:
 *
 *     NARRATION:  "Ihnsch of the Rusted Works spits and raises the bar."
 *     PANEL:      Participants — the Scrapborn
 *                 Target ▾     [ the Scrapborn ]     <- the attack-target dropdown
 *                 Defend!       the Scrapborn attacks with Fight at total 4
 *
 * One enemy, two names, both on screen — this story's bug, verbatim, on 36% of the
 * live packs, in the widget the player clicks to choose who to attack. And the GM
 * panel's lie detector cheerfully reports the promotion worked.
 *
 * THE RULE THIS FILE PINS
 * -----------------------
 *     Every field the player READS shows `display_name ?? name`.
 *     Every field the engine RESOLVES BY stays the canonical seat id.
 *
 * That second half is not decoration. `<option value=...>` is sent back as
 * `FATE_THROW.target` and the server's `_resolve_attack` resolves the victim by it.
 * "Fixing" the display by renaming the id is how round 1 of this story shipped an
 * enemy that could not be hit. Every test below asserts BOTH halves.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// R3F + drei mocks — FateConflictSurface composes FateDiceTray → a dice scene.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
  useLoader: () => {
    const tex = {
      wrapS: 0,
      wrapT: 0,
      clone() {
        return { ...this, clone: this.clone };
      },
    };
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

import { FateConflictSurface } from "@/components/FateConflictSurface";
import type {
  FateConflictParticipant,
  FateDefendRequestPayload,
  FateExchangeLine,
  FateStatePayload,
} from "@/types/payloads";

/** The coal: the seat id. What the engine resolves the Other by, and what the
 *  attack-target dropdown must SEND. Never changes. */
const COAL = "the Scrapborn";
/** The diamond: the name the narrator's prose gave it. What the player must READ. */
const PROSE = "Ihnsch of the Rusted Works";
/** The local PC. */
const ME = "Magpie";

/** A promoted opponent: canonical seat id + the stage name, with a stress track so
 *  the opponent-track section and its win-meter actually render (a sheetless
 *  opponent draws neither — the honest empty state). */
function promotedOther(): FateConflictParticipant {
  return {
    name: COAL,
    display_name: PROSE,
    side: "opponent",
    committed: false,
    stress: { physical: [{ value: 1, checked: false }, { value: 2, checked: false }] },
    consequences: [],
  } as FateConflictParticipant;
}

function fateState(
  participants: FateConflictParticipant[],
  lastExchange: FateExchangeLine[] = [],
): FateStatePayload {
  return {
    characters: [
      {
        name: ME,
        fate_points: 3,
        refresh: 3,
        skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
        aspects: [],
        stress: { physical: [{ value: 1, checked: false }] },
        consequences: [],
        stunts: [],
      },
    ],
    scene_aspects: [],
    conflict: {
      active: true,
      participants,
      pending_compels: [],
      is_contest: false,
      last_exchange: lastExchange,
    },
  } as FateStatePayload;
}

function renderSurface(
  state: FateStatePayload,
  defendRequest: FateDefendRequestPayload | null = null,
) {
  return render(
    <FateConflictSurface
      fateState={state}
      fateRoll={null}
      ruleset="fate"
      actorName={ME}
      defendRequest={defendRequest}
    />,
  );
}

describe("FateConflictSurface stage name (166-10)", () => {
  it("shows the narrator's prose name in the participants roster", () => {
    // The roster is the Fate analog of the ConfrontationOverlay chip row. It must
    // name the enemy the way the narration names it.
    renderSurface(fateState([{ name: ME, side: "player" }, promotedOther()]));

    const row = screen.getByTestId(`fate-conflict-participant-${COAL}`);
    expect(within(row).getByText(PROSE)).toBeInTheDocument();
    expect(within(row).queryByText(/Scrapborn/)).not.toBeInTheDocument();
  });

  it("shows the prose name in the attack-target dropdown but still SENDS the seat id", () => {
    // The one the Reviewer caught, and the sharpest example of the whole rule: the
    // player reads the option, the server reads the value. They are different fields
    // and they must carry different things.
    //
    // Render the option text as the seat id -> the player picks a target under a name
    // the narration never used. Repoint the option VALUE to the prose name -> the
    // FATE_THROW carries a target `_resolve_attack` cannot resolve, and the attack
    // silently hits nothing. Round 1 of this story died on exactly that trade.
    renderSurface(fateState([{ name: ME, side: "player" }, promotedOther()]));

    const select = screen.getByTestId("fate-target-select");
    const option = within(select).getByRole("option") as HTMLOptionElement;

    expect(option).toHaveTextContent(PROSE);
    expect(option.value).toBe(COAL);
  });

  it("shows the prose name on the opponent's track heading and win meter", () => {
    // The ADR-143 taken-out meter — the mechanics-first legibility the project owes
    // Sebastien and Jade. A meter labelled with a name the prose never used is not
    // legible, it is a second enemy.
    renderSurface(fateState([{ name: ME, side: "player" }, promotedOther()]));

    const track = screen.getByTestId("fate-conflict-opponent-track");
    expect(within(track).getByText(PROSE)).toBeInTheDocument();
    // ...including for a screen reader. The sr-only label is the ONLY name a
    // non-sighted player (or the understudy playtest bot, which reads the page the
    // way a player does) gets for this meter.
    expect(
      within(track).getByLabelText(`${PROSE} taken-out progress`),
    ).toBeInTheDocument();
  });

  it("still keys the opponent track on the seat id", () => {
    // The id half. `data-opponent` is how the surface correlates a track back to a
    // participant; it must not follow the label.
    renderSurface(fateState([{ name: ME, side: "player" }, promotedOther()]));

    expect(screen.getByTestId("fate-conflict-opponent-track")).toHaveAttribute(
      "data-opponent",
      COAL,
    );
  });

  it("shows the prose name in the Defend! banner", () => {
    // The promoted Other swings at the player. This banner is the most urgent text on
    // the screen — the player has to decide how to defend RIGHT NOW — and it sits
    // directly beneath narration calling the attacker "Ihnsch of the Rusted Works".
    // Naming it "the Scrapborn" here is the story's bug at the worst possible moment.
    renderSurface(
      fateState([{ name: ME, side: "player" }, promotedOther()]),
      {
        request_id: "d1",
        defender: ME,
        attacker: COAL,
        attack_skill: "Fight",
        attack_total: 4,
        mental: false,
      } as FateDefendRequestPayload,
    );

    const tray = within(screen.getByTestId("fate-defend-tray"));
    expect(tray.getByText(PROSE)).toBeInTheDocument();
    expect(tray.queryByText(/Scrapborn/)).not.toBeInTheDocument();
  });

  it("shows the prose name in the Last Exchange ledger", () => {
    // The resolution ledger exists so the outcome does not depend on the narrator
    // surfacing it (FATE-CONFLICT-SEQUENCE-OPAQUE). A ledger that reports the math
    // under a different name than the prose used defeats its own purpose: the player
    // cannot tell which enemy the numbers belong to.
    renderSurface(
      fateState(
        [{ name: ME, side: "player" }, promotedOther()],
        [
          {
            actor: COAL,
            action: "attack",
            skill: "Fight",
            target: ME,
            actor_total: 4,
            opposition_total: 2,
            outcome: "absorbed",
          },
        ],
      ),
    );

    expect(screen.getByText(new RegExp(PROSE))).toBeInTheDocument();
    expect(screen.queryByText(/Scrapborn attacks/)).not.toBeInTheDocument();
  });

  it("falls back to the seat id for an Other the world has not named yet", () => {
    // THE REGRESSION GUARD, and the reason `display_name` is optional rather than
    // defaulted server-side: the overwhelmingly common case is an un-promoted Other,
    // and it must render exactly as it always has.
    renderSurface(
      fateState([
        { name: ME, side: "player" },
        { ...promotedOther(), display_name: undefined } as FateConflictParticipant,
      ]),
    );

    const row = screen.getByTestId(`fate-conflict-participant-${COAL}`);
    expect(within(row).getByText(/Scrapborn/)).toBeInTheDocument();
  });
});
