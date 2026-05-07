import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import "@/styles/dockview-theme.css";

import { useRunningHeader } from "@/hooks/useRunningHeader";

import InputBar, { type InputBarRevealCall } from "@/components/InputBar";
import { MultiplayerTurnBanner } from "@/components/MultiplayerTurnBanner";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useImageBus } from "@/providers/ImageBusProvider";
import { useGameBoardLayout } from "@/hooks/useGameBoardLayout";
import { useGameBoardHotkeys } from "@/hooks/useGameBoardHotkeys";
import { TurnStatusPanel, type TurnStatusEntry } from "@/components/TurnStatusPanel";
import type { ResourceThreshold } from "@/components/GenericResourceBar";
import type { CharacterSheetData } from "@/components/CharacterSheet";
import type { InventoryData } from "@/components/InventoryPanel";
import type { MapState } from "@/components/MapOverlay";
import type { ConfrontationData, ConfrontationOutcome } from "@/components/ConfrontationOverlay";
import type { KnowledgeEntry, ItemDepletion, ResourceAlert } from "@/providers/GameStateProvider";
import type { ResourcePool } from "@/components/CharacterPanel";
import type { CharacterSummary, CompanionSummary } from "@/types/party";
import type { useAudio } from "@/hooks/useAudio";
import type { NowPlaying } from "@/hooks/useAudioCue";
import type { GameMessage } from "@/types/protocol";
import type { DiceRequestPayload, DiceResultPayload, DiceThrowParams } from "@/types/payloads";
import type { PeerReveal } from "@/hooks/usePeerReveals";
import { PeerRevealList } from "@/components/PeerRevealList";
import type { LayoutMode } from "@/hooks/useLayoutMode";
import type { MagicState } from "@/types/magic";
import type { OrbitalIntent, OrbitalIntentResponse } from "@/types/orbital-intent";

import { WIDGET_REGISTRY, type WidgetId } from "./widgetRegistry";
import { BackgroundCanvas } from "./BackgroundCanvas";
import { MobileTabView } from "./MobileTabView";
import { NarrativeWidget } from "./widgets/NarrativeWidget";
import { CharacterWidget } from "./widgets/CharacterWidget";
import { MapWidget } from "./widgets/MapWidget";
import { ShipWidget } from "./widgets/ShipWidget";
import { InventoryWidget } from "./widgets/InventoryWidget";
// JournalWidget removed playtest 2026-04-11 — see widgetRegistry.ts comment.
// JournalView and the journal data pipeline are intentionally retained.
import { KnowledgeWidget } from "./widgets/KnowledgeWidget";
import { ConfrontationWidget } from "./widgets/ConfrontationWidget";
import { AudioWidget } from "./widgets/AudioWidget";
import { ImageGalleryWidget } from "./widgets/ImageGalleryWidget";

// ────────────────────────────────────────────────────────────────────────────
// Dockview closure bridge
//
// Dockview freezes the `component` reference at panel-creation time
// (see node_modules/dockview/dist/cjs/dockview/reactContentPart.js — the
// `ReactPanelContentPart` constructor stores `this.component = component`
// and the `update()` method only forwards new params, never a new component).
// So if we defined `PanelAdapter` inline with a `useCallback([renderWidgetContent])`
// dep, the adapter's closure over `renderWidgetContent` — and therefore over
// `messages`, `thinking`, `characterSheet`, etc. — would be locked in forever
// at the moment each panel was first added. Any subsequent setState in the
// parent would be invisible inside the dockview panel: the narrative panel
// wouldn't show new turns, the character panel wouldn't show HP changes,
// and so on. Refreshing the page would appear to "fix" it because sessionStorage
// hydration gave the first render the correct initial state.
//
// The fix is to make `PanelAdapter` and `dockviewComponents` module-level
// stable references that pull the current render function out of a React
// context. Context consumers re-render on context value updates regardless
// of closure position — React tracks subscription by fiber, and portal
// children are still part of the React tree for context purposes. So the
// GameBoard component updates the context value on every render, and the
// stable PanelAdapter sees the latest `renderWidget` immediately.

interface GameBoardRenderContextValue {
  renderWidget: (id: WidgetId) => ReactNode;
}

const GameBoardRenderContext = createContext<GameBoardRenderContextValue | null>(
  null,
);

function PanelAdapter({
  params,
}: IDockviewPanelProps<{ panelId: WidgetId }>) {
  const ctx = useContext(GameBoardRenderContext);
  const content = ctx ? ctx.renderWidget(params.panelId) : null;
  return (
    <div className="dockview-panel-content" data-widget={params.panelId}>
      <div className="flex-1 min-h-0 flex flex-col overflow-auto">
        {content}
      </div>
    </div>
  );
}

const DOCKVIEW_COMPONENTS = { PanelAdapter };

// Story 33-11: Multiplier used to pack inventory items count and gold into
// a single content-signal scalar for the mobile tab badge mechanism. Must
// be strictly greater than the largest realistic gold value in a session.
// 10M is ~10x the practical ceiling for any genre pack; bump it if a
// genre introduces a higher-currency economy.
const INVENTORY_GOLD_CAP = 10_000_000;

// ────────────────────────────────────────────────────────────────────────────

export interface GameBoardProps {
  messages: GameMessage[];
  characters: CharacterSummary[];
  onSend: (text: string, aside: boolean) => void;
  onLeave?: () => void;
  disabled: boolean;
  thinking?: boolean;
  layoutMode?: LayoutMode;
  characterSheet?: CharacterSheetData | null;
  inventoryData?: InventoryData | null;
  mapData?: MapState | null;
  audio?: ReturnType<typeof useAudio>;
  nowPlaying?: NowPlaying | null;
  // journalEntries prop removed playtest 2026-04-11 along with the Handouts
  // tab. The JournalEntry type and gameState.journal pipeline are kept in
  // the provider so the feature can be revived without re-plumbing data.
  knowledgeEntries?: KnowledgeEntry[];
  confrontationData?: ConfrontationData | null;
  /** Phase 5 (Story 47-3): branch-explicit outcome reveal payload. */
  confrontationOutcome?: ConfrontationOutcome | null;
  onBeatSelect?: (beatId: string) => void;
  onYield?: () => void;
  diceRequest?: DiceRequestPayload | null;
  diceResult?: DiceResultPayload | null;
  onDiceThrow?: (params: DiceThrowParams, face: number[]) => void;
  currentPlayerId?: string;
  activePlayerId?: string | null;
  activePlayerName?: string | null;
  waitingForPlayer?: string;
  /**
   * MP input state derived from canType + per-player TURN_STATUS entries.
   * Drives both the MultiplayerTurnBanner copy and the InputBar placeholder
   * so the simultaneous-action server model is reflected truthfully (playtest
   * 2026-04-29 HIGH/BUG-LOW + turn-indicator consolidation).
   */
  mpInputState?: "free" | "waiting-on-peers" | "waiting-on-narrator";
  /** Names of peers who have NOT yet submitted this round. */
  peersOutstanding?: string[];
  turnStatusEntries?: TurnStatusEntry[];
  resources?: Record<string, ResourcePool> | null;
  /** Narrator-recruited NPC companions (playtest 2026-05-06). Surfaced in
   * the Party panel below the PCs so the full active roster is visible. */
  companions?: CompanionSummary[];
  genreSlug?: string;
  worldSlug?: string;
  depletions?: ItemDepletion[];
  resourceAlerts?: ResourceAlert[];
  /** Magic ledger (Coyote Star Phase 4). Forwarded to CharacterWidget. */
  magicState?: MagicState | null;
  /** Latest ORBITAL_CHART response — feeds MapWidget's orbital chart panel. */
  lastOrbitalChart?: OrbitalIntentResponse | null;
  /** Sends an OrbitalIntent over the WebSocket — feeds MapWidget. */
  sendOrbitalIntent?: (intent: OrbitalIntent) => void;
  /**
   * Bumps on every SESSION_EVENT{ready}/{connected} so MapWidget's
   * orbital hook can recover from an ORBITAL_INTENT rejected at
   * AwaitingConnect (sq-playtest 2026-05-03 fix).
   */
  sessionBoundEpoch?: number;
  /** Peer reveal map — live teammate typing indicators (Task 12). */
  peerReveals?: Map<string, PeerReveal>;
  /** Stable player_id ordering for PeerRevealList. */
  partyOrder?: string[];
  /**
   * ADR-036 outbound: called by InputBar on composing/submitted — App.tsx
   * constructs the ACTION_REVEAL WS message and calls send(). Optional;
   * single-player callers omit it.
   */
  onReveal?: (call: InputBarRevealCall) => void;
  /** ADR-051 current round — forwarded to InputBar for seq reset. */
  round?: number;
}

export function GameBoard({
  messages,
  characters,
  onSend,
  onLeave,
  disabled,
  thinking,
  characterSheet = null,
  inventoryData = null,
  mapData = null,
  audio,
  nowPlaying = null,
  knowledgeEntries,
  confrontationData,
  confrontationOutcome,
  onBeatSelect,
  onYield,
  diceRequest,
  diceResult,
  onDiceThrow,
  currentPlayerId,
  activePlayerId,
  activePlayerName,
  waitingForPlayer,
  mpInputState,
  peersOutstanding = [],
  turnStatusEntries = [],
  resources,
  companions = [],
  genreSlug,
  worldSlug,
  depletions,
  resourceAlerts,
  magicState,
  lastOrbitalChart,
  sendOrbitalIntent,
  sessionBoundEpoch = 0,
  peerReveals,
  partyOrder = [],
  onReveal,
  round = 0,
}: GameBoardProps) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";

  // Layout management — dockview handles its own layout state internally,
  // but we still use the show/hide tracking for data-gating widgets.
  const {
    visibleWidgets,
    showWidget,
    hideWidget,
    toggleWidget,
  } = useGameBoardLayout(genreSlug, worldSlug);

  const dockviewApiRef = useRef<DockviewApi | null>(null);

  // Build available widgets set. Tabs are deterministic per-session — they
  // appear once the game is loaded (we're already past chargen by the time
  // GameBoard mounts), regardless of whether the player has accumulated any
  // entries yet. Per-player gating caused inconsistent panel sets between
  // players in the same session (e.g. Kael had Knowledge but Mira did not
  // because Mira had not yet had her first turn).
  //
  // CRITICAL: Every widget that should ever appear in the dock MUST be added
  // here UNCONDITIONALLY. Dockview's `onReady` only fires once at mount, so
  // any widget missing from `availableWidgets` at mount time is skipped from
  // the initial layout. The sync effect below can only add panels without a
  // stable position reference once the initial layout exists. The renderer
  // (`renderWidgetContent`) is responsible for showing loading/empty states
  // when a widget's data has not yet arrived.
  //
  // Confrontation is the ONE exception — it is an overlay that only exists
  // mid-encounter, and its appearance is a narrative event, not a dock state.
  const availableWidgets = useMemo(() => {
    const available = new Set<WidgetId>();
    available.add("narrative");
    available.add("character");
    available.add("inventory");
    available.add("map");
    available.add("knowledge");
    available.add("gallery");
    available.add("audio");
    if (worldSlug === "coyote_star") available.add("ship");
    if (confrontationData) available.add("confrontation");
    return available;
  }, [confrontationData, worldSlug]);

  // Hotkeys
  useGameBoardHotkeys(toggleWidget, availableWidgets);

  // Confrontation auto-promote
  useEffect(() => {
    if (confrontationData && !visibleWidgets.has("confrontation")) {
      showWidget("confrontation");
    }
    if (!confrontationData && visibleWidgets.has("confrontation")) {
      hideWidget("confrontation");
    }
  }, [confrontationData, visibleWidgets, showWidget, hideWidget]);

  // Audio state (migrated from GameLayout)
  const [volumes, setVolumes] = useState({ music: 0.5, sfx: 0.5 });
  const [muted, setMuted] = useState({ music: false, sfx: false });

  const handleVolumeChange = useCallback(
    (channel: string, value: number) => {
      setVolumes((prev) => ({ ...prev, [channel]: value }));
      audio?.setVolume(channel as "music" | "sfx", value);
    },
    [audio],
  );

  const handleMuteToggle = useCallback(
    (channel: string) => {
      setMuted((prev) => {
        const next = { ...prev, [channel]: !prev[channel as keyof typeof prev] };
        if (next[channel as keyof typeof next]) {
          audio?.mute(channel as "music" | "sfx");
        } else {
          audio?.unmute(channel as "music" | "sfx");
        }
        return next;
      });
    },
    [audio],
  );

  const handleResourceThresholdCrossed = useCallback(
    (info: { resource: string; threshold: ResourceThreshold }) => {
      if (!genreSlug) {
        console.warn("[GameBoard] Resource threshold crossed but genreSlug is missing — cannot route SFX");
        return;
      }
      const sfxKey = `${genreSlug}_${info.resource.toLowerCase()}_threshold`;
      audio?.playSfx(sfxKey);
    },
    [audio, genreSlug],
  );

  const { chapterTitle } = useRunningHeader(messages, characters, currentPlayerId);

  // Per-player submission state for the simultaneous-action MP model.
  // Drives CharacterPanel's ACTING/WAITING badges (playtest 2026-05-03 [BUG]
  // floor/turn-status inconsistent across tabs). Empty in solo / single-
  // player; CharacterPanel falls back to activePlayerId-based logic when
  // ``submittedPlayerIds`` is undefined, so we only thread it through in
  // genuine MP. Mirrors the App-level ``submittedPlayerIds`` derivation
  // so a future move into a shared hook is a single-site refactor.
  const submittedPlayerIdSet = useMemo<ReadonlySet<string> | undefined>(
    () =>
      (characters?.length ?? 0) > 1
        ? new Set(turnStatusEntries.map((e) => e.player_id))
        : undefined,
    [characters?.length, turnStatusEntries],
  );

  // Story 33-11: content signals drive the mobile tab notification badges.
  // Each entry is a change-detection scalar for a tab's visible content —
  // when the value changes while that tab is inactive, MobileTabView
  // flashes a dot badge. MobileTabView compares strict-equality on the
  // values, so any encoding is fine as long as distinct states hash to
  // distinct values.
  //
  // `inventory` is a composite of two fields packed into one scalar
  // using INVENTORY_GOLD_CAP (module-scope const) as the multiplier.
  // The packing is collision-free as long as gold stays below the cap
  // (10M), which is well beyond the practical ceiling for any genre in
  // the current sprint. The prior cut used 10_000 and collided once
  // gold reached 10k — common mid-game in fantasy.
  const galleryImages = useImageBus();
  const contentSignals = useMemo<Partial<Record<WidgetId, number>>>(
    () => ({
      knowledge: knowledgeEntries?.length ?? 0,
      gallery: galleryImages.length,
      map: mapData?.explored.length ?? 0,
      inventory: inventoryData
        ? inventoryData.items.length * INVENTORY_GOLD_CAP + inventoryData.gold
        : 0,
    }),
    [knowledgeEntries, galleryImages, mapData, inventoryData],
  );

  // Render a widget by ID. Character/inventory/map data is guaranteed
  // present via PARTY_STATUS (collapsed CHARACTER_SHEET / INVENTORY model),
  // so the null branches below exist only for the brief window between
  // GameBoard mount and the first PARTY_STATUS arrival on a fresh session.
  const renderWidgetContent = useCallback((id: WidgetId): ReactNode => {
    switch (id) {
      case "narrative":
        return <NarrativeWidget messages={messages} thinking={thinking} />;
      case "character":
        return characterSheet ? (
          <CharacterWidget
            character={characterSheet}
            resources={resources}
            companions={companions}
            genreSlug={genreSlug}
            onResourceThresholdCrossed={handleResourceThresholdCrossed}
            characters={characters}
            currentPlayerId={currentPlayerId}
            activePlayerId={activePlayerId}
            submittedPlayerIds={submittedPlayerIdSet}
            magicState={magicState}
          />
        ) : null;
      case "inventory":
        return inventoryData ? <InventoryWidget data={inventoryData} /> : null;
      case "map":
        return (
          <MapWidget
            mapData={mapData ?? null}
            worldSlug={worldSlug}
            lastOrbitalChart={lastOrbitalChart ?? null}
            sendOrbitalIntent={sendOrbitalIntent}
            sessionBoundEpoch={sessionBoundEpoch}
          />
        );
      case "ship":
        // Single-chassis hardcode for v1 — coyote_star -> kestrel.
        // Multi-chassis support is a follow-on (see spec §"Out of scope").
        return worldSlug === "coyote_star" ? (
          <ShipWidget chassisInstanceId="kestrel" />
        ) : null;
      case "knowledge":
        return knowledgeEntries ? <KnowledgeWidget entries={knowledgeEntries} /> : null;
      case "confrontation":
        return confrontationData ? (
          <ConfrontationWidget
            data={confrontationData}
            outcome={confrontationOutcome ?? null}
            onBeatSelect={onBeatSelect}
            onYield={onYield}
            diceRequest={diceRequest}
            diceResult={diceResult}
            playerId={currentPlayerId}
            onDiceThrow={onDiceThrow}
          />
        ) : null;
      case "audio":
        return (
          <AudioWidget
            nowPlaying={nowPlaying}
            volumes={volumes}
            muted={muted}
            onVolumeChange={handleVolumeChange}
            onMuteToggle={handleMuteToggle}
          />
        );
      case "gallery":
        return <ImageGalleryWidget />;
      default:
        return null;
    }
  }, [messages, thinking, characterSheet, inventoryData, mapData,
      knowledgeEntries, confrontationData, confrontationOutcome, onBeatSelect, onYield, diceRequest, diceResult,
      onDiceThrow, nowPlaying, volumes, muted,
      handleVolumeChange, handleMuteToggle, resources, companions, genreSlug, worldSlug,
      handleResourceThresholdCrossed, characters, currentPlayerId,
      activePlayerId, submittedPlayerIdSet, magicState, lastOrbitalChart, sendOrbitalIntent,
      sessionBoundEpoch]);

  // InputBar component (shared between desktop grid and mobile tab view)
  const isMultiplayer =
    (characters?.length ?? 0) > 1 ||
    (turnStatusEntries?.length ?? 0) > 0 ||
    activePlayerName != null;
  const localCharacterName =
    characters?.find((c) => c.player_id === currentPlayerId)?.character_name ??
    characters?.find((c) => c.player_id === currentPlayerId)?.name ??
    null;
  const inputBar = (
    <div className="flex flex-col">
      <PeerRevealList reveals={peerReveals ?? new Map()} partyOrder={partyOrder} />
      <MultiplayerTurnBanner
        isMultiplayer={isMultiplayer}
        // ``disabled`` is true when WS is closed *or* input is locked
        // (waiting on peer, narrator thinking). For the heartbeat we want
        // strict WS-open — but we don't have that in props. Pass `true`
        // here; the OfflineBanner / ReconnectBanner above the GameBoard
        // already cover hard offline state, so the in-banner dot is a
        // soft "alive" indicator. Pulse animation conveys the heartbeat.
        wsConnected={true}
        activePlayerName={activePlayerName}
        activePlayerId={activePlayerId}
        localPlayerId={currentPlayerId}
        localCharacterName={localCharacterName}
        thinking={thinking}
        mpInputState={mpInputState}
        peersOutstanding={peersOutstanding}
      />
      <InputBar
        onSend={onSend}
        disabled={disabled}
        mobile={isMobile}
        thinking={thinking}
        waitingForPlayer={waitingForPlayer}
        onReveal={onReveal}
        round={round}
      />
    </div>
  );

  // Context value consumed by the module-level PanelAdapter. See the comment
  // block above GameBoardRenderContext for why this indirection is required.
  // Each render produces a new `renderWidget` reference when its dependencies
  // change, which updates the context and re-renders every dockview panel
  // that consumes it — bypassing dockview's frozen-component-reference trap.
  const renderContextValue = useMemo<GameBoardRenderContextValue>(
    () => ({ renderWidget: renderWidgetContent }),
    [renderWidgetContent],
  );

  // Build the initial dockview layout when the API is ready.
  // Two-region default: narrative on the left, supporting panels (character/map/gallery/audio) tabbed on the right.
  //
  // Canonical entry-point per the sq-playtest 2026-04-09 bug report:
  //   - Narrative: left panel, focused.
  //   - Right tab group: `character` is the active tab on mount.
  //     Previously the last-added tab (`audio`) was active by default because
  //     dockview's `addPanel` activates the newly-added panel. Landing on
  //     Audio broke spatial orientation on turn 1 — audio is background, the
  //     player needs the character sheet and the narrative in view.
  const onDockviewReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    dockviewApiRef.current = api;

    // Always-present panels
    const narrative = api.addPanel({
      id: "narrative",
      component: "PanelAdapter",
      params: { panelId: "narrative" as WidgetId },
      title: WIDGET_REGISTRY.narrative.label,
    });

    // Right-side group: stack ALL supporting panels as tabs of a single group.
    // Order here = left-to-right tab order. Every panel referenced here must
    // also be in `availableWidgets` (unconditional additions above) so the
    // initial layout is stable regardless of when data arrives.
    const rightGroupOrder: WidgetId[] = [
      "character",
      "inventory",
      "map",
      "knowledge",
      "gallery",
      "audio",
    ];
    let rightFirst: ReturnType<typeof api.addPanel> | null = null;
    for (const id of rightGroupOrder) {
      if (!availableWidgets.has(id)) continue;
      const def = WIDGET_REGISTRY[id];
      if (!rightFirst) {
        rightFirst = api.addPanel({
          id,
          component: "PanelAdapter",
          params: { panelId: id },
          position: { referencePanel: narrative.id, direction: "right" },
          title: def.label,
        });
      } else {
        api.addPanel({
          id,
          component: "PanelAdapter",
          params: { panelId: id },
          position: { referencePanel: rightFirst.id },
          title: def.label,
        });
      }
    }

    // Canonical active-panel state:
    // 1. Right group's active tab must be `character` (first in rightGroupOrder),
    //    not `audio` (last added and therefore dockview's default active).
    // 2. Narrative panel gets focus so keyboard input and visual emphasis
    //    land on the storytelling column, not the supporting dock.
    if (rightFirst) {
      rightFirst.api.setActive();
    }
    narrative.focus();
  }, [availableWidgets]);

  // Sync widget visibility with dockview panels (add/remove as data-gates change).
  // In practice this only fires for `confrontation` — every other widget is
  // unconditional in `availableWidgets`, so the initial `onDockviewReady`
  // pass creates them once and this effect has nothing to add on their behalf.
  //
  // When a dynamic panel is added, anchor it to an existing right-group panel
  // (`character` is the most stable reference) so it joins the tab strip
  // instead of being created in a detached floating group.
  useEffect(() => {
    const api = dockviewApiRef.current;
    if (!api) return;

    const dockviewIds = new Set(api.panels.map((p) => p.id));

    // Remove panels that became unavailable
    for (const id of dockviewIds) {
      if (!availableWidgets.has(id as WidgetId)) {
        const panel = api.getPanel(id);
        if (panel) api.removePanel(panel);
      }
    }

    // Add panels that became available — anchor to `character` so dynamic
    // additions join the right tab group. Fall back to `narrative` if the
    // character panel was somehow removed.
    const anchorId = dockviewIds.has("character")
      ? "character"
      : dockviewIds.has("narrative")
        ? "narrative"
        : null;

    for (const id of availableWidgets) {
      if (!dockviewIds.has(id)) {
        const def = WIDGET_REGISTRY[id];
        api.addPanel({
          id,
          component: "PanelAdapter",
          params: { panelId: id },
          title: def.label,
          ...(anchorId ? { position: { referencePanel: anchorId } } : {}),
        });
      }
    }
  }, [availableWidgets]);

  // Confrontation rendering is handled entirely by the dockview
  // `ConfrontationWidget` tab (see `renderWidgetContent("confrontation")`
  // and the auto-show effect above). The old bottom-docked
  // `<ConfrontationOverlay/>` was a book-era artifact retained after the
  // UI redesign that moved confrontations into the persistent sidebar —
  // it double-rendered the same data AND its `fixed inset-x-0 bottom-0`
  // positioning overlapped the InputBar, absorbing all input and blocking
  // every action. Removed outright. The tab auto-opens on
  // `confrontationData` arrival and auto-closes when it clears.

  // Running header (shared by mobile and desktop). Mobile users were
  // previously trapped in-session because the header — and its Leave button
  // — only rendered in the desktop branch (playtest 2026-04-23).
  const runningHeader = (
    <div
      data-testid="running-header"
      className="flex items-baseline justify-between px-6 py-2 border-b border-border/50 bg-[var(--surface,theme(colors.card))] shrink-0 z-10"
    >
      <span className="text-xs tracking-widest uppercase text-muted-foreground/50 font-light">
        {chapterTitle ?? "\u00A0"}
      </span>
      <div className="flex items-center gap-2">
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/50"
            title="Return to lobby"
          >
            Leave
          </button>
        )}
      </div>
    </div>
  );

  // Mobile fallback
  if (isMobile) {
    return (
      <MobileTabView
        renderWidget={renderWidgetContent}
        availableWidgets={availableWidgets}
        contentSignals={contentSignals}
        header={runningHeader}
      >
        {inputBar}
      </MobileTabView>
    );
  }

  return (
    <GameBoardRenderContext.Provider value={renderContextValue}>
    <div data-testid="game-board" className="flex flex-col h-screen overflow-hidden">
      <BackgroundCanvas />

      {runningHeader}

      {/* Depletion/resource alerts */}
      {depletions && depletions.length > 0 && (
        <div data-testid="depletion-alerts" className="px-4 py-2 space-y-1 shrink-0">
          {depletions.map((d, i) => (
            <div key={`depletion-${i}`} data-testid={`depletion-${d.item_name}`} className="text-sm px-3 py-1.5 rounded bg-destructive/15 text-destructive border border-destructive/30">
              <span className="font-medium">{d.item_name}</span> depleted
            </div>
          ))}
        </div>
      )}
      {resourceAlerts && resourceAlerts.length > 0 && (
        <div data-testid="resource-alerts" className="px-4 py-2 space-y-1 shrink-0">
          {resourceAlerts.map((r, i) => (
            <div key={`resource-${i}`} data-testid={`resource-alert-${r.resource_name}`} className="text-sm px-3 py-1.5 rounded bg-warning/15 text-warning border border-warning/30">
              <span className="font-medium">{r.resource_name}</span> at minimum ({r.min_value})
            </div>
          ))}
        </div>
      )}

      {/* Dockview workspace — tabbed groups, drag tabs between groups, no z-index */}
      <div className="sidequest-dockview flex-1 min-h-0">
        <DockviewReact
          className="dockview-container dockview-theme-abyss"
          onReady={onDockviewReady}
          components={DOCKVIEW_COMPONENTS}
          watermarkComponent={() => null}
        />
      </div>

      {/* Turn status — canonical multi-PC turn coordination signal.
          Renders ONLY the structured TurnStatusPanel ("Waiting on:" widget)
          which is load-bearing for sealed-letter chargen turns. The plain
          `[ Paul's turn ]` / `[ Your turn ]` chip was removed as part of the
          S2-UX banner-cluster dedupe (2026-04-26): the new
          MultiplayerTurnBanner above the InputBar already announces whose
          turn it is, the CharacterPanel party-section ACTING badge gives
          the spatially-located cue, and the InputBar placeholder
          ("Waiting for X…") covers input gating. Keeping all four was
          quadruple-banner ambiguity. The structured TurnStatusPanel branch
          stays because it's a richer per-player roster, not a duplicate
          of "whose turn it is". */}
      {characters.length > 1 && activePlayerName && turnStatusEntries.length > 0 && (
        <div
          data-testid="turn-indicator"
          className="px-4 py-1.5 text-xs text-center text-muted-foreground/60 border-t border-border/30 bg-card/20 shrink-0"
        >
          <TurnStatusPanel
            entries={turnStatusEntries}
            localPlayerId={currentPlayerId}
            gameMode="structured"
          />
        </div>
      )}

      {/* InputBar — pinned to bottom */}
      <div className="input-area border-t border-border/50 px-4 py-4 bg-card/50 shrink-0 max-w-5xl mx-auto w-full">
        {inputBar}
      </div>
    </div>
    </GameBoardRenderContext.Provider>
  );
}
