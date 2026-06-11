import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfrontationOverlay } from "../ConfrontationOverlay";
import type {
  ConfrontationData,
  EncounterActor,
  EncounterMetric,
  BeatOption,
} from "../ConfrontationOverlay";

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
});
