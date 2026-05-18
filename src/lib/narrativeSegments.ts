import DOMPurify from "dompurify";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { FootnoteData } from "@/types/payloads";

export type { FootnoteData };

export interface NarrativeSegment {
  kind: "text" | "image" | "separator" | "system" | "turn-status" | "error" | "player-action" | "player-aside" | "gm-aside" | "chapter-marker" | "portrait-group" | "render-pending" | "gallery-notice";
  html?: string;
  url?: string;
  alt?: string;
  caption?: string;
  text?: string;
  width?: number;
  height?: number;
  tier?: string;
  render_id?: string;
  footnotes?: FootnoteData[];
  portraitImage?: NarrativeSegment;
  adjacentText?: NarrativeSegment;
}

export function markdownToHtml(text: string): string {
  const result = text
    .replace(/```json\s*\{[\s\S]*?\}\s*```/g, "")
    .replace(/```json\s*\{[\s\S]*$/g, "")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^---+$/gm, "<hr>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "</p><p>")
    .replace(/\[\^?(\d+)\]/g, '<sup><a href="#footnote-$1">$1</a></sup>');
  return `<p>${result}</p>`;
}

export function buildSegments(messages: GameMessage[]): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];

  const seenNarrationTexts = new Set<string>();
  let lastChapterLocation = "";

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    switch (msg.type) {
      case MessageType.NARRATION_END:
        if (segments.length > 0 && segments[segments.length - 1].kind !== "separator") {
          segments.push({ kind: "separator" });
        }
        break;
      case MessageType.NARRATION:
        {
          const narText = msg.payload.text as string;
          if (seenNarrationTexts.has(narText)) break;
          seenNarrationTexts.add(narText);
        }
        {
          const footnotes = (msg.payload.footnotes as FootnoteData[] | undefined) ?? [];
          segments.push({
            kind: "text",
            html: DOMPurify.sanitize(markdownToHtml(msg.payload.text as string)),
            footnotes: footnotes.length > 0 ? footnotes : undefined,
          });
        }
        break;
      case MessageType.RENDER_QUEUED:
        // Images are handled by ImageBusProvider — skip render placeholders
        break;
      case MessageType.IMAGE: {
        // Images routed to gallery widget via ImageBusProvider.
        // Emit a subtle gallery notice in the narrative stream.
        const renderId = msg.payload.render_id as string | undefined;
        // Remove any stale render-pending placeholder
        if (renderId) {
          const pendingIdx = segments.findIndex(s => s.kind === "render-pending" && s.render_id === renderId);
          if (pendingIdx >= 0) segments.splice(pendingIdx, 1);
        }
        segments.push({ kind: "gallery-notice", text: "New image in Scrapbook" });
        break;
      }
      case MessageType.SESSION_EVENT: {
        const event = msg.payload.event as string | undefined;
        if (event === "theme_css" || event === "connected" || event === "ready") break;
        const sysText = msg.payload.text as string | undefined;
        if (sysText) {
          segments.push({ kind: "system", text: sysText });
          break;
        }
        const playerName = msg.payload.player_name as string;
        const label =
          event === "join"
            ? `${playerName} joined the session`
            : event === "leave"
              ? `${playerName} left the session`
              : `${playerName}: ${event}`;
        segments.push({ kind: "system", text: label });
        break;
      }
      case MessageType.TURN_STATUS: {
        const name = msg.payload.player_name as string;
        const status = msg.payload.status as string;
        segments.push({
          kind: "turn-status",
          text: status === "active" ? `${name}'s turn` : `${name}: ${status}`,
        });
        break;
      }
      case MessageType.ERROR:
        segments.push({ kind: "error", text: msg.payload.message as string });
        break;
      // CHARACTER_SHEET case removed 2026-04. The sheet now rides on
      // PartyMember and no longer surfaces as a narrative segment — it's
      // a panel-only concern.
      case MessageType.PLAYER_ACTION: {
        const action = msg.payload.action as string;
        const aside = msg.payload.aside as boolean | undefined;
        if (action) {
          segments.push({
            kind: aside ? "player-aside" : "player-action",
            text: aside ? `[aside] ${action}` : action,
          });
        }
        break;
      }
      case MessageType.ASIDE_ANSWER: {
        // ADR-107: the answering half of the OOC aside pair. Table-visible,
        // never a turn record — rendered in the same lighter OOC register
        // as player-aside, not as narration text.
        const p = msg.payload as {
          asker_id?: string;
          question?: string;
          answer?: string;
        };
        if (p.answer) {
          segments.push({
            kind: "gm-aside",
            text: `${p.asker_id ?? "?"} asked: ${p.question ?? ""}\nGM: ${p.answer}`,
          });
        }
        break;
      }
      case MessageType.CHAPTER_MARKER: {
        // Playtest 2026-04-11: chapter markers must render ABOVE the
        // narration block that triggered them, not after it. The server
        // emits the narration first (because the narrator's output is
        // what determined the location shift) and only emits the
        // ChapterMarker once the location change has been detected — so
        // the message arrival order is Narration → ChapterMarker, but
        // the visual order should be ChapterMarker → Narration.
        //
        // Fix: when a chapter-marker arrives, walk backwards through
        // the segments we've already emitted to find the start of the
        // most recent narration block, and INSERT the chapter-marker
        // at that boundary. The narration block is the contiguous tail
        // of "narration-flowy" segments — text, separator, gallery-notice,
        // render-pending, image, portrait-group. We stop at any
        // structural segment that delimits the previous turn:
        // player-action, player-aside, system, error,
        // turn-status, or another chapter-marker.
        const location = msg.payload.location as string;
        if (location && location !== lastChapterLocation) {
          const newMarker: NarrativeSegment = {
            kind: "chapter-marker",
            text: location,
          };
          let insertAt = segments.length;
          while (insertAt > 0) {
            const prev = segments[insertAt - 1];
            const isNarrationBlockMember =
              prev.kind === "text" ||
              prev.kind === "separator" ||
              prev.kind === "gallery-notice" ||
              prev.kind === "render-pending" ||
              prev.kind === "image" ||
              prev.kind === "portrait-group";
            if (!isNarrationBlockMember) break;
            insertAt -= 1;
          }
          segments.splice(insertAt, 0, newMarker);
          lastChapterLocation = location;
        }
        break;
      }
      // ACTION_REVEAL is intentionally NOT a narrative-scroll segment.
      // Peer reveals are ephemeral UI surfaced via PeerRevealList /
      // usePeerReveals, not persistent narration. Any handling here would
      // resurrect the dead batch-shape pipeline that ADR-082's port left
      // unwired.
      default:
        break;
    }
  }


  while (segments.length > 0 && segments[0].kind === "separator") {
    segments.shift();
  }
  while (segments.length > 0 && segments[segments.length - 1].kind === "separator") {
    segments.pop();
  }

  return segments;
}

/** @deprecated Images now route to gallery widget; portrait grouping is a no-op passthrough. */
export function groupPortraitSegments(segments: NarrativeSegment[]): NarrativeSegment[] {
  return segments;
}

/**
 * Group segments into turn pages for Focus-mode pagination.
 *
 * A "turn page" is the unit the player flips through with Prev/Next. One turn
 * page holds:
 *   - (optional) a player-action banner that started the turn
 *   - all narrator text paragraphs produced in response
 *   - inline side-effects (gallery notices, chapter markers, system messages)
 *
 * Boundaries: each `player-action` or `player-aside` segment starts a new
 * page. Everything before the first boundary (opening narration) collapses
 * into a single page. `separator` segments (emitted by NARRATION_END) are
 * discarded — we use player action boundaries, not narration-end boundaries,
 * so that the player's action stays visually attached to the narrator's response.
 *
 * This replaces the old "one segment = one page" behavior that exposed the
 * player to raw timeline events (each paragraph, each side-effect) as its own
 * pagination slot. Playtest 2026-04-11 BLOCKING bug.
 */
export function buildTurnPages(segments: NarrativeSegment[]): NarrativeSegment[][] {
  const pages: NarrativeSegment[][] = [];
  let current: NarrativeSegment[] = [];

  const isTurnStarter = (s: NarrativeSegment): boolean =>
    s.kind === "player-action" ||
    s.kind === "player-aside";

  for (const seg of segments) {
    if (seg.kind === "separator") continue;
    if (isTurnStarter(seg)) {
      if (current.length > 0) pages.push(current);
      current = [seg];
    } else {
      current.push(seg);
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}
