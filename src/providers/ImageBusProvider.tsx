import { createContext, useContext, useMemo, type ReactNode } from "react";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { ScrapbookEntryNpcRef } from "@/types/payloads";

export type NpcRole = "hostile" | "friendly" | "neutral";

export interface ScrapbookNpc {
  name: string;
  role: NpcRole;
  /**
   * World-scoped portrait URL (Story 65-6), present when the invoked NPC is in
   * the world's portrait_manifest. Undefined for ad-hoc NPCs — the gallery
   * renders a name-only chip in that case.
   */
  portrait_url?: string;
}

/**
 * Server-authored scrapbook entry keyed by turn_id — story 33-18.
 *
 * These arrive on SCRAPBOOK_ENTRY WebSocket messages after the narrator
 * finishes each turn. The gallery merges them with IMAGE messages by
 * turn_id in the reducer below; entries without a corresponding image
 * surface as metadata-only cards, and images without a corresponding
 * entry surface as bare cards (matching the pre-33-18 behavior).
 */
interface ScrapbookEntry {
  turn_id: number;
  scene_title?: string;
  scene_type?: string;
  location: string;
  image_url?: string;
  narrative_excerpt: string;
  world_facts: string[];
  npcs_present: ScrapbookEntryNpcRef[];
  // Story 45-30: render trigger policy outcome.
  // 'rendered' (policy fired and dispatch proceeded), 'skipped_policy'
  // (banter / no narrative weight), 'failed' (daemon refused).
  render_status?: "rendered" | "skipped_policy" | "failed";
}

export interface GalleryImage {
  url: string;
  alt?: string;
  caption?: string;
  render_id?: string;
  tier?: string;
  width?: number;
  height?: number;
  timestamp: number;
  isHandout: boolean;
  // Scrapbook metadata (story 33-17). Optional — server payloads without
  // these fields surface as `undefined` rather than defaults; ScrapbookGallery
  // degrades gracefully per the CLAUDE.md "no silent fallbacks" rule. The
  // bundled payload from 33-18 is the source once it ships; until then, only
  // fields the server already happens to emit will be present.
  turn_number?: number;
  scene_name?: string;
  scene_type?: string;
  narrative_beat?: string;
  chapter?: string;
  location?: string;
  world_facts?: string[];
  npcs?: ScrapbookNpc[];
  // Story 45-30: render trigger policy outcome — sourced from the
  // server's ScrapbookEntryPayload.render_status. 'rendered' means the
  // policy fired and dispatch proceeded (image may or may not have
  // arrived yet). 'skipped_policy' means a banter turn — the gallery
  // renders an eligible-but-skipped indicator. 'failed' means the
  // policy fired but the daemon refused — distinct failure indicator.
  render_status?: "rendered" | "skipped_policy" | "failed";
}

interface ImageBusContextValue {
  images: GalleryImage[];
}

const ImageBusContext = createContext<ImageBusContextValue>({ images: [] });

interface ImageBusProviderProps {
  messages: GameMessage[];
  children: ReactNode;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") out.push(entry);
  }
  return out.length > 0 ? out : undefined;
}

function readNpcArray(value: unknown): ScrapbookNpc[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ScrapbookNpc[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    const name = rec.name;
    const role = rec.role;
    if (typeof name !== "string") continue;
    if (role !== "hostile" && role !== "friendly" && role !== "neutral") continue;
    out.push({ name, role });
  }
  return out.length > 0 ? out : undefined;
}

function readScrapbookNpcRefs(value: unknown): ScrapbookEntryNpcRef[] {
  if (!Array.isArray(value)) return [];
  const out: ScrapbookEntryNpcRef[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    const name = rec.name;
    const role = rec.role;
    const disposition = rec.disposition;
    if (typeof name !== "string" || typeof role !== "string") continue;
    // Story 65-6: world-scoped portrait URL, present only for manifest NPCs.
    const portraitUrl =
      typeof rec.portrait_url === "string" ? rec.portrait_url : undefined;
    out.push({
      name,
      role,
      disposition: typeof disposition === "string" ? disposition : role,
      portrait_url: portraitUrl,
    });
  }
  return out;
}

/**
 * Project a `SCRAPBOOK_ENTRY` payload into the richer typed form the
 * gallery merges with images. Rejects payloads missing required fields
 * (turn_id, location, narrative_excerpt) with an explicit drop — follows
 * the CLAUDE.md no-silent-fallbacks rule: a malformed entry from the
 * server is a schema drift bug, not something to paper over.
 */
function parseScrapbookEntry(payload: Record<string, unknown>): ScrapbookEntry | null {
  const turnId =
    typeof payload.turn_id === "number" ? payload.turn_id : undefined;
  const location = payload.location;
  const excerpt = payload.narrative_excerpt;
  if (
    typeof turnId !== "number" ||
    typeof location !== "string" ||
    location.length === 0 ||
    typeof excerpt !== "string" ||
    excerpt.length === 0
  ) {
    console.error("SCRAPBOOK_ENTRY dropped — missing required fields", payload);
    return null;
  }
  const sceneTitle =
    typeof payload.scene_title === "string" ? payload.scene_title : undefined;
  const sceneType =
    typeof payload.scene_type === "string" ? payload.scene_type : undefined;
  const imageUrl =
    typeof payload.image_url === "string" ? payload.image_url : undefined;
  const worldFacts = readStringArray(payload.world_facts) ?? [];
  const npcsPresent = readScrapbookNpcRefs(payload.npcs_present);
  // Story 45-30: render trigger policy outcome. Three known values; any
  // other string drops to undefined so the gallery falls back to legacy
  // hasImage-only branching (no silent assumptions about new states).
  const rs = payload.render_status;
  const renderStatus: ScrapbookEntry["render_status"] =
    rs === "rendered" || rs === "skipped_policy" || rs === "failed"
      ? rs
      : undefined;
  return {
    turn_id: turnId,
    scene_title: sceneTitle,
    scene_type: sceneType,
    location,
    image_url: imageUrl,
    narrative_excerpt: excerpt,
    world_facts: worldFacts,
    npcs_present: npcsPresent,
    render_status: renderStatus,
  };
}

/**
 * Project `ScrapbookEntryNpcRef` rows into the legacy `ScrapbookNpc` shape
 * the gallery widget expects. The server's `disposition` is a behavioral
 * string (e.g. "gruff but fair") — we map it to the coarse role bucket the
 * UI uses today. Anything that isn't obviously hostile stays neutral; a
 * followup UI refresh can render the full disposition string directly.
 */
function projectNpcRefsToLegacy(refs: ScrapbookEntryNpcRef[]): ScrapbookNpc[] {
  const out: ScrapbookNpc[] = [];
  for (const ref of refs) {
    const lowered = ref.disposition.toLowerCase();
    const role: NpcRole =
      lowered.includes("hostile") || lowered.includes("enemy") || lowered.includes("foe")
        ? "hostile"
        : lowered.includes("friend") || lowered.includes("ally")
          ? "friendly"
          : "neutral";
    // Story 65-6: carry the world-scoped portrait URL through to the gallery.
    out.push({
      name: ref.name,
      role,
      portrait_url: ref.portrait_url ?? undefined,
    });
  }
  return out;
}

export function ImageBusProvider({ messages, children }: ImageBusProviderProps) {
  const images = useMemo(() => {
    // Pass 1: collect scrapbook entries keyed by turn_id. The entry carries
    // the metadata the widget cares about; the later image merge overlays
    // the URL when the async render lands.
    const scrapbookByTurn = new Map<number, ScrapbookEntry>();
    for (const msg of messages) {
      if (msg.type !== MessageType.SCRAPBOOK_ENTRY) continue;
      const entry = parseScrapbookEntry(msg.payload as Record<string, unknown>);
      if (entry) scrapbookByTurn.set(entry.turn_id, entry);
    }

    const result: GalleryImage[] = [];
    const seenRenderIds = new Set<string>();
    const matchedTurnIds = new Set<number>();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.type !== MessageType.IMAGE) continue;

      const payload = msg.payload as Record<string, unknown>;
      const url = payload.url as string | undefined;
      if (!url) continue; // Skip placeholder entries with no URL

      const renderId = payload.render_id as string | undefined;
      if (renderId) {
        if (seenRenderIds.has(renderId)) continue;
        seenRenderIds.add(renderId);
      }

      const turnNumber =
        typeof payload.turn_number === "number" ? payload.turn_number : undefined;

      // Merge scrapbook entry metadata when one exists for this turn. The
      // IMAGE payload still carries fallbacks for pre-33-18 servers; the
      // scrapbook entry wins when present.
      const entry =
        typeof turnNumber === "number" ? scrapbookByTurn.get(turnNumber) : undefined;
      if (entry) matchedTurnIds.add(entry.turn_id);

      result.push({
        url,
        alt: (payload.alt ?? payload.description) as string | undefined,
        caption: (payload.caption ?? payload.description) as string | undefined,
        render_id: renderId,
        tier: payload.tier as string | undefined,
        width: payload.width as number | undefined,
        height: payload.height as number | undefined,
        timestamp: i,
        isHandout: payload.handout === true,
        turn_number: turnNumber,
        scene_name:
          entry?.scene_title ??
          (typeof payload.scene_name === "string" ? payload.scene_name : undefined),
        scene_type:
          entry?.scene_type ??
          (typeof payload.scene_type === "string" ? payload.scene_type : undefined),
        narrative_beat:
          entry?.narrative_excerpt ??
          (typeof payload.narrative_beat === "string"
            ? payload.narrative_beat
            : undefined),
        chapter: typeof payload.chapter === "string" ? payload.chapter : undefined,
        location:
          entry?.location ??
          (typeof payload.location === "string" ? payload.location : undefined),
        world_facts:
          entry && entry.world_facts.length > 0
            ? entry.world_facts
            : readStringArray(payload.world_facts),
        npcs:
          entry && entry.npcs_present.length > 0
            ? projectNpcRefsToLegacy(entry.npcs_present)
            : readNpcArray(payload.npcs),
        render_status: entry?.render_status,
      });
    }

    // Pass 2: scrapbook entries without a matching image still deserve a
    // gallery card — they are the entire point of 33-18 (turn metadata
    // without a render). Emit them as entries with an empty URL so the
    // widget renders the metadata card; 33-17's ScrapbookGallery handles
    // empty-URL rows as "metadata only".
    for (const [turnId, entry] of scrapbookByTurn) {
      if (matchedTurnIds.has(turnId)) continue;
      result.push({
        url: entry.image_url ?? "",
        alt: entry.scene_title ?? entry.location,
        caption: entry.narrative_excerpt,
        render_id: undefined,
        tier: undefined,
        width: undefined,
        height: undefined,
        timestamp: messages.length + turnId,
        isHandout: false,
        turn_number: entry.turn_id,
        scene_name: entry.scene_title,
        scene_type: entry.scene_type,
        narrative_beat: entry.narrative_excerpt,
        chapter: undefined,
        location: entry.location,
        world_facts: entry.world_facts.length > 0 ? entry.world_facts : undefined,
        npcs:
          entry.npcs_present.length > 0
            ? projectNpcRefsToLegacy(entry.npcs_present)
            : undefined,
        render_status: entry.render_status,
      });
    }

    // Sort by timestamp so scrapbook-only entries interleave with image
    // cards in turn order. The final reverse() preserves the "newest first"
    // gallery ordering that existed before 33-18.
    result.sort((a, b) => a.timestamp - b.timestamp);
    return result.reverse();
  }, [messages]);

  return (
    <ImageBusContext.Provider value={{ images }}>
      {children}
    </ImageBusContext.Provider>
  );
}

// Co-located hook for the same reason as GameStateProvider — splitting one
// context+hook+component into 3 files for HMR is more churn than it's worth.
// eslint-disable-next-line react-refresh/only-export-components
export function useImageBus(): GalleryImage[] {
  return useContext(ImageBusContext).images;
}
