/**
 * Tests for canonical-roster–aware turn status derivation.
 *
 * Pinned to the bug filings in sq-playtest 2026-05-12:
 *   - Host's banner stuck on "Waiting on Donut + 1 other to act" because
 *     `submittedPlayerIds = new Set(entries.map(e => e.player_id))`
 *     treated pending peers as already-submitted once the canonical
 *     roster carries them.
 *   - PeerRevealList row stuck on "X is composing" with X's submitted
 *     action text because ACTION_REVEAL late-fire raced past TURN_STATUS.
 */
import { describe, expect, it } from "vitest";
import type { TurnStatusEntry, ActionRevealEntry } from "@/types/payloads";
import {
  computeSubmittedPlayerIds,
  mergePeerRevealsWithSubmittedStatus,
} from "@/lib/turnStatusDerivation";

const entry = (
  player_id: string,
  character_name: string,
  status: TurnStatusEntry["status"],
): TurnStatusEntry => ({ player_id, character_name, status });

const reveal = (
  player_id: string,
  status: ActionRevealEntry["status"],
  action: string,
): ActionRevealEntry => ({
  player_id,
  character_name: player_id,
  status,
  action,
  aside: false,
  seq: 0,
  round: 1,
});

describe("computeSubmittedPlayerIds", () => {
  it("does NOT include pending peers from the canonical roster", () => {
    // Carl/Donut/Katia 3-PC mid-round, only Carl has sealed.
    const entries: TurnStatusEntry[] = [
      entry("Carl", "Carl", "submitted"),
      entry("Donut", "Donut", "pending"),
      entry("Katia", "Katia", "pending"),
    ];

    expect(computeSubmittedPlayerIds(entries)).toEqual(new Set(["Carl"]));
  });

  it("includes every submitted peer", () => {
    const entries: TurnStatusEntry[] = [
      entry("Carl", "Carl", "submitted"),
      entry("Donut", "Donut", "submitted"),
      entry("Katia", "Katia", "pending"),
    ];

    expect(computeSubmittedPlayerIds(entries)).toEqual(
      new Set(["Carl", "Donut"]),
    );
  });

  it("treats auto_resolved as submitted — barrier already advanced past them", () => {
    const entries: TurnStatusEntry[] = [
      entry("Carl", "Carl", "submitted"),
      entry("Donut", "Donut", "auto_resolved"),
    ];

    expect(computeSubmittedPlayerIds(entries)).toEqual(
      new Set(["Carl", "Donut"]),
    );
  });

  it("returns an empty set on an empty roster (round-resolved state)", () => {
    expect(computeSubmittedPlayerIds([])).toEqual(new Set());
  });
});

describe("mergePeerRevealsWithSubmittedStatus", () => {
  it("upgrades a composing reveal to submitted when TURN_STATUS authoritatively says submitted", () => {
    const reveals = new Map<string, ActionRevealEntry>([
      ["Donut", reveal("Donut", "composing", "I draw my sword")],
    ]);
    const entries: TurnStatusEntry[] = [
      entry("Donut", "Donut", "submitted"),
    ];

    const merged = mergePeerRevealsWithSubmittedStatus(reveals, entries);
    expect(merged.get("Donut")?.status).toBe("submitted");
    // Action text and other fields preserved — only status flips.
    expect(merged.get("Donut")?.action).toBe("I draw my sword");
  });

  it("leaves submitted reveals untouched", () => {
    const reveals = new Map<string, ActionRevealEntry>([
      ["Donut", reveal("Donut", "submitted", "I attack")],
    ]);
    const entries: TurnStatusEntry[] = [
      entry("Donut", "Donut", "submitted"),
    ];

    const merged = mergePeerRevealsWithSubmittedStatus(reveals, entries);
    expect(merged.get("Donut")?.status).toBe("submitted");
  });

  it("does NOT upgrade when TURN_STATUS still says pending — composing reveal is correct", () => {
    const reveals = new Map<string, ActionRevealEntry>([
      ["Donut", reveal("Donut", "composing", "I draw")],
    ]);
    const entries: TurnStatusEntry[] = [
      entry("Donut", "Donut", "pending"),
    ];

    const merged = mergePeerRevealsWithSubmittedStatus(reveals, entries);
    expect(merged.get("Donut")?.status).toBe("composing");
  });

  it("returns the same map reference when no overrides are needed (preserves useMemo stability)", () => {
    const reveals = new Map<string, ActionRevealEntry>([
      ["Donut", reveal("Donut", "submitted", "I attack")],
    ]);
    const entries: TurnStatusEntry[] = [
      entry("Donut", "Donut", "submitted"),
    ];

    const merged = mergePeerRevealsWithSubmittedStatus(reveals, entries);
    expect(merged).toBe(reveals);
  });

  it("returns the same map reference when entries is empty", () => {
    const reveals = new Map<string, ActionRevealEntry>([
      ["Donut", reveal("Donut", "composing", "I draw")],
    ]);

    const merged = mergePeerRevealsWithSubmittedStatus(reveals, []);
    expect(merged).toBe(reveals);
  });

  it("only mutates the entries that need upgrading", () => {
    const carlReveal = reveal("Carl", "submitted", "I cleave");
    const donutReveal = reveal("Donut", "composing", "I bless");
    const reveals = new Map<string, ActionRevealEntry>([
      ["Carl", carlReveal],
      ["Donut", donutReveal],
    ]);
    const entries: TurnStatusEntry[] = [
      entry("Carl", "Carl", "submitted"),
      entry("Donut", "Donut", "submitted"),
    ];

    const merged = mergePeerRevealsWithSubmittedStatus(reveals, entries);
    // Carl unchanged (was already submitted) — same object identity.
    expect(merged.get("Carl")).toBe(carlReveal);
    // Donut upgraded — new object.
    expect(merged.get("Donut")).not.toBe(donutReveal);
    expect(merged.get("Donut")?.status).toBe("submitted");
  });
});
