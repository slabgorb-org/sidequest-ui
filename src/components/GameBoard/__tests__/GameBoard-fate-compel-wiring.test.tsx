/**
 * Story 118-5 (ADR-144 F3e) — compel control wiring.
 *
 * The mandatory wiring test, scoped to what it actually exercises: the
 * GameBoard -> FateConflictSurface path. It renders the REAL GameBoard, activates
 * the Fate Conflict tab on a Fate pack with a pending compel, clicks Accept, and
 * asserts the `onFateAction` callback GameBoard threads down to the surface fires
 * the compel verb. This proves GameBoard wires `onFateAction` through to the compel
 * control through the real component tree (not the surface in isolation).
 *
 * What this does NOT cover: the App -> GameBoard link. The test injects
 * `onFateAction` as a prop rather than mounting <App>, so the App.tsx:2727 ->
 * GameBoard.tsx:644 wiring (App passing handleFateAction down to GameBoard) is the
 * remaining untested seam — close it by mounting <App> if that link ever regresses.
 *
 * Behavioral, not source-grep: it drives the click through the real component tree
 * and asserts the callback.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { FateConflictEntry, FateStatePayload } from "@/types/payloads";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

type PendingCompel = { aspect: string; target: string; reason: string; offered_delta: number };
type ConflictWithCompels = FateConflictEntry & { pending_compels: PendingCompel[] };
type BoardOverrides = Partial<GameBoardProps> & { fateData?: FateStatePayload | null };

function fateWithCompel(): FateStatePayload {
  const conflict: ConflictWithCompels = {
    active: true,
    participants: [
      { name: "Sam Spadework", side: "player" },
      { name: "The Fat Man", side: "opponent" },
    ],
    pending_compels: [
      {
        aspect: "Cornered Rat",
        target: "Sam Spadework",
        reason: "The exits are blocked",
        offered_delta: 1,
      },
    ],
  };
  return {
    characters: [
      {
        name: "Sam Spadework",
        fate_points: 2,
        refresh: 3,
        skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
        aspects: [{ text: "Cornered Rat", kind: "trouble", free_invokes: 0 }],
        stress: { physical: [{ value: 1, checked: false }], mental: [] },
        consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
      },
    ],
    scene_aspects: [],
    conflict,
  };
}

function renderBoard(overrides: BoardOverrides = {}) {
  const onFateAction = vi.fn();
  const defaults: GameBoardProps = {
    messages: [],
    characters: [
      {
        player_id: "p1",
        name: "Sam",
        character_name: "Sam Spadework",
        class: "Sleuth",
        level: 1,
        hp: 10,
        hp_max: 10,
        status_effects: [],
        portrait_url: "",
        current_location: "",
      },
    ],
    onSend: vi.fn(),
    disabled: false,
    onFateAction,
  };
  const props = { ...defaults, ...overrides } as GameBoardProps;
  const utils = render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
  return { ...utils, onFateAction };
}

describe("GameBoard — compel control wiring (Story 118-5)", () => {
  it("routes a compel Accept click through GameBoard's onFateAction prop (production path)", () => {
    const { onFateAction } = renderBoard({ fateData: fateWithCompel() });

    // The Fate Conflict tab mounts only while a Fate conflict is active (the
    // ruleset gate). /fate conflict/i does not match the always-on "Fate" sheet tab.
    const tab = screen.queryByRole("tab", { name: /fate conflict/i });
    expect(tab, "the Fate Conflict tab must mount when a Fate conflict is active").toBeInTheDocument();
    fireEvent.click(tab!);

    fireEvent.click(screen.getByTestId("fate-compel-accept-Cornered Rat"));

    expect(onFateAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "compel_accept", aspect_text: "Cornered Rat" }),
    );
  });
});
