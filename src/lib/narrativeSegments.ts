import DOMPurify from "dompurify";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { FootnoteData, ActionRevealEntry } from "@/types/payloads";

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
  // Story 71-4: peer-action persistence (ADR-036 collaborative visibility).
  // A `player-action` segment with `is_peer: true` is a peer's submitted action
  // persisted into the transcript at the turn boundary — own actions omit the
  // flag (AC1 high contrast) and peer actions set it (AC3 lower contrast). One
  // render path, flag-differentiated. `character_name` carries peer attribution.
  is_peer?: boolean;
  character_name?: string;
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

export function buildSegments(
  messages: GameMessage[],
  peerActionsByRound?: Map<number, ActionRevealEntry[]>,
): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];

  const seenNarrationTexts = new Set<string>();
  let lastChapterLocation = "";

  // Story 71-4: persisted peer actions (firewall-filtered accumulator). Peer
  // action TEXT derives ONLY from this map (sourced from usePeerReveals, which
  // is downstream of the ADR-104/105 perception firewall) — never from a
  // TURN_STATUS frame or any broader origin. Each round's submitted peers drop
  // at that round's turn boundary. PLAYER_ACTION carries no round, so we anchor
  // positionally: the i-th NARRATION_END boundary ← the i-th captured round
  // (rounds sorted ascending).
  const sortedPeerRounds = peerActionsByRound
    ? [...peerActionsByRound.keys()].sort((a, b) => a - b)
    : [];
  let turnBoundaryIndex = 0;
  // Emit the i-th captured round's submitted peers (seq order) as is_peer
  // player-action segments. The accumulator already deduped per (player_id,
  // round). No-op when the index is past the captured rounds.
  const pushPeerRound = (index: number): void => {
    const roundKey = sortedPeerRounds[index];
    if (roundKey === undefined || !peerActionsByRound) return;
    const peers = [...(peerActionsByRound.get(roundKey) ?? [])].sort(
      (a, b) => a.seq - b.seq,
    );
    for (const entry of peers) {
      segments.push({
        kind: "player-action",
        is_peer: true,
        text: entry.action,
        character_name: entry.character_name,
      });
    }
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    switch (msg.type) {
      case MessageType.NARRATION_END: {
        // Story 71-4: emit this boundary's persisted peer actions BEFORE the
        // separator, so they anchor AFTER the round's own action + narration
        // (placement: turn boundary, not interleaved). Positional: the i-th
        // NARRATION_END boundary ← the i-th captured round.
        pushPeerRound(turnBoundaryIndex);
        turnBoundaryIndex += 1;
        if (segments.length > 0 && segments[segments.length - 1].kind !== "separator") {
          segments.push({ kind: "separator" });
        }
        break;
      }
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

  // Story 71-4: any captured peer rounds not yet anchored to a NARRATION_END
  // boundary append after all narration — covers a just-resolved turn whose
  // NARRATION_END isn't (yet) in `messages` and transcripts with no narration
  // frames at all (e.g. the e2e wiring harness). Still firewall-safe: source is
  // exclusively the accumulator.
  for (let index = turnBoundaryIndex; index < sortedPeerRounds.length; index++) {
    pushPeerRound(index);
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
    // Story 71-4: a PEER (is_peer) player-action must NOT start a new Focus
    // page — it belongs to the same turn page as the round's own action.
    (s.kind === "player-action" && !s.is_peer) ||
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
