/**
 * ScrapbookGallery — pure presentational component for the diegetic image
 * scrapbook (story 33-17). Takes a list of gallery entries and renders them
 * as a turn-attributed, chapter-grouped travelogue with NPC/world-fact chips,
 * a grid/list view toggle, and a compact 3-col mode at 6+ images.
 *
 * Graceful degradation: scrapbook metadata fields (turn_number, scene_name,
 * narrative_beat, scene_type, npcs, world_facts, chapter) are all optional.
 * When a field is absent the corresponding DOM element is omitted entirely —
 * no placeholders, no "Untitled" fallbacks (see CLAUDE.md "no silent
 * fallbacks"). This lets 33-17 ship before 33-18 enriches the server payload.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GalleryImage, NpcRole, ScrapbookNpc } from "@/providers/ImageBusProvider";

export type ScrapbookEntry = GalleryImage;

type ViewMode = "grid" | "list";

const COMPACT_THRESHOLD = 6;
const UNSORTED_CHAPTER = "Unsorted";

interface ScrapbookGalleryProps {
  images: readonly ScrapbookEntry[];
}

interface ChapterGroup {
  chapter: string;
  entries: ScrapbookEntry[];
}

function sortEntries(entries: readonly ScrapbookEntry[]): ScrapbookEntry[] {
  return [...entries].sort((a, b) => {
    const ta = a.turn_number ?? Number.POSITIVE_INFINITY;
    const tb = b.turn_number ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.timestamp - b.timestamp;
  });
}

function groupByChapter(sorted: readonly ScrapbookEntry[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const entry of sorted) {
    const chapter = entry.chapter ?? UNSORTED_CHAPTER;
    const last = groups[groups.length - 1];
    if (last && last.chapter === chapter) {
      last.entries.push(entry);
    } else {
      groups.push({ chapter, entries: [entry] });
    }
  }
  return groups;
}

function entryId(entry: ScrapbookEntry): string {
  return entry.render_id ?? `ts${entry.timestamp}`;
}

function titleFor(entry: ScrapbookEntry): string | undefined {
  return entry.scene_name;
}

function ScrapbookEmpty() {
  return (
    <div
      data-testid="scrapbook-empty"
      className="flex items-center justify-center h-full p-6 text-sm italic text-muted-foreground/70 text-center"
    >
      No scenes yet — the world will fill these pages.
    </div>
  );
}

function NpcChip({
  entryId: id,
  npc,
}: {
  entryId: string;
  npc: ScrapbookNpc;
}) {
  const roleClass: Record<NpcRole, string> = {
    hostile: "bg-red-950/40 text-red-200 border-red-800/60",
    friendly: "bg-emerald-950/40 text-emerald-200 border-emerald-800/60",
    neutral: "bg-muted/40 text-muted-foreground border-muted/60",
  };
  // Story 65-6: NPCs in the world's portrait_manifest carry a world-scoped
  // portrait URL — render a thumbnail next to the name. Ad-hoc NPCs (no
  // portrait_url) keep the original dot marker. Guard on presence so a null/
  // empty URL never produces a broken <img>.
  const hasPortrait =
    typeof npc.portrait_url === "string" && npc.portrait_url.length > 0;
  return (
    <span
      data-testid={`scrapbook-npc-chip-${id}-${npc.name}`}
      data-npc-role={npc.role}
      data-has-portrait={hasPortrait ? "true" : "false"}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] ${roleClass[npc.role]}`}
    >
      {hasPortrait ? (
        <img
          data-testid={`scrapbook-npc-portrait-${id}-${npc.name}`}
          src={npc.portrait_url}
          alt={npc.name}
          loading="lazy"
          className="w-4 h-4 rounded-full object-cover border border-current/40"
        />
      ) : (
        <span
          aria-hidden="true"
          className="w-1 h-1 rounded-full bg-current opacity-70"
        />
      )}
      {npc.name}
    </span>
  );
}

function FactChip({
  entryId: id,
  index,
  text,
}: {
  entryId: string;
  index: number;
  text: string;
}) {
  return (
    <span
      data-testid={`scrapbook-fact-chip-${id}-${index}`}
      className="inline-block px-1.5 py-0.5 rounded bg-muted/30 text-[9px] text-muted-foreground border border-muted/40"
    >
      {text}
    </span>
  );
}

function SceneTypeBadge({
  entryId: id,
  sceneType,
}: {
  entryId: string;
  sceneType: string;
}) {
  return (
    <span
      data-testid={`scrapbook-scene-type-${id}`}
      data-scene-type={sceneType}
      className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] uppercase tracking-wide text-white/90"
    >
      {sceneType}
    </span>
  );
}

function TurnBadge({
  entryId: id,
  turnNumber,
  compact,
}: {
  entryId: string;
  turnNumber: number;
  compact: boolean;
}) {
  return (
    <span
      data-testid={`scrapbook-turn-badge-${id}`}
      className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-semibold text-white"
    >
      {compact ? `T${turnNumber}` : `Turn ${turnNumber}`}
    </span>
  );
}

function Lightbox({
  entry,
  onClose,
}: {
  entry: ScrapbookEntry;
  onClose: () => void;
}) {
  const title = titleFor(entry);
  const caption = entry.narrative_beat;
  const hasImage = typeof entry.url === "string" && entry.url.length > 0;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Portal to document.body so backdrop clicks don't bubble through the
  // dockview panel React/DOM tree. Playtest 2026-04-30: clicking off the
  // lightbox dumped the player back to the lobby because the click event
  // propagated up through the panel container; isolating to body restores
  // expected modal-dismiss behavior. Matches JournalView's lightbox pattern.
  return createPortal(
    <div
      data-testid="scrapbook-lightbox"
      data-has-image={hasImage ? "true" : "false"}
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {hasImage ? (
          <img
            src={entry.url}
            alt={entry.alt ?? title ?? "Scrapbook scene"}
            className="max-w-full max-h-[80vh] object-contain rounded"
          />
        ) : (
          // Lightbox over a metadata-only card. Same reasoning as the
          // card-level placeholder: don't fake an image. Show a typographic
          // panel that gives the metadata the room a real lightbox would.
          <div
            data-testid="scrapbook-lightbox-no-image"
            className="w-[60vw] max-w-lg min-h-[40vh] flex items-center justify-center rounded border border-white/10 bg-white/5 text-white/40 italic text-sm px-8 py-12 text-center"
          >
            No image — only the scene&rsquo;s record.
          </div>
        )}
        {(title || caption) && (
          <div className="mt-2 text-center max-w-lg">
            {title && (
              <div className="text-sm font-semibold text-white/90">{title}</div>
            )}
            {caption && (
              <div className="text-xs text-white/60 italic mt-1">{caption}</div>
            )}
          </div>
        )}
        <button
          type="button"
          aria-label="Close lightbox"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-black/70 text-white/80 hover:text-white flex items-center justify-center text-lg"
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ScrapbookCard({
  entry,
  compact,
  onSelect,
}: {
  entry: ScrapbookEntry;
  compact: boolean;
  onSelect: (entry: ScrapbookEntry) => void;
}) {
  const id = entryId(entry);
  const title = titleFor(entry);
  const caption = entry.narrative_beat;
  const showCaption = !compact && typeof caption === "string";
  // Metadata-only entries (story 33-18 SCRAPBOOK_ENTRY arriving without a
  // matching IMAGE) carry an empty url. Rendering ``<img src="">`` causes
  // browsers to either reload the page-as-image or display a broken-image
  // glyph that crowbars the layout open — playtest 2026-04-26 Bug #3
  // "Scrapbook layout completely broken". Hide the <img> entirely on those
  // rows; the legend block below still surfaces title/caption/chips so the
  // entry is not "lost", just imageless.
  const hasImage = typeof entry.url === "string" && entry.url.length > 0;
  // The ``bg-surface/40`` shorthand requires a ``--color-surface`` Tailwind
  // theme token, which the unified-theme CSS does not register (see
  // src/index.css ``@theme`` block — only ``--color-card`` is defined).
  // Other widgets (InventoryPanel, WidgetWrapper) already use the
  // ``var(--surface,var(--card))`` arbitrary-value pattern. Adopting it
  // here re-grounds the card chrome against the genre theme; without it
  // every card was unstyled and bled into the panel background.
  const cardBackground =
    "bg-[color-mix(in_srgb,var(--surface,var(--card))_40%,transparent)]";

  return (
    <article
      data-testid={`scrapbook-entry-${id}`}
      data-has-image={hasImage ? "true" : "false"}
      className={`flex flex-col gap-1 ${cardBackground} rounded overflow-hidden border border-border/40`}
    >
      <div
        className="relative aspect-[4/3] bg-muted/30 cursor-pointer"
        onClick={() => onSelect(entry)}
        role="button"
        tabIndex={0}
        aria-label={
          hasImage
            ? `Enlarge: ${title ?? "Scrapbook scene"}`
            : entry.render_status === "skipped_policy"
              ? `Open: ${title ?? "Scrapbook scene"} (skipped — no narrative weight)`
              : entry.render_status === "failed"
                ? `Open: ${title ?? "Scrapbook scene"} (render failed)`
                : `Open: ${title ?? "Scrapbook scene"} (metadata only)`
        }
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(entry); } }}
      >
        {hasImage ? (
          <img
            src={entry.url}
            alt={entry.alt ?? title ?? "Scrapbook scene"}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : entry.render_status === "skipped_policy" ? (
          // Story 45-30: the trigger policy returned NONE_POLICY for this
          // turn — banter or no narrative weight. Distinct from "no image
          // yet" (which would imply we expected one); this turn EARNED
          // having no image. The a11y label names the state aloud so a
          // non-sighted player learns WHY it's imageless.
          <div
            data-testid={`scrapbook-entry-${id}-render-status-skipped`}
            aria-label="Skipped: no narrative weight on this turn"
            className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-[10px] italic"
          >
            • skipped
          </div>
        ) : entry.render_status === "failed" ? (
          // Story 45-30: the policy fired but the daemon refused
          // synchronously (offline, error). Distinct affordance — the GM
          // panel and the gallery agree this turn EXPECTED an image but
          // didn't get one (the OTEL render.failed event carries the why).
          <div
            data-testid={`scrapbook-entry-${id}-render-status-failed`}
            aria-label="Render failed: image was requested but did not arrive"
            className="w-full h-full flex items-center justify-center text-destructive/60 text-[10px] italic"
          >
            ⚠ render failed
          </div>
        ) : (
          // Metadata-only placeholder. We deliberately do NOT show a broken
          // image icon, a "loading…" spinner, or any pretense that an image
          // is on the way — per CLAUDE.md "no silent fallbacks" the absence
          // of a render is a real state, not an error to mask. The empty
          // glyph echoes the empty-state language ("the world will fill
          // these pages") so the affordance reads as "scene captured, no
          // illustration yet" instead of as broken.
          //
          // This branch fires when render_status is undefined or "rendered"
          // but no image URL has arrived yet (the policy fired and dispatch
          // is pending). Distinct from skipped/failed above by virtue of
          // *not* having a render_status that names a terminal absence.
          <div
            data-testid={`scrapbook-entry-${id}-no-image`}
            className="w-full h-full flex items-center justify-center text-muted-foreground/50 text-[10px] italic"
          >
            no image
          </div>
        )}
        {typeof entry.turn_number === "number" && (
          <TurnBadge
            entryId={id}
            turnNumber={entry.turn_number}
            compact={compact}
          />
        )}
        {typeof entry.scene_type === "string" && (
          <SceneTypeBadge entryId={id} sceneType={entry.scene_type} />
        )}
      </div>
      <div
        data-testid={`scrapbook-legend-${id}`}
        className="flex flex-col gap-1 px-2 py-1"
      >
        {typeof title === "string" && (
          <div
            data-testid={`scrapbook-title-${id}`}
            className="font-semibold text-[10px] tracking-wide"
          >
            {title}
          </div>
        )}
        {showCaption && (
          <div
            data-testid={`scrapbook-caption-${id}`}
            className="text-[9px] text-muted-foreground italic line-clamp-2"
          >
            {caption}
          </div>
        )}
        {!compact && entry.world_facts && entry.world_facts.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {entry.world_facts.map((fact, factIndex) => (
              <FactChip
                key={`fact-${id}-${fact}`}
                entryId={id}
                index={factIndex}
                text={fact}
              />
            ))}
          </div>
        )}
        {!compact && entry.npcs && entry.npcs.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {entry.npcs.map((npc) => (
              <NpcChip key={`npc-${npc.name}`} entryId={id} npc={npc} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function ScrapbookGallery({ images }: ScrapbookGalleryProps) {
  const [view, setView] = useState<ViewMode>("grid");
  const [lightboxEntry, setLightboxEntry] = useState<ScrapbookEntry | null>(null);
  const handleSelect = useCallback((entry: ScrapbookEntry) => setLightboxEntry(entry), []);
  const handleClose = useCallback(() => setLightboxEntry(null), []);

  if (images.length === 0) {
    return <ScrapbookEmpty />;
  }

  const compact = images.length >= COMPACT_THRESHOLD;
  const sorted = sortEntries(images);
  const groups = groupByChapter(sorted);

  return (
    <div
      data-testid="scrapbook-root"
      data-view={view}
      data-compact={compact ? "true" : "false"}
      className="flex flex-col h-full"
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div
          data-testid="scrapbook-scene-count"
          className="text-xs text-muted-foreground"
        >
          {images.length} scenes
        </div>
        <div className="flex gap-1" role="group" aria-label="View mode">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              view === "grid"
                ? "bg-primary/30 border-primary/60"
                : "border-border/40 text-muted-foreground"
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              view === "list"
                ? "bg-primary/30 border-primary/60"
                : "border-border/40 text-muted-foreground"
            }`}
          >
            List
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map((group) => {
          // Disambiguate chapters that repeat non-contiguously in the sorted
          // order (same chapter split by another chapter between entries) by
          // composing the key from chapter name + first entry's stable id.
          const firstEntry = group.entries[0];
          const groupTag =
            firstEntry.render_id ?? `ts-${firstEntry.timestamp}`;
          return (
          <section
            key={`chapter-${group.chapter}-${groupTag}`}
            className="mb-3"
          >
            <div
              data-testid={`scrapbook-chapter-divider-${groupTag}`}
              className="text-[10px] uppercase tracking-widest text-muted-foreground/80 border-b border-border/30 pb-1 mb-2"
            >
              {group.chapter}
            </div>
            <div
              className={
                view === "list"
                  ? "flex flex-col gap-2"
                  : compact
                    ? "grid grid-cols-3 gap-2"
                    : "grid grid-cols-2 gap-2"
              }
            >
              {group.entries.map((entry) => (
                <ScrapbookCard
                  key={entry.render_id ?? `entry-ts-${entry.timestamp}`}
                  entry={entry}
                  compact={compact}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </section>
          );
        })}
      </div>
      {lightboxEntry && (
        <Lightbox entry={lightboxEntry} onClose={handleClose} />
      )}
    </div>
  );
}
