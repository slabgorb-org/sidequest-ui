// This file is a rendering-helpers module: it exports `renderSegment` (a
// function that returns JSX, not a typical component) alongside the
// `FootnoteList` helper component. react-refresh wants pure-component files
// — but turning `renderSegment` into a component would invert every call
// site (renderSegment(seg) → <RenderSegment seg={seg} />). Suppress.
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef } from "react";
import type { NarrativeSegment } from "@/lib/narrativeSegments";

function FootnoteList({ footnotes }: { footnotes: NarrativeSegment["footnotes"] }) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // Per-turn Knowledge blocks default to collapsed (Keith playtest 2026-04-29:
  // 3–4 entries per turn × N turns dominated above-the-fold space). But inline
  // footnote markers in the prose anchor to `#footnote-N`, and a collapsed
  // <details> hides those anchor targets. Open the disclosure when the URL
  // hash matches one of our contained footnote IDs so :target scrolling still
  // works. Once opened by the browser hash navigation OR the user, native
  // <details> persistence keeps it open — we only set, never clear.
  useEffect(() => {
    const el = detailsRef.current;
    if (!el || !footnotes || footnotes.length === 0) return;
    const openIfTargeted = () => {
      const hash = window.location.hash;
      if (!hash) return;
      const id = hash.startsWith("#") ? hash.slice(1) : hash;
      if (el.querySelector(`#${CSS.escape(id)}`)) {
        el.open = true;
      }
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, [footnotes]);

  if (!footnotes || footnotes.length === 0) return null;
  // Per-turn summary shows the stable item count, never an "N new" tally.
  // Pingpong 2026-04-30 "KNOWLEDGE GAINED banner accumulates": once a turn
  // is in scrollback the inline "N new" doesn't decrement on Knowledge-tab
  // visit and reads as ever-climbing unread state. The Knowledge tab's
  // badge (Story 33-11) is the authoritative ack surface; the per-item
  // NEW pills inside the expanded block still carry first-introduction
  // info. Keep the total-item count for at-a-glance density.
  const countLabel = `${footnotes.length} item${footnotes.length === 1 ? "" : "s"}`;
  return (
    <details
      ref={detailsRef}
      data-testid="world-facts"
      aria-label="World facts learned this turn"
      className="mt-6 rounded-md border-l-4 border-[var(--primary)]/60 bg-[var(--primary)]/[0.06] pl-4 pr-3 py-3 group"
    >
      <summary
        data-testid="world-facts-summary"
        className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]/90 cursor-pointer list-none flex items-center gap-2 select-none marker:hidden"
      >
        <span
          aria-hidden="true"
          className="inline-block transition-transform group-open:rotate-90 text-[var(--primary)]/70"
        >
          ▸
        </span>
        <span>Knowledge Gained</span>
        <span className="text-[var(--primary)]/60 font-normal normal-case tracking-normal">·</span>
        <span
          data-testid="world-facts-count"
          className="text-[var(--primary)]/80 font-bold normal-case tracking-normal"
        >
          {countLabel}
        </span>
      </summary>
      <div className="mt-3 space-y-1.5">
        {footnotes.map((fn, fi) => (
          <div
            key={fi}
            id={fn.marker != null ? `footnote-${fn.marker}` : undefined}
            data-footnote-id={fn.marker != null ? fn.marker : undefined}
            className="text-base text-foreground/85 leading-relaxed flex gap-2 target:bg-accent/20 scroll-mt-4 rounded px-1 py-0.5 transition-colors"
          >
            {fn.marker != null && (
              <span className="text-[var(--primary)]/70 shrink-0 font-semibold">[{fn.marker}]</span>
            )}
            <span>{fn.summary}</span>
            {fn.is_new && (
              <span
                data-testid="knowledge-new-pill"
                className="shrink-0 self-center inline-flex items-center rounded-full bg-[var(--primary)]/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]"
              >
                New
              </span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export interface RenderSegmentOpts {
  maxTextWidth?: string;
  chapterTitle?: string | null;
  dinkusGlyph?: string;
  /**
   * When true, render at history typography (smaller, tighter). Used by
   * NarrationScroll to differentiate the historical block from the current
   * turn block. Combined with the wrapper's opacity, this produces the
   * "past vs present" hierarchy without sacrificing body legibility.
   */
  isHistory?: boolean;
  /**
   * When true, this is the first text segment of the current (most recent)
   * turn — the opening paragraph gets a per-archetype drop cap. See the
   * `narr-text-current.has-dropcap > p:first-child::first-letter` rules in
   * `styles/archetype-chrome.css`.
   */
  isFirstCurrentText?: boolean;
}

export function renderSegment(
  seg: NarrativeSegment,
  i: number,
  opts: RenderSegmentOpts = {},
) {
  const {
    maxTextWidth = "",
    chapterTitle = null,
    dinkusGlyph = "◇",
    isHistory = false,
    isFirstCurrentText = false,
  } = opts;

  switch (seg.kind) {
    case "text": {
      // Current turn gets larger, looser type for serif body legibility.
      // History uses base size + relaxed leading — still readable, visually
      // recessed via the wrapper's opacity (see NarrationScroll).
      const sizeClass = isHistory
        ? "text-lg leading-relaxed"
        : "text-2xl leading-loose";
      const variantClass = isHistory ? "narr-text-history" : "narr-text-current";
      const dropcapClass = isFirstCurrentText && !isHistory ? " has-dropcap" : "";
      return (
        <div key={i} className={`${maxTextWidth} mx-auto mb-6`}>
          <div
            className={`narr-text ${variantClass}${dropcapClass} prose dark:prose-invert ${sizeClass}`}
            dangerouslySetInnerHTML={{ __html: seg.html! }}
          />
          <FootnoteList footnotes={seg.footnotes} />
        </div>
      );
    }
    case "gallery-notice":
      return (
        <div
          key={i}
          className="text-xs text-muted-foreground/40 italic py-1 text-center"
        >
          {seg.text}
        </div>
      );
    case "portrait-group":
    case "image":
    case "render-pending":
      // Images now route to gallery widget — these segment kinds should not appear.
      return null;
    case "separator":
      return (
        <hr
          key={i}
          data-testid="segment-separator"
          className="border-0 border-t border-border/20 my-8 max-w-[8rem] mx-auto"
        />
      );
    case "system":
      return (
        <div
          key={i}
          data-testid="system-message"
          className="text-xs text-muted-foreground/60 italic py-1 text-center max-w-[85ch] mx-auto"
        >
          {seg.text}
        </div>
      );
    case "turn-status":
      return (
        <div
          key={i}
          data-testid="turn-status"
          className="text-sm font-semibold text-accent-foreground py-1"
        >
          {seg.text}
        </div>
      );
    case "error":
      return (
        <div
          key={i}
          role="alert"
          className="text-sm text-destructive/80 bg-destructive/5 rounded-md px-3 py-2 max-w-[85ch] mx-auto border border-destructive/10"
        >
          {seg.text}
        </div>
      );
    case "player-action":
      return (
        <div
          key={i}
          data-testid="player-action"
          className="player-action text-base text-muted-foreground/70 italic max-w-[85ch] mx-auto my-2 pl-6 border-l-2 border-primary/20"
        >
          {seg.text}
        </div>
      );
    case "player-aside":
      return (
        <div
          key={i}
          data-testid="player-aside"
          className="text-sm text-muted-foreground/50 italic max-w-[85ch] mx-auto my-1"
        >
          {seg.text}
        </div>
      );
    case "chapter-marker":
      if (chapterTitle === seg.text) return null;
      return (
        <div
          key={i}
          data-testid="chapter-marker"
          className="my-12 max-w-[85ch] mx-auto text-center"
        >
          <div
            aria-label="Chapter break"
            title="Chapter break — new scene or location"
            className="text-muted-foreground/30 text-xs tracking-[0.5em] mb-2"
          >
            {dinkusGlyph} {dinkusGlyph} {dinkusGlyph}
          </div>
          <span className="text-lg font-semibold tracking-widest uppercase text-muted-foreground/80">
            {seg.text}
          </span>
        </div>
      );
  }
}
