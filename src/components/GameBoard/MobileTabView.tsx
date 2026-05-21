import { useState, type ReactNode } from "react";
import { BookOpen, User, Map, MapPin, Package, BookMarked, Image } from "lucide-react";
import type { WidgetId } from "./widgetRegistry";

interface MobileTab {
  id: WidgetId;
  label: string;
  icon: ReactNode;
}

const TABS: MobileTab[] = [
  { id: "narrative", label: "Story", icon: <BookOpen size={18} /> },
  { id: "character", label: "Character", icon: <User size={18} /> },
  { id: "map", label: "Map", icon: <Map size={18} /> },
  // Capability-gated like every non-narrative tab: only renders when
  // `location` is in availableWidgets (region / room_graph worlds). Kept in
  // sync with the desktop dockview rightGroupOrder so the Location tab has
  // layout parity instead of being desktop-only.
  { id: "location", label: "Location", icon: <MapPin size={18} /> },
  { id: "inventory", label: "Items", icon: <Package size={18} /> },
  { id: "gallery", label: "Gallery", icon: <Image size={18} /> },
  { id: "knowledge", label: "Journal", icon: <BookMarked size={18} /> },
];

// Story 33-11: Tabs that must never render a notification badge even when
// the parent dispatches a signal for them. Character is persistent identity
// info — a "new" flag would be meaningless. Audio is background/ambient
// and not currently in mobile TABS, but the exclusion is kept for future
// regression protection.
const BADGE_EXCLUDED: ReadonlySet<WidgetId> = new Set<WidgetId>(["character", "audio"]);

interface MobileTabViewProps {
  renderWidget: (id: WidgetId) => ReactNode;
  availableWidgets: ReadonlySet<WidgetId>;
  /**
   * Story 33-11: per-tab monotonic content counters. Parent increments a
   * tab's counter when new content arrives for that tab (new world_learned
   * entries, new scene images, new map locations, inventory changes). A
   * rising value while the tab is NOT the active tab causes a dot badge
   * to appear next to the tab label. Clicking the tab clears the badge.
   *
   * Badge state itself is component-local (ephemeral, not Redux) — this
   * prop is only the change-detection signal, not the badge storage.
   */
  contentSignals?: Partial<Record<WidgetId, number>>;
  /**
   * Running header — chapter title + Leave button. Lifted into MobileTabView
   * so mobile users have the same way to leave the game as desktop users.
   * Without this, mobile players were trapped in-session (playtest 2026-04-23).
   */
  header?: ReactNode;
  children?: ReactNode; // InputBar slot
}

export function MobileTabView({
  renderWidget,
  availableWidgets,
  contentSignals,
  header,
  children,
}: MobileTabViewProps) {
  const [activeTab, setActiveTab] = useState<WidgetId>("narrative");
  const [badgedTabs, setBadgedTabs] = useState<Set<WidgetId>>(() => new Set());
  // Snapshot of the signal values the component has already "seen". Seeded
  // from the initial contentSignals so the first render is quiet — badges
  // only fire when a value *changes* during the session. Stored in React
  // state (not a ref) so updates follow the "derived state from props"
  // pattern and don't trip react-hooks/set-state-in-effect.
  const [seenSignals, setSeenSignals] = useState<Partial<Record<WidgetId, number>>>(
    () => ({ ...(contentSignals ?? {}) }),
  );

  // Derived state from props: compare current contentSignals against the
  // last-seen snapshot during render, and schedule updates for any deltas.
  // React re-renders when setState is called during render, but bails out
  // after the next render stabilises (no further deltas → no setState).
  // Pattern: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (contentSignals) {
    let signalsChanged = false;
    const newBadges: WidgetId[] = [];
    for (const [key, value] of Object.entries(contentSignals)) {
      // Safe: contentSignals is typed `Partial<Record<WidgetId, number>>`, so
      // every key at runtime is a WidgetId. Object.entries widens to string.
      const id = key as WidgetId;
      if (seenSignals[id] !== value) {
        signalsChanged = true;
        if (BADGE_EXCLUDED.has(id)) continue;
        if (id === activeTab) continue; // AC-6: active tab never badges
        if (!badgedTabs.has(id)) newBadges.push(id);
      }
    }
    if (signalsChanged) {
      setSeenSignals({ ...contentSignals });
      if (newBadges.length > 0) {
        const next = new Set(badgedTabs);
        for (const id of newBadges) next.add(id);
        setBadgedTabs(next);
      }
    }
  }

  const handleTabClick = (id: WidgetId) => {
    setActiveTab(id);
    setBadgedTabs((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const visibleTabs = TABS.filter(t => t.id === "narrative" || availableWidgets.has(t.id));

  return (
    <div data-testid="game-board" className="flex flex-col h-screen">
      {header}
      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-auto">
        {renderWidget(activeTab)}
      </div>

      {/* Input bar */}
      {children && (
        <div className="border-t border-border/50 px-4 py-3 bg-card/50 shrink-0">
          {children}
        </div>
      )}

      {/* Tab bar */}
      <nav className="flex border-t border-border/50 bg-card shrink-0" role="tablist">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
              activeTab === tab.id
                ? "text-[var(--primary,var(--primary))]"
                : "text-muted-foreground"
            }`}
          >
            {tab.icon}
            <span className="inline-flex items-center gap-1">
              {tab.label}
              {badgedTabs.has(tab.id) && (
                <span
                  data-testid={`tab-badge-${tab.id}`}
                  aria-label={`new ${tab.label}`}
                  className="inline-block w-[5px] h-[5px] rounded-full bg-[var(--primary,var(--primary))]"
                />
              )}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
