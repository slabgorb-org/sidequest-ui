import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfrontationOverlay } from "../ConfrontationOverlay";
import type {
  ConfrontationData,
  EncounterActor,
  EncounterMetric,
  BeatOption,
} from "../ConfrontationOverlay";
import type { DiceResultPayload } from "../../types/payloads";

// WN sealed-round beat lock (story 102-4 / coyote_star ship_combat deadlock,
// 2026-06-10): after the local player commits a Main Action the beat grid must
// go inert until the round resolves — a second click would hit the server's
// one-Main-Action-per-round guard and surface as a red error alert. The grid
// re-enables when the server's `committed_actors` empties (round walk cleared
// the seal ledger). This is the player-facing half of the deadlock fix.

const ACTORS: EncounterActor[] = [
  { name: "Chico", role: "pilot" },
  { name: "Wainu Moana-Teru", role: "crew" },
  { name: "Dark Contact", role: "raider" },
];

const PLAYER_METRIC: EncounterMetric = { name: "hull", current: 10, starting: 10, threshold: 0 };
const OPPONENT_METRIC: EncounterMetric = { name: "hull", current: 30, starting: 30, threshold: 0 };

const BEATS: BeatOption[] = [
  { id: "target_systems", label: "Target Systems", kind: "angle", base: 2, stat_check: "INT" },
  { id: "brace", label: "Brace", kind: "brace", base: 1, stat_check: "CON" },
];

const SHIP_COMBAT: ConfrontationData = {
  type: "ship_combat",
  label: "Dark Contact",
  category: "combat",
  actors: ACTORS,
  player_metric: PLAYER_METRIC,
  opponent_metric: OPPONENT_METRIC,
  beats: BEATS,
  secondary_stats: null,
  genre_slug: "space_opera",
  mood: "combat",
};

describe("ConfrontationOverlay — sealed-round beat lock", () => {
  it("disables the beat grid after the player commits, and ignores a second click", () => {
    const onBeatSelect = vi.fn();
    render(<ConfrontationOverlay data={SHIP_COMBAT} onBeatSelect={onBeatSelect} />);

    const grid = screen.getByTestId("beat-grid");
    expect(grid.getAttribute("data-sealed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: /Target Systems/i }));
    expect(onBeatSelect).toHaveBeenCalledTimes(1);
    expect(onBeatSelect).toHaveBeenCalledWith("target_systems");

    // Sealed now: grid inert, the waiting hint visible, the tiles disabled.
    expect(grid.getAttribute("data-sealed")).toBe("true");
    expect(screen.getByTestId("sealed-waiting-hint")).toBeInTheDocument();
    const tile = screen.getByRole("button", { name: /Brace/i });
    expect(tile).toBeDisabled();

    // A second click while sealed must NOT fire another commit (the server
    // would reject it as a double Main Action — the bug that surfaced as a red
    // error alert in the playtest).
    fireEvent.click(tile);
    fireEvent.click(screen.getByRole("button", { name: /Target Systems/i }));
    expect(onBeatSelect).toHaveBeenCalledTimes(1);
  });

  it("re-enables the grid when committed_actors empties (round resolved)", () => {
    const onBeatSelect = vi.fn();
    // Mid-round: the player is sealed and the server still lists them committed.
    const sealed: ConfrontationData = { ...SHIP_COMBAT, committed_actors: ["Chico"] };
    const { rerender } = render(
      <ConfrontationOverlay data={sealed} onBeatSelect={onBeatSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Target Systems/i }));
    expect(screen.getByTestId("beat-grid").getAttribute("data-sealed")).toBe("true");

    // Round resolves: the walk clears the seal ledger, so the next CONFRONTATION
    // frame drops committed_actors. The grid must come back live for the next round.
    const resolved: ConfrontationData = { ...SHIP_COMBAT, committed_actors: [] };
    rerender(<ConfrontationOverlay data={resolved} onBeatSelect={onBeatSelect} />);

    expect(screen.getByTestId("beat-grid").getAttribute("data-sealed")).toBe("false");
    expect(screen.queryByTestId("sealed-waiting-hint")).not.toBeInTheDocument();

    // And a fresh commit fires again.
    fireEvent.click(screen.getByRole("button", { name: /Brace/i }));
    expect(onBeatSelect).toHaveBeenCalledTimes(2);
  });

  // Non-WN path (#378 / beneath_sunden combat 2026-06-12): a plain `combat` /
  // dogfight confrontation NEVER carries `committed_actors`, so the WN
  // "committed_actors empties" re-enable can never fire — after one beat the
  // grid soft-locks forever (player can only act once per page load). The round
  // resolves synchronously server-side; the fresh dice resolution (a new
  // `diceResult.request_id`) is the "round reopened" signal that must re-arm the
  // grid when no WN seal is holding it.
  const COMBAT: ConfrontationData = {
    type: "combat",
    label: "Unknown Adversary",
    category: "combat",
    win_condition: "hp_depletion",
    actors: [
      { name: "Pipster", role: "combatant", side: "player" },
      { name: "Unknown Adversary", role: "combatant", side: "opponent" },
    ],
    player_metric: PLAYER_METRIC,
    opponent_metric: OPPONENT_METRIC,
    beats: BEATS,
    secondary_stats: null,
    genre_slug: "caverns_and_claudes",
    mood: "combat",
    // NOTE: no `committed_actors` — this is the non-WN path.
  };

  const diceResult = (requestId: string): DiceResultPayload => ({
    request_id: requestId,
    rolling_player_id: "Pipster",
    character_name: "Pipster",
    rolls: [],
    modifier: 0,
    total: 16,
    difficulty: 10,
    outcome: "CritSuccess",
    seed: 1,
    throw_params: { dice: "1d20", base: 0, stat_check: "INT" } as DiceResultPayload["throw_params"],
  });

  it("re-enables the grid on a fresh dice resolution when there is no WN seal (non-WN combat)", () => {
    const onBeatSelect = vi.fn();
    const { rerender } = render(
      <ConfrontationOverlay
        data={COMBAT}
        onBeatSelect={onBeatSelect}
        diceResult={null}
      />,
    );

    // Commit a beat → grid seals (blocks the double-commit the server rejects).
    fireEvent.click(screen.getByRole("button", { name: /Target Systems/i }));
    expect(onBeatSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("beat-grid").getAttribute("data-sealed")).toBe("true");

    // The throw resolves server-side and a fresh dice result arrives. With no
    // `committed_actors` holding a WN seal, that IS the round-reopened signal —
    // the grid must re-arm (today it stays dead forever: the soft-lock).
    rerender(
      <ConfrontationOverlay
        data={COMBAT}
        onBeatSelect={onBeatSelect}
        diceResult={diceResult("req-1")}
      />,
    );

    expect(screen.getByTestId("beat-grid").getAttribute("data-sealed")).toBe("false");
    expect(screen.queryByTestId("sealed-waiting-hint")).not.toBeInTheDocument();

    // The next beat commits — the player is no longer soft-locked.
    fireEvent.click(screen.getByRole("button", { name: /Brace/i }));
    expect(onBeatSelect).toHaveBeenCalledTimes(2);
  });

  it("keeps the grid sealed on a fresh dice resolution while a WN seal still holds (MP mid-round)", () => {
    const onBeatSelect = vi.fn();
    // WN multiplayer: the player rolled but the round still waits on other
    // actors — committed_actors is non-empty. The fresh dice result must NOT
    // re-arm the grid; only committed_actors emptying may.
    const sealed: ConfrontationData = { ...SHIP_COMBAT, committed_actors: ["Chico", "Harpo"] };
    const { rerender } = render(
      <ConfrontationOverlay
        data={sealed}
        onBeatSelect={onBeatSelect}
        diceResult={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Target Systems/i }));
    expect(screen.getByTestId("beat-grid").getAttribute("data-sealed")).toBe("true");

    rerender(
      <ConfrontationOverlay
        data={sealed}
        onBeatSelect={onBeatSelect}
        diceResult={diceResult("req-2")}
      />,
    );

    // Still waiting on the other actor — grid stays inert.
    expect(screen.getByTestId("beat-grid").getAttribute("data-sealed")).toBe("true");
  });
});
