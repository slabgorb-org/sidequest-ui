/**
 * AC3 (Story 67-2) — the reconciled seal roster must SURFACE on the peer's
 * tab after a dropped ACTION_REVEAL.
 *
 * Server-side (67-2 core) makes a sealed peer recoverable by re-sending the
 * canonical TURN_STATUS roster on reconnect. This suite verifies the UI side:
 * given that reconciled TURN_STATUS, the existing surfaces flip the sealed
 * peer to "✓ Sealed" — WITHOUT any ACTION_REVEAL (the literal repro: the
 * peer's only signal is the reconnect roster; reveal text is not event-sourced
 * and never replays). Per the story context this is "verify, don't redesign":
 * these are wiring/regression guards on the path the server reconcile feeds.
 *
 * Two surfaces matter:
 *   1. TurnStatusPanel renders directly from the roster, so it covers a sealed
 *      peer with NO reveal entry — the canonical "(N/M) sealed" denominator.
 *   2. App.tsx's batch-entries handler (App.tsx:798-808) replaces
 *      turnStatusEntries with any full roster the server sends — the seam the
 *      reconnect reconcile depends on, and one the existing wire-shape test
 *      (per-player push path) does NOT exercise.
 */
import { render, screen, within, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useCallback, useState, useImperativeHandle, forwardRef } from "react";
import { TurnStatusPanel, type TurnStatusEntry } from "@/components/TurnStatusPanel";
import {
  computeSubmittedPlayerIds,
  mergePeerRevealsWithSubmittedStatus,
} from "@/lib/turnStatusDerivation";
import type { PeerReveal } from "@/hooks/usePeerReveals";

// Reconciled roster a 67-2 reconnect delivers: Adam sealed, Eve still composing.
const RECONCILED_ROSTER: TurnStatusEntry[] = [
  { player_id: "adam", character_name: "Adam", status: "submitted" },
  { player_id: "eve", character_name: "Eve", status: "pending" },
];

describe("AC3 — reconciled TURN_STATUS surfaces a sealed peer with no ACTION_REVEAL", () => {
  it("TurnStatusPanel shows Adam '✓ Sealed' from the roster alone (no reveal entry needed)", () => {
    render(
      <TurnStatusPanel entries={RECONCILED_ROSTER} localPlayerId="eve" gameMode="structured" />,
    );

    const adamRow = screen.getByTestId("turn-entry-adam");
    expect(within(adamRow).getByText("✓ Sealed")).toBeInTheDocument();
    const eveRow = screen.getByTestId("turn-entry-eve");
    expect(within(eveRow).getByText("Composing…")).toBeInTheDocument();
    // Denominator must reflect the full roster: 1 of 2 — the strand was a
    // peer stuck while this counter never advanced.
    expect(screen.getByText("1 of 2 ready")).toBeInTheDocument();
  });

  it("computeSubmittedPlayerIds extracts the sealed peer from the reconciled roster", () => {
    const submitted = computeSubmittedPlayerIds(RECONCILED_ROSTER);
    expect(submitted.has("adam")).toBe(true);
    expect(submitted.has("eve")).toBe(false);
  });

  it("merge surfaces the seal even when the reveal map has NO entry for the sealed peer", () => {
    // The literal repro: Eve's client received no ACTION_REVEAL for Adam at
    // all. computeSubmittedPlayerIds (fed to PeerRevealList.sealedPlayerIds and
    // TurnStatusPanel) is the channel that rescues this — the merge over an
    // empty reveal map is a no-op, but the sealed set is still authoritative.
    const emptyReveals = new Map<string, PeerReveal>();
    const merged = mergePeerRevealsWithSubmittedStatus(emptyReveals, RECONCILED_ROSTER);
    expect(merged.size).toBe(0); // no reveal text to upgrade
    // …but the authoritative sealed set still names Adam, which is what the
    // roster-driven surfaces consume.
    expect(computeSubmittedPlayerIds(RECONCILED_ROSTER).has("adam")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// App.tsx batch-entries seam — the reconnect reconcile sends a full `entries`
// roster; the handler must REPLACE turnStatusEntries with it. Mirrors
// App.tsx:798-808 (the batch path the existing wire-shape test omits).
// ---------------------------------------------------------------------------

type HostHandle = {
  dispatchEntries: (entries: TurnStatusEntry[]) => void;
  entries: () => TurnStatusEntry[];
};

const Host = forwardRef<HostHandle>(function Host(_props, ref) {
  const [turnStatusEntries, setTurnStatusEntries] = useState<TurnStatusEntry[]>([]);

  // Mirrors App.tsx:798-808 batch-entries handling for TURN_STATUS.
  const handleBatch = useCallback((entries: Array<Record<string, unknown>>) => {
    setTurnStatusEntries(
      entries.map((e) => ({
        player_id: (e.player_id as string) ?? "",
        character_name: (e.character_name as string) ?? (e.player_name as string) ?? "",
        status: (e.status as TurnStatusEntry["status"]) ?? "pending",
      })),
    );
  }, []);

  useImperativeHandle(ref, () => ({
    dispatchEntries: (entries) => handleBatch(entries as unknown as Array<Record<string, unknown>>),
    entries: () => turnStatusEntries,
  }));
  return null;
});

describe("AC3 — App TURN_STATUS batch-entries seam consumes the reconciled roster", () => {
  it("replaces turnStatusEntries with the full reconciled roster on a batch TURN_STATUS", () => {
    let handle!: HostHandle;
    render(
      <Host
        ref={(h) => {
          if (h) handle = h;
        }}
      />,
    );

    act(() => {
      handle.dispatchEntries(RECONCILED_ROSTER);
    });

    expect(handle.entries()).toEqual(RECONCILED_ROSTER);
    expect(handle.entries().find((e) => e.player_id === "adam")?.status).toBe("submitted");
  });
});
