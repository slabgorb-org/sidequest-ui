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

import InputBar, {
  type InputBarHandle,
  type InputBarRevealCall,
} from "@/components/InputBar";
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
import {
  ConfrontationOverlay,
  type ConfrontationData,
  type ConfrontationOutcome,
} from "@/components/ConfrontationOverlay";
import type { KnowledgeEntry, ItemDepletion, ResourceAlert } from "@/providers/GameStateProvider";
import type { ResourcePool } from "@/components/CharacterPanel";
import type { CharacterSummary, CompanionSummary } from "@/types/party";
import type { useAudio } from "@/hooks/useAudio";
import type { NowPlaying } from "@/hooks/useAudioCue";
import type { GameMessage } from "@/types/protocol";
import type {
  DiceRequestPayload,
  DiceResultPayload,
  DiceThrowParams,
  LocationDescriptionPayload,
  RelationshipEntryPayload,
  QuestsPayload,
  FateStatePayload,
  FateRollPayload,
  ActionRevealEntry,
} from "@/types/payloads";
import type { PeerReveal } from "@/hooks/usePeerReveals";
import { PeerRevealList } from "@/components/PeerRevealList";
import { HpPipScale } from "@/components/HpPipScale";
import type { LayoutMode } from "@/hooks/useLayoutMode";
import type { MagicState } from "@/types/magic";
import type { OrbitalIntent, OrbitalIntentError, OrbitalIntentResponse } from "@/types/orbital-intent";

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
import { LocationWidget } from "./widgets/LocationWidget";
import { RelationshipsWidget } from "./widgets/RelationshipsWidget";
import { QuestsWidget } from "./widgets/QuestsWidget";
import { FateWidget } from "./widgets/FateWidget";
import {
  FateConflictSurface,
  type FateActionInput,
} from "@/components/FateConflictSurface";
// ConfrontationWidget removed 2026-05-13 — confrontation rendered as a bottom
// strip between the dockview workspace and the InputBar (D2 mock) until Story
// 85-3 (2026-06-04) promoted it BACK into the dockview as the data-gated
// `confrontation` panel. See widgetRegistry.ts + renderWidgetContent.
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
  /**
   * Story 54-9 / ADR-109: persistent location description for the
   * current room. Mirrored from state.currentLocation. Null when no
   * manifest has been delivered yet; the location tab is hidden in
   * that state (dataGated, gated in availableWidgets below).
   */
  currentLocation?: LocationDescriptionPayload | null;
  /**
   * The active world's cartography navigation mode (`"region"` /
   * `"room_graph"` / `"hierarchical"`), or undefined when the world has no
   * location capability. Sourced from the `/api/genres` WorldMeta. The
   * Location tab's *existence* is gated on this STABLE signal rather than on
   * `currentLocation` presence, so it does not flicker in/out when a reconnect
   * re-baselines `currentLocation` to null (2026-05-21 glenross playtest).
   */
  navMode?: string;
  audio?: ReturnType<typeof useAudio>;
  nowPlaying?: NowPlaying | null;
  // journalEntries prop removed playtest 2026-04-11 along with the Handouts
  // tab. The JournalEntry type and gameState.journal pipeline are kept in
  // the provider so the feature can be revived without re-plumbing data.
  knowledgeEntries?: KnowledgeEntry[];
  /**
   * ADR-136: NPC relationship roster, mirrored from state.relationships.
   * Null/empty until a RELATIONSHIPS snapshot arrives; the Relationships tab
   * is gated on data presence in availableWidgets below (no one met yet → no
   * tab clutter), mirroring the knowledge data-gate.
   */
  relationshipsData?: RelationshipEntryPayload[] | null;
  /**
   * Story 77-5 / ADR-137: player-facing quest spine, mirrored from
   * state.questsData. Null until a QUESTS snapshot arrives; the Quests tab is
   * always present (dataGated:false) and renders an empty state until then,
   * mirroring the relationships tab.
   */
  questsData?: QuestsPayload | null;
  /**
   * Story 118-2 / ADR-144 F3b: player-facing Fate sheet, mirrored from
   * state.fateState. Null until a FATE_STATE snapshot arrives — and it only
   * ever arrives on a ruleset=='fate' pack (server gate). The Fate tab is
   * dataGated:true and added to availableWidgets only when this is non-null, so
   * it never co-renders with the WN/native ConfrontationOverlay (epic 118).
   */
  fateData?: FateStatePayload | null;
  /**
   * Story 118-7 (F3g) + 118-6 (F3f) / ADR-144: the latest resolved 4dF roll
   * (state.latestFateRoll). Null until a FATE_ROLL event arrives (only ever on a
   * ruleset=='fate' pack). One slice, two consumers: the Fate panel's FateWidget
   * threads it so the FateDiceTray mounts (F3g), and the Fate conflict surface
   * composes it (F3f).
   */
  latestFateRoll?: FateRollPayload | null;
  /**
   * Story 118-6 / ADR-144 F3f: the player committed a Fate action from the
   * conflict surface (a proactive tile, an invoke-bearing action, or a concede).
   * App serializes it onto a FATE_ACTION message over the WebSocket (the F1d
   * explicit channel — the server is the economy + validation authority).
   */
  onFateAction?: (action: FateActionInput) => void;
  confrontationData?: ConfrontationData | null;
  /** Phase 5 (Story 47-3): branch-explicit outcome reveal payload. */
  confrontationOutcome?: ConfrontationOutcome | null;
  /**
   * Beat tile click. The optional ``playerAction`` carries whatever the
   * player typed into the InputBar at the moment of the click — beats
   * are an alternate submit verb for whatever's in the field (D2
   * confrontation panel, 2026-05-13). GameBoard reads the InputBar's
   * draft via an imperative ref and forwards it here; App attaches it
   * to the DICE_THROW so the narrator runs with both the mechanical
   * outcome AND the player's invention.
   *
   * `spellId` (story 102-2): the prepared spell chosen in the overlay's
   * "Work a Spell" picker — present only on a cast-beat commit. Rides
   * ALONGSIDE the typed draft (the picker augments typed text, never
   * replaces it — Zork Problem guardrail); App attaches it to the
   * DICE_THROW as `spell_id` so the server routes the WN cast spine.
   */
  onBeatSelect?: (beatId: string, playerAction?: string, spellId?: string) => void;
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
  /** Server-announced orbital capability (GameResponse.orbital — world ships
   * orbital content). Capability signal only since ADR-141 / 98-3 — MapWidget
   * routes cluster worlds to the campaign graph and only collapses to
   * orrery-as-Map for single-system worlds. Replaces the per-world frontend
   * allowlist (sq-playtest 2026-06-07 perseus orrery). */
  worldOrbital?: boolean;
  /** Story 71-4: per-round persisted peer actions (firewall-filtered) — threaded to the narrative widget. */
  peerActionsByRound?: Map<number, ActionRevealEntry[]>;
  depletions?: ItemDepletion[];
  resourceAlerts?: ResourceAlert[];
  /** Magic ledger (Coyote Star Phase 4). Forwarded to CharacterWidget. */
  magicState?: MagicState | null;
  /** Latest ORBITAL_CHART response — feeds MapWidget's orbital chart panel. */
  lastOrbitalChart?: OrbitalIntentResponse | null;
  /** Latest ORBITAL_INTENT rejection — feeds MapWidget's AC5 "no local
   * chart" state (ADR-141 / 98-3). Cleared upstream on a fresh chart. */
  lastOrbitalError?: OrbitalIntentError | null;
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
  /**
   * Draft restoration channel (sq-playtest 2026-06-07 silent blocked-paused
   * drop): when the server bounces a submitted action with GAME_PAUSED, App
   * bumps the epoch and InputBar re-fills the (optimistically cleared)
   * field with the dropped text.
   */
  restoredDraft?: { text: string; epoch: number } | null;
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
  currentLocation = null,
  audio,
  nowPlaying = null,
  knowledgeEntries,
  relationshipsData = null,
  questsData = null,
  fateData = null,
  latestFateRoll = null,
  onFateAction,
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
  worldOrbital = false,
  peerActionsByRound,
  navMode,
  depletions,
  resourceAlerts,
  magicState,
  lastOrbitalChart,
  lastOrbitalError,
  sendOrbitalIntent,
  sessionBoundEpoch = 0,
  peerReveals,
  partyOrder = [],
  onReveal,
  round = 0,
  restoredDraft = null,
}: GameBoardProps) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";

  // Layout management — dockview handles its own layout state internally,
  // but we still use show/hide tracking for hotkeys.
  const { toggleWidget } = useGameBoardLayout(genreSlug, worldSlug);

  const dockviewApiRef = useRef<DockviewApi | null>(null);
  // Story 118-6: a render-trigger for the panel-sync effect so it re-runs once the
  // dockview API is ready. Without it, a data-gated dynamic panel that is ALREADY
  // available at mount (e.g. reconnecting mid-conflict — fateData.conflict.active,
  // or mid-confrontation) is never added: the sync effect's first run sees a null
  // api and returns, and availableWidgets does not change afterward to re-trigger it.
  const [dockviewReady, setDockviewReady] = useState(false);

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
  // Confrontation is NOT a widget — see widgetRegistry.ts. It mounts as a
  // dedicated panel in the input area below the dockview workspace.
  const availableWidgets = useMemo(() => {
    const available = new Set<WidgetId>();
    available.add("narrative");
    available.add("character");
    available.add("relationships");
    available.add("quests");
    // Story 126-3 (ADR-144): hide the native Inventory tab on Fate packs. Fate
    // has no carried inventory and no economy — the 114-10 migration (#472)
    // deleted inventory.yaml for the four Fate packs and gear dissolves into
    // aspects (via source_gear), so a Fate PC who opened Inventory would only
    // see an empty native panel (items:[], gold:0). `fateData == null` is the
    // ruleset!='fate' signal: the server emits FATE_STATE only on a Fate pack
    // (server #880), the same gate the Fate tab uses below. Both the desktop
    // dockview and MobileTabView read this set, so this one gate covers both
    // surfaces. UI-only — no inventory data is touched (ADR-144 keeps
    // inventory.items/gold unpopulated server-side).
    if (fateData == null) {
      available.add("inventory");
    }
    available.add("map");
    available.add("knowledge");
    available.add("gallery");
    available.add("audio");
    if (worldSlug === "coyote_star") available.add("ship");
    // Story 54-9 / ADR-109: the Location tab is gated on the world's STABLE
    // navigation mode (region / room_graph), NOT on whether a
    // LOCATION_DESCRIPTION has arrived. Gating on the transient
    // `currentLocation` made the tab blink in/out on every reconnect (a
    // --reload restart re-baselines it to null) — Keith flagged this as
    // "confusing ui" in the 2026-05-21 glenross playtest. With a stable
    // signal the tab is present from mount for cartography worlds and the
    // panel renders a loading state until content arrives; worlds with no
    // cartography (navMode undefined) never show the tab. `hierarchical` is
    // not yet wired into any live world, so it is intentionally excluded.
    if (navMode === "region" || navMode === "room_graph") {
      available.add("location");
    }
    // Story 118-2 / ADR-144 F3b: the Fate tab is ruleset-gated. The server emits
    // FATE_STATE only on a ruleset=='fate' pack, so gating the tab on
    // `fateData != null` keeps it off the 7 WN/native packs entirely — it can
    // never sit beside the beat/dial ConfrontationOverlay (epic 118). This is
    // the UI realization of the ruleset gate and the paired negative test.
    if (fateData != null) {
      available.add("fate");
    }
    // Story 118-6 / ADR-144 F3f: the Fate conflict surface claims the canvas ONLY
    // while a Fate conflict is ACTIVE — gated on fateData.conflict.active (the Fate
    // analog of confrontationData). A WN/native pack never emits a Fate conflict,
    // so this can never co-render with the ConfrontationOverlay (the epic-118
    // paired negative). Distinct from the always-available Fate SHEET tab above.
    if (fateData?.conflict?.active === true) {
      available.add("fate-conflict");
    }
    // Story 85-3 (Tier B): confrontation mode claims the canvas ONLY while an
    // encounter is active — data-gated on confrontationData. The sync effect
    // below adds the panel (and auto-focuses it) when this set gains
    // "confrontation", and removes it on resolution.
    if (confrontationData != null) {
      available.add("confrontation");
    }
    return available;
  }, [worldSlug, navMode, fateData, confrontationData]);

  // Hotkeys — unchanged signature; confrontation never had one.
  useGameBoardHotkeys(toggleWidget, availableWidgets);

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

  // Authoritative per-player seal set — only status='submitted' /
  // 'auto_resolved'. The single source of truth for "this peer has acted",
  // shared by every consumer that paints seal state: PeerRevealList (the
  // action-area banner) AND CharacterPanel (the party-row ACTING/WAITING
  // badges, via the length-gated prop below).
  //
  // History: a second loose set (`submittedPlayerIdSet` = every entry's
  // player_id, regardless of status) used to feed CharacterPanel while this
  // precise set fed PeerRevealList. The two diverged on an observer tab —
  // banner said "✓ submitted", party panel still said "ACTING" for the same
  // peer (sq-playtest 2026-05-16 [BUG] party-panel peer label). One set, one
  // truth: both consumers now read this. The "loose set includes pending"
  // rationale was itself stale post-2026-05-15 carried-#5 (App no longer
  // pushes pending rows), so the loose memo was deleted, not retained.
  const sealedPlayerIds = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        turnStatusEntries
          .filter((e) => e.status === "submitted" || e.status === "auto_resolved")
          .map((e) => e.player_id),
      ),
    [turnStatusEntries],
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
      gallery: galleryImages?.length ?? 0,
      map: mapData?.explored?.length ?? 0,
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
  // The beat-tile click goes through ``handleBeatTileSelect`` which reads the
  // InputBar's draft text via an imperative ref and forwards it to the
  // App-level ``onBeatSelect``. That gives App.handleBeatSelect both the beat id
  // AND the chandelier-swing the player typed, so the resulting DICE_THROW can
  // carry ``player_action`` to the server. Declared above renderWidgetContent
  // (Story 85-3) because the confrontation dockview panel renders through it.
  const inputBarRef = useRef<InputBarHandle | null>(null);
  const handleBeatTileSelect = useCallback(
    (beatId: string, spellId?: string) => {
      const draft = inputBarRef.current?.consumeDraft() ?? "";
      onBeatSelect?.(beatId, draft, spellId);
    },
    [onBeatSelect],
  );

  const renderWidgetContent = useCallback((id: WidgetId): ReactNode => {
    switch (id) {
      case "narrative":
        return <NarrativeWidget messages={messages} thinking={thinking} genreSlug={genreSlug} worldSlug={worldSlug} peerActionsByRound={peerActionsByRound} />;
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
            // MP only: feed the authoritative seal set (same one
            // PeerRevealList reads, so banner and party panel can never
            // disagree). Solo / single-PC stays undefined so CharacterPanel
            // keeps its documented activePlayerId fallback contract.
            submittedPlayerIds={
              (characters?.length ?? 0) > 1 ? sealedPlayerIds : undefined
            }
            magicState={magicState}
          />
        ) : null;
      case "inventory":
        return inventoryData ? <InventoryWidget data={inventoryData} /> : null;
      case "map":
        return (
          <MapWidget
            mapData={mapData ?? null}
            orbital={worldOrbital}
            lastOrbitalChart={lastOrbitalChart ?? null}
            lastOrbitalError={lastOrbitalError ?? null}
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
      case "relationships":
        // Always render — RelationshipsPanel shows an empty state when data is
        // null/empty. Tab is always present from session start (playtest 2026-06-04).
        return <RelationshipsWidget data={relationshipsData ?? null} />;
      case "quests":
        // Always render — QuestsPanel shows an empty state when the spine is
        // null/empty. Tab is always present from session start (Story 77-5).
        return <QuestsWidget data={questsData ?? null} />;
      case "fate":
        // Story 118-2 / ADR-144 F3b: the Fate sheet. The tab only exists when
        // fateData is present (dataGated:true gate above), but render
        // defensively — FatePanel shows an empty state for null/empty data.
        // Story 118-7 / ADR-144 F3g: thread the latest 4dF roll + the ruleset so
        // the FateDiceTray mounts. The tab is reachable only when fateData !=
        // null (a ruleset=='fate' pack), so the ruleset is "fate" here — which
        // keeps the roll surface off the WN/native ConfrontationOverlay.
        return (
          <FateWidget
            data={fateData ?? null}
            latestRoll={latestFateRoll ?? null}
            ruleset={fateData != null ? "fate" : ""}
          />
        );
      case "fate-conflict": {
        // Story 118-6 / ADR-144 F3f: the Fate conflict surface. Reachable only
        // while a Fate conflict is active (gated in availableWidgets). actorName is
        // the local PC's character name — it drives whose sheet powers the Invoke
        // economy. ``ruleset="fate"`` is honest here: the surface is conflict-gated
        // upstream, and a Fate conflict only ever exists on a ruleset=='fate' pack.
        // The shared latestFateRoll slice (F3g) feeds the surface's own fateRoll prop.
        const fateActor =
          characters?.find((c) => c.player_id === currentPlayerId)?.character_name ??
          characters?.find((c) => c.player_id === currentPlayerId)?.name ??
          "";
        const fateSealed = currentPlayerId != null && sealedPlayerIds.has(currentPlayerId);
        return (
          <FateConflictSurface
            fateState={fateData ?? null}
            fateRoll={latestFateRoll ?? null}
            ruleset="fate"
            actorName={fateActor}
            sealedWaiting={fateSealed}
            onFateAction={onFateAction}
          />
        );
      }
      case "location": {
        // Story 85-2: the Location-tab header reads as a "Region — Subregion"
        // breadcrumb. The region is the shared LOCATION_DESCRIPTION payload;
        // the subregion is the LOCAL player's per-PC current_location (the same
        // every-turn-fresh value useRunningHeader uses). Composed client-side —
        // never a peer's location (preserves the per-PC scene invariant).
        const localSubregion = characters?.find(
          (c) => c.player_id === currentPlayerId,
        )?.current_location;
        return (
          <LocationWidget
            data={currentLocation ?? null}
            subregion={localSubregion}
          />
        );
      }
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
      case "confrontation": {
        // Story 85-3 (Tier B): confrontation mode renders here, in the
        // auto-focused dockview panel (not the old bottom strip). Beat tiles
        // still read the InputBar draft via handleBeatTileSelect → the
        // chandelier-swing the player typed rides the commit (the InputBar
        // lives on, SPLIT alongside this panel — never a takeover).
        if (!confrontationData) return null;
        // The Guitar Solo: the non-soloing players' concurrent verbs this round
        // (exclude the local player and OOC asides) feed the "meanwhile at the
        // table" strip so a solo never becomes silence. Collapses when empty.
        const meanwhile = (peerActionsByRound?.get(round) ?? [])
          .filter((e) => e.player_id !== currentPlayerId && !e.aside)
          .map((e) => ({ actor: e.character_name, verb: e.action }));
        return (
          <ConfrontationOverlay
            data={confrontationData}
            meanwhileActions={meanwhile}
            outcome={confrontationOutcome ?? null}
            onBeatSelect={handleBeatTileSelect}
            onYield={onYield}
            diceRequest={diceRequest}
            diceResult={diceResult}
            playerId={currentPlayerId}
            onDiceThrow={onDiceThrow}
          />
        );
      }
      default:
        return null;
    }
  }, [messages, thinking, characterSheet, inventoryData, mapData,
      currentLocation, knowledgeEntries, relationshipsData, questsData, fateData, latestFateRoll, nowPlaying, volumes, muted,
      handleVolumeChange, handleMuteToggle, resources, companions, genreSlug, worldSlug,
      worldOrbital, peerActionsByRound,
      handleResourceThresholdCrossed, characters, currentPlayerId,
      onFateAction,
      activePlayerId, sealedPlayerIds, magicState, lastOrbitalChart, lastOrbitalError,
      sendOrbitalIntent, sessionBoundEpoch,
      // Story 85-3: confrontation-mode panel inputs.
      confrontationData, confrontationOutcome, handleBeatTileSelect, onYield,
      diceRequest, diceResult, onDiceThrow, round]);

  // InputBar component (shared between desktop grid and mobile tab view)
  const isMultiplayer =
    (characters?.length ?? 0) > 1 ||
    (turnStatusEntries?.length ?? 0) > 0 ||
    activePlayerName != null;
  const localCharacterName =
    characters?.find((c) => c.player_id === currentPlayerId)?.character_name ??
    characters?.find((c) => c.player_id === currentPlayerId)?.name ??
    null;
  // Story 85-3 (Tier B): confrontation no longer mounts as a bottom strip here
  // — it renders in the auto-focused `confrontation` dockview panel (see
  // renderWidgetContent + availableWidgets). `inputBarRef` / `handleBeatTileSelect`
  // moved ABOVE renderWidgetContent (the panel needs them); the InputBar still
  // owns the ref below, SPLIT alongside the panel so typed creative actions
  // (the chandelier swing) survive the promotion.
  const inputBar = (
    <div data-testid="gameboard-input-region" className="flex flex-col w-full">
      <PeerRevealList
        reveals={peerReveals ?? new Map()}
        partyOrder={partyOrder}
        sealedPlayerIds={sealedPlayerIds}
      />
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
      {/* Slow-typist reassurance (sq-playtest 2026-05-27, for Alex): when a
          peer has already sealed and the local player is still composing,
          a calm, TIMER-FREE line tells them they aren't holding the table
          up. Never a countdown/progress bar — the submit-and-wait barrier
          exists precisely to remove time pressure (ADR-036). */}
      {isMultiplayer &&
        mpInputState === "free" &&
        sealedPlayerIds &&
        [...sealedPlayerIds].some((id) => id !== currentPlayerId) && (
          <p
            data-testid="slow-typist-reassurance"
            role="note"
            className="px-3 py-1 mb-1 text-xs italic text-foreground/75"
          >
            Sealed actions are waiting with you — take your time. The story
            continues once everyone&apos;s ready.
          </p>
        )}
      <InputBar
        ref={inputBarRef}
        onSend={onSend}
        disabled={disabled}
        mobile={isMobile}
        thinking={thinking}
        waitingForPlayer={waitingForPlayer}
        onReveal={onReveal}
        round={round}
        confrontationActive={confrontationData != null}
        restoredDraft={restoredDraft}
      />
      {/* Co-located high-contrast HP pip scale (Story 69-2): keeps the local
          player's HP glanceable right at the input for mechanics-first
          players, without a Dockview tab switch. Hierarchy: input → HP. */}
      <HpPipScale characters={characters} currentPlayerId={currentPlayerId} />
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
    // Re-trigger the panel-sync effect now that the api exists, so a dynamic panel
    // available at mount (mid-conflict / mid-confrontation reconnect) is added.
    setDockviewReady(true);

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
      "relationships",
      "quests",
      "fate",
      "fate-conflict",
      "inventory",
      "map",
      "location",
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
  // Fires for the data-gated widgets: `confrontation` (Story 85-3 — added when
  // an encounter starts, removed on resolution), plus `location`/`ship` on
  // world/nav changes. The unconditional widgets are created once by the initial
  // `onDockviewReady` pass, so this effect has nothing to add on their behalf.
  //
  // When a dynamic panel is added, anchor it to an existing right-group panel
  // (`character` is the most stable reference) so it joins the tab strip
  // instead of being created in a detached floating group. `confrontation`
  // additionally auto-FOCUSES (it's the drama peak — Cost Scales with Drama);
  // its removal on resolution lets dockview re-activate a sibling tab, which is
  // the "release focus on resolution" half of AC2.
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
        const panel = api.addPanel({
          id,
          component: "PanelAdapter",
          params: { panelId: id },
          title: def.label,
          ...(anchorId ? { position: { referencePanel: anchorId } } : {}),
        });
        // Story 85-3 (Tier B) / 118-6 (F3f): confrontation and its Fate analog
        // auto-focus the moment they appear so the drama peak claims the canvas
        // (AC2). Other dynamic panels join the tab strip without stealing focus.
        if (id === "confrontation" || id === "fate-conflict") {
          panel.api.setActive();
        }
      }
    }
  }, [availableWidgets, dockviewReady]);

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
