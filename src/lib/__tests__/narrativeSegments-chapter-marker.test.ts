/**
 * Playtest 2026-04-11 regression — chapter markers must render ABOVE the
 * narration block they belong to.
 *
 * Background: Keith reported that the ◇◇◇ THE CRACKED PIT — SUBLEVEL ONE
 * chapter header was rendering BELOW the narration paragraphs that
 * described arriving in the new location. Visually it read "here's the
 * scene… and by the way we're now at: X" — backwards.
 *
 * Root cause: server emits `Narration` first (the narrator's output is
 * what determines the location shift), then emits `ChapterMarker` once
 * the location change has been detected (sidequest-server/dispatch/mod.rs:1360).
 * The arrival order is Narration → ChapterMarker, but the visual order
 * should be ChapterMarker → Narration. The client's buildSegments() was
 * appending in arrival order with no special handling.
 *
 * Fix (lib/narrativeSegments.ts CHAPTER_MARKER case): when a chapter
 * marker arrives, walk backwards through the segments-so-far to find the
 * start of the most recent narration block (contiguous tail of
 * text/separator/gallery-notice/render-pending/image/portrait-group
 * segments) and INSERT the marker at that boundary. The walk stops at
 * any "structural" segment that delimits the previous turn:
 * player-action, player-aside, system, error,
 * turn-status, or another chapter-marker.
 */
import { describe, it, expect } from "vitest";
import { buildSegments } from "../narrativeSegments";
import { MessageType, type GameMessage } from "@/types/protocol";

function playerAction(text: string): GameMessage {
  return {
    type: MessageType.PLAYER_ACTION,
    payload: { action: text },
    player_id: "p1",
  };
}

function narration(text: string): GameMessage {
  return {
    type: MessageType.NARRATION,
    payload: { text },
    player_id: "p1",
  };
}

function narrationEnd(): GameMessage {
  return {
    type: MessageType.NARRATION_END,
    payload: {},
    player_id: "p1",
  };
}

function chapterMarker(location: string): GameMessage {
  return {
    type: MessageType.CHAPTER_MARKER,
    payload: { location },
    player_id: "p1",
  };
}

function kindsOf(messages: GameMessage[]): string[] {
  return buildSegments(messages).map((s) => s.kind);
}

describe("buildSegments — chapter marker ordering (playtest 2026-04-11)", () => {
  it("inserts the chapter marker BEFORE the narration block that triggered it", () => {
    // Exact playtest scenario: player descends into a new sublevel.
    // Server message order: PLAYER_ACTION → NARRATION → NARRATION_END → CHAPTER_MARKER
    // Expected segment order: player-action → chapter-marker → text
    // (the chapter marker slides past the narration tail and lands BEFORE it.
    // Trailing separators are stripped by buildSegments at the end.)
    const messages: GameMessage[] = [
      playerAction("descend into the pit"),
      narration("The corridor opens onto a low chamber. A cracked screen flickers on a far wall."),
      narrationEnd(),
      chapterMarker("The Cracked Pit — Sublevel One"),
    ];

    const kinds = kindsOf(messages);
    expect(kinds).toEqual([
      "player-action",
      "chapter-marker",
      "text",
    ]);
  });

  it("preserves the chapter marker text (the location string)", () => {
    const messages: GameMessage[] = [
      playerAction("descend"),
      narration("You arrive."),
      chapterMarker("The Cracked Pit — Sublevel One"),
    ];

    const segments = buildSegments(messages);
    const marker = segments.find((s) => s.kind === "chapter-marker");
    expect(marker).toBeDefined();
    expect(marker!.text).toBe("The Cracked Pit — Sublevel One");
  });

  it("appends the chapter marker normally if no narration block precedes it", () => {
    // Edge case: chapter marker with no preceding narration. Should land
    // wherever the walk-back terminates — at the end of segments because
    // there's nothing to walk past.
    const messages: GameMessage[] = [chapterMarker("Starting Town")];
    expect(kindsOf(messages)).toEqual(["chapter-marker"]);
  });

  it("does not duplicate chapter markers for the same location across turns", () => {
    // The existing dedupe (`location !== lastChapterLocation`) must keep
    // working with the new insertion logic.
    const messages: GameMessage[] = [
      playerAction("look around"),
      narration("You see the tavern."),
      chapterMarker("The Salty Dog Tavern"),
      playerAction("order a drink"),
      narration("The barkeep nods."),
      // Same location — should NOT emit a second marker
      chapterMarker("The Salty Dog Tavern"),
    ];

    const markers = buildSegments(messages).filter((s) => s.kind === "chapter-marker");
    expect(markers).toHaveLength(1);
  });

  it("emits a NEW chapter marker when the location changes between turns", () => {
    const messages: GameMessage[] = [
      playerAction("look around"),
      narration("You see the tavern."),
      chapterMarker("The Salty Dog Tavern"),
      playerAction("step outside"),
      narration("The dockside opens up before you."),
      chapterMarker("Dockside Quarter"),
    ];

    const segments = buildSegments(messages);
    const markers = segments.filter((s) => s.kind === "chapter-marker");
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.text)).toEqual([
      "The Salty Dog Tavern",
      "Dockside Quarter",
    ]);
  });

  it("walks back past separators and gallery notices to find the narration block start", () => {
    // The narration block can include separators (from NARRATION_END) and
    // gallery notices (from IMAGE messages routed to gallery). The walk
    // back must skip ALL of these and land before the player-action that
    // started the turn.
    const messages: GameMessage[] = [
      playerAction("examine the chamber"),
      narration("The chamber hums."),
      narrationEnd(),
      // gallery-notice will be emitted by the IMAGE case (skipped here for
      // simplicity, but separator alone is enough to test the walk-back)
      chapterMarker("The Hum Chamber"),
    ];

    const kinds = kindsOf(messages);
    // The walk back should jump past `separator` and `text` to land
    // immediately after `player-action`.
    const playerIdx = kinds.indexOf("player-action");
    const markerIdx = kinds.indexOf("chapter-marker");
    expect(markerIdx).toBe(playerIdx + 1);
  });

  it("does NOT walk back past a previous chapter-marker", () => {
    // If we already have an earlier chapter-marker in the segments
    // (from a much-earlier turn), the new chapter-marker should land
    // AFTER the old one, not before — the old one belongs to its own
    // narration block.
    const messages: GameMessage[] = [
      playerAction("turn 1 action"),
      narration("Turn 1 narration."),
      chapterMarker("Old Place"),
      playerAction("turn 2 action"),
      narration("Turn 2 narration."),
      chapterMarker("New Place"),
    ];

    const segments = buildSegments(messages);
    const oldIdx = segments.findIndex(
      (s) => s.kind === "chapter-marker" && s.text === "Old Place",
    );
    const newIdx = segments.findIndex(
      (s) => s.kind === "chapter-marker" && s.text === "New Place",
    );
    expect(oldIdx).toBeGreaterThanOrEqual(0);
    expect(newIdx).toBeGreaterThan(oldIdx);
    // Specifically: new marker should be ABOVE its own narration (the
    // turn-2 text), not below it.
    const turn2TextIdx = segments.findIndex(
      (s) => s.kind === "text" && s.html?.includes("Turn 2 narration"),
    );
    expect(newIdx).toBeLessThan(turn2TextIdx);
  });
});
