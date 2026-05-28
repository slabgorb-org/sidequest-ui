/**
 * ImageBusProvider — scrapbook-field enrichment tests.
 *
 * Story 33-17: the provider must surface optional scrapbook metadata fields
 * (turn_number, scene_name, scene_type, narrative_beat, chapter, location,
 * world_facts, npcs) when the IMAGE message payload carries them, and must
 * LEAVE THEM UNDEFINED when absent — per CLAUDE.md "no silent fallbacks".
 *
 * The server does not yet emit these fields (33-18 ships the bundled payload).
 * This test locks in the shape so that whenever the server starts emitting
 * them, the provider passes them through without code change.
 */
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import {
  ImageBusProvider,
  useImageBus,
  type GalleryImage,
} from "@/providers/ImageBusProvider";
import { MessageType, type GameMessage } from "@/types/protocol";

function renderBus(messages: GameMessage[]): GalleryImage[] {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ImageBusProvider messages={messages}>{children}</ImageBusProvider>
  );
  const { result } = renderHook(() => useImageBus(), { wrapper });
  return result.current;
}

function imageMessage(payload: Record<string, unknown>): GameMessage {
  return {
    type: MessageType.IMAGE,
    payload,
  } as GameMessage;
}

function scrapbookEntryMessage(payload: Record<string, unknown>): GameMessage {
  return {
    type: MessageType.SCRAPBOOK_ENTRY,
    payload,
  } as GameMessage;
}

describe("ImageBusProvider — scrapbook field passthrough", () => {
  it("extracts turn_number, scene_name, scene_type, narrative_beat, chapter, location when present", () => {
    const images = renderBus([
      imageMessage({
        url: "https://example.invalid/a.webp",
        render_id: "r-1",
        turn_number: 7,
        scene_name: "The Throat",
        scene_type: "establishing",
        narrative_beat: "Moss pulses faintly on the wall.",
        chapter: "Into the Dark",
        location: "Mawdeep Entrance",
      }),
    ]);
    expect(images).toHaveLength(1);
    const [entry] = images;
    expect(entry.turn_number).toBe(7);
    expect(entry.scene_name).toBe("The Throat");
    expect(entry.scene_type).toBe("establishing");
    expect(entry.narrative_beat).toBe("Moss pulses faintly on the wall.");
    expect(entry.chapter).toBe("Into the Dark");
    expect(entry.location).toBe("Mawdeep Entrance");
  });

  it("extracts world_facts array when present", () => {
    const images = renderBus([
      imageMessage({
        url: "https://example.invalid/a.webp",
        render_id: "r-1",
        world_facts: ["glowing moss", "rusted winch"],
      }),
    ]);
    expect(images[0].world_facts).toEqual(["glowing moss", "rusted winch"]);
  });

  it("extracts npcs array with name+role when present", () => {
    const images = renderBus([
      imageMessage({
        url: "https://example.invalid/a.webp",
        render_id: "r-1",
        npcs: [
          { name: "Grell", role: "hostile" },
          { name: "Aster", role: "friendly" },
        ],
      }),
    ]);
    expect(images[0].npcs).toEqual([
      { name: "Grell", role: "hostile" },
      { name: "Aster", role: "friendly" },
    ]);
  });

  it("leaves scrapbook fields undefined when payload omits them (no silent defaults)", () => {
    const images = renderBus([
      imageMessage({
        url: "https://example.invalid/a.webp",
        render_id: "r-1",
      }),
    ]);
    expect(images).toHaveLength(1);
    const [entry] = images;
    expect(entry.turn_number).toBeUndefined();
    expect(entry.scene_name).toBeUndefined();
    expect(entry.scene_type).toBeUndefined();
    expect(entry.narrative_beat).toBeUndefined();
    expect(entry.chapter).toBeUndefined();
    expect(entry.location).toBeUndefined();
    expect(entry.world_facts).toBeUndefined();
    expect(entry.npcs).toBeUndefined();
  });

  it("treats isHandout as strict boolean — non-boolean truthy values are rejected (rework 2026-04-15)", () => {
    // Rework driver: Reviewer flagged `isHandout: (payload.handout as boolean) ?? false`
    // as ineffective — the cast coerces before `??`, so a string "true" or the
    // number 1 is silently accepted as `isHandout=true`. After fix, only a
    // literal boolean true produces isHandout=true; everything else (strings,
    // numbers, undefined) produces false.
    const images = renderBus([
      imageMessage({
        url: "https://example.invalid/a.webp",
        render_id: "r-string-true",
        handout: "true", // deliberately malformed payload — verified loosely by Record<string, unknown>
      }),
      imageMessage({
        url: "https://example.invalid/b.webp",
        render_id: "r-number-one",
        handout: 1, // deliberately malformed payload
      }),
      imageMessage({
        url: "https://example.invalid/c.webp",
        render_id: "r-bool-true",
        handout: true,
      }),
      imageMessage({
        url: "https://example.invalid/d.webp",
        render_id: "r-absent",
      }),
    ]);
    // Order reversed inside provider — map by render_id for assertion clarity.
    const byId = Object.fromEntries(
      images.map((img) => [img.render_id, img]),
    );
    expect(byId["r-string-true"].isHandout).toBe(false);
    expect(byId["r-number-one"].isHandout).toBe(false);
    expect(byId["r-bool-true"].isHandout).toBe(true);
    expect(byId["r-absent"].isHandout).toBe(false);
  });

  it("preserves existing fields (url, render_id, timestamp, isHandout) alongside enrichment", () => {
    const images = renderBus([
      imageMessage({
        url: "https://example.invalid/a.webp",
        render_id: "r-1",
        handout: true,
        turn_number: 3,
      }),
    ]);
    const [entry] = images;
    expect(entry.url).toBe("https://example.invalid/a.webp");
    expect(entry.render_id).toBe("r-1");
    expect(entry.isHandout).toBe(true);
    expect(entry.turn_number).toBe(3);
  });
});

// ===========================================================================
// Story 33-18: SCRAPBOOK_ENTRY wire-level integration
//
// These tests exercise the server-authored bundled payload — the one that
// story 33-18 added on the Rust side. They verify three things the earlier
// 33-17 tests COULDN'T verify because the server didn't emit this message:
//
// 1. SCRAPBOOK_ENTRY alone (no matching IMAGE) produces a metadata-only
//    gallery card. This is the core 33-18 feature.
// 2. IMAGE + matching SCRAPBOOK_ENTRY by turn_id merges with the entry's
//    metadata winning over IMAGE payload fallbacks.
// 3. Malformed SCRAPBOOK_ENTRY (missing required fields) is dropped with
//    an explicit console.error — no silent fallbacks.
//
// This is the "every test suite needs a wiring test" integration that the
// 33-18 Architect reconcile forwarded here. It's the bare minimum proof
// that the server-emitted variant actually reaches the UI.
// ===========================================================================

describe("ImageBusProvider — SCRAPBOOK_ENTRY wiring (story 33-18)", () => {
  it("produces a metadata-only card when SCRAPBOOK_ENTRY arrives without a matching IMAGE", () => {
    const images = renderBus([
      scrapbookEntryMessage({
        turn_id: 5,
        location: "The Forge of Broken Oaths",
        narrative_excerpt: "The hammer rang once against cold iron.",
        scene_title: "Forge at Dusk",
        scene_type: "exploration",
        world_facts: [
          "The forge has been cold for six days.",
          "Ironhold's smith guild disbanded last winter.",
        ],
        npcs_present: [
          {
            name: "Toggler Copperjaw",
            role: "blacksmith",
            disposition: "gruff but fair",
          },
        ],
      }),
    ]);
    expect(images).toHaveLength(1);
    const [entry] = images;
    expect(entry.url).toBe("");
    expect(entry.turn_number).toBe(5);
    expect(entry.location).toBe("The Forge of Broken Oaths");
    expect(entry.scene_name).toBe("Forge at Dusk");
    expect(entry.scene_type).toBe("exploration");
    expect(entry.narrative_beat).toBe(
      "The hammer rang once against cold iron.",
    );
    expect(entry.world_facts).toEqual([
      "The forge has been cold for six days.",
      "Ironhold's smith guild disbanded last winter.",
    ]);
    expect(entry.npcs).toEqual([
      { name: "Toggler Copperjaw", role: "neutral" },
    ]);
  });

  it("merges SCRAPBOOK_ENTRY metadata onto a matching IMAGE by turn_id", () => {
    const images = renderBus([
      scrapbookEntryMessage({
        turn_id: 9,
        location: "Dustfall Crossing",
        narrative_excerpt: "Wind tore dust across the empty street.",
        scene_title: "Dust on the Crossing",
        scene_type: "exploration",
        world_facts: ["The last caravan left six days ago."],
        npcs_present: [],
      }),
      imageMessage({
        url: "https://example.invalid/turn-9.webp",
        render_id: "r-9",
        turn_number: 9,
        // IMAGE payload carries stale pre-33-18 fallbacks — scrapbook wins.
        scene_name: "IMAGE-SIDE STALE",
        location: "IMAGE-SIDE STALE",
      }),
    ]);
    // One merged gallery card — not one IMAGE card + one scrapbook card.
    expect(images).toHaveLength(1);
    const [entry] = images;
    expect(entry.url).toBe("https://example.invalid/turn-9.webp");
    expect(entry.turn_number).toBe(9);
    expect(entry.scene_name).toBe("Dust on the Crossing");
    expect(entry.location).toBe("Dustfall Crossing");
    expect(entry.narrative_beat).toBe(
      "Wind tore dust across the empty street.",
    );
    expect(entry.world_facts).toEqual([
      "The last caravan left six days ago.",
    ]);
  });

  it("SCRAPBOOK_ENTRY classifies hostile disposition keywords as hostile NPCs", () => {
    const images = renderBus([
      scrapbookEntryMessage({
        turn_id: 1,
        location: "Dead Man's Gulch",
        narrative_excerpt: "Three shadows rose from the mesa.",
        npcs_present: [
          {
            name: "The Sheriff",
            role: "lawman",
            disposition: "hostile and unyielding",
          },
          {
            name: "Silent Sam",
            role: "ally",
            disposition: "friendly observer",
          },
          {
            name: "Dust Owl",
            role: "witness",
            disposition: "watchful",
          },
        ],
      }),
    ]);
    const [entry] = images;
    expect(entry.npcs).toEqual([
      { name: "The Sheriff", role: "hostile" },
      { name: "Silent Sam", role: "friendly" },
      { name: "Dust Owl", role: "neutral" },
    ]);
  });

  // Story 65-6: world-scoped portrait_url threads through SCRAPBOOK_ENTRY →
  // legacy ScrapbookNpc so the gallery can render the thumbnail.
  it("SCRAPBOOK_ENTRY threads portrait_url through to the gallery npc", () => {
    const url =
      "https://cdn.slabgorb.com/genre_packs/pulp_noir/worlds/annees_folles/assets/portraits/marcel_devereaux.png";
    const images = renderBus([
      scrapbookEntryMessage({
        turn_id: 3,
        location: "Le Chat Noir",
        narrative_excerpt: "Marcel slid a glass across the bar.",
        npcs_present: [
          {
            name: "Marcel Devereaux",
            role: "bartender",
            disposition: "wary",
            portrait_url: url,
          },
          {
            name: "A nameless patron",
            role: "extra",
            disposition: "indifferent",
            // No portrait_url — ad-hoc NPC.
          },
        ],
      }),
    ]);
    const [entry] = images;
    expect(entry.npcs).toEqual([
      { name: "Marcel Devereaux", role: "neutral", portrait_url: url },
      { name: "A nameless patron", role: "neutral" },
    ]);
  });

  it("drops malformed SCRAPBOOK_ENTRY (missing narrative_excerpt) with console.error — no silent fallback", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const images = renderBus([
        scrapbookEntryMessage({
          turn_id: 1,
          location: "Nowhere",
          // narrative_excerpt missing — must drop the entry entirely
        }),
      ]);
      expect(images).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(
        "SCRAPBOOK_ENTRY dropped — missing required fields",
        expect.objectContaining({ turn_id: 1, location: "Nowhere" }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("drops malformed SCRAPBOOK_ENTRY (blank location) with console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const images = renderBus([
        scrapbookEntryMessage({
          turn_id: 1,
          location: "",
          narrative_excerpt: "A sentence.",
        }),
      ]);
      expect(images).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
