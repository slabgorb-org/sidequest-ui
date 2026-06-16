import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ConnectScreen } from "@/screens/ConnectScreen";
import { ReferenceLorePage } from "@/screens/reference/ReferenceLorePage";
import { ReferenceRulesPage } from "@/screens/reference/ReferenceRulesPage";
import { CharacterCreation, type CreationScene } from "@/components/CharacterCreation/CharacterCreation";
import type { PortraitOption } from "@/components/CharacterCreation/PortraitPanel";
import { GameBoard } from "@/components/GameBoard/GameBoard";
import type { FateActionInput } from "@/components/FateConflictSurface";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { ResourcePool } from "@/components/CharacterPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GameStateProvider, useGameState } from "@/providers/GameStateProvider";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useAssetPreload, type SessionAsset } from "@/hooks/useAssetPreload";
import { useGenreTheme } from "@/hooks/useGenreTheme";
import {
  useChromeArchetype,
  getArchetypeForGenre,
  type ChromeArchetype,
} from "@/hooks/useChromeArchetype";
import { useAudioCue } from "@/hooks/useAudioCue";
import { useAudio } from "@/hooks/useAudio";
import { useStateMirror } from "@/hooks/useStateMirror";
import { useSlashCommands } from "@/hooks/useSlashCommands";
import { useGameBoardLayout } from "@/hooks/useGameBoardLayout";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import {
  MessageType,
  type GameMessage,
  type NarratorVerbosity,
  type NarratorVocabulary,
} from "@/types/protocol";
import { makeRequestId } from "@/lib/utils";
import { loadNarratorPrefs, saveNarratorPrefs } from "@/lib/narratorPrefs";
import { beatDispatchBlockReason, isItemUseBeat } from "@/lib/beatDispatch";
import { toCharacterSummary, toCharacterSheetData } from "@/lib/partyStatusMapping";
import {
  computeSubmittedPlayerIds,
  mergePeerRevealsWithSubmittedStatus,
} from "@/lib/turnStatusDerivation";
import type { CharacterSheetData } from "@/components/CharacterSheet";
import type { InventoryData } from "@/components/InventoryPanel";
import type { ExploredLocation, MapState } from "@/components/MapOverlay";
import type { CharacterSummary, CompanionSummary } from "@/types/party";
import type { ConfrontationData, BeatOption, ConfrontationOutcome } from "@/components/ConfrontationOverlay";
import type { TurnStatusEntry } from "@/components/TurnStatusPanel";
import type { DiceRequestPayload, DiceResultPayload, DiceThrowParams, ErrorPayload, ActionRevealEntry, CharacterIncapacitatedPayload, ResourcePoolPayload } from "@/types/payloads";
import type { InputBarRevealCall } from "@/components/InputBar";
import { usePeerReveals } from "@/hooks/usePeerReveals";
import { usePersistedPeerActions } from "@/hooks/usePersistedPeerActions";
import type {
  OrbitalIntent,
  OrbitalIntentError,
  OrbitalIntentResponse,
} from "@/types/orbital-intent";
import type { GenresResponse } from "@/types/genres";
import { MultiplayerSessionStatus, type SessionPlayerStatus } from "@/components/MultiplayerSessionStatus";
import { ReconnectBanner } from "@/components/ReconnectBanner";
import { PausedBanner } from "@/components/PausedBanner";
import { DeathBanner } from "@/components/DeathBanner";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useDisplayName } from "@/hooks/useDisplayName";
import { usePeerEventCache } from "@/hooks/usePeerEventCache";
import { appendHistory, loadHistory } from "@/screens/lobby/historyStore";

const LazyDashboard = lazy(() =>
  import("@/components/Dashboard/DashboardApp").then((m) => ({ default: m.DashboardApp })),
);

// DiceOverlay overlay removed — dice now render inline in the Confrontation panel
// via InlineDiceTray. The DiceOverlay component and DiceSpikePage are retained
// for isolated testing.

type SessionPhase = "connect" | "creation" | "game";

/**
 * The chrome archetype for the document root. The lobby (`connect`) renders
 * the neutral `house` chrome so it never inherits the last-entered world's
 * genre theme; once a world is committed (creation/game) the genre archetype
 * applies. Exported for wiring tests.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveRootArchetype(
  phase: SessionPhase,
  currentGenre: string | null,
): ChromeArchetype | null {
  if (phase === "connect") return "house";
  return currentGenre ? getArchetypeForGenre(currentGenre) : null;
}

// Server ERROR codes that mean the session is unrecoverable and the user
// must escape (full-screen fatal panel, disconnect WS, no auto-reconnect).
// Anything NOT in this set is treated as a transient per-message rejection
// — the WS stays open and a sanitized banner surfaces the failure. Add
// new codes here only when the server has *also* set reconnect_required to
// stop the reconnect loop; otherwise the client and server disagree about
// recovery and the user gets stuck on a fatal panel that the server
// doesn't think is fatal.
const FATAL_ERROR_CODES: ReadonlySet<string> = new Set([
  "save_schema_invalid",
]);

// Strip Pydantic-validation noise from a server ERROR message before
// surfacing it to the player. The raw `validation error for GameMessage`
// dump (with field-path lines like `payload.targetStep — Extra inputs are
// not permitted` and `errors.pydantic.dev/...` URLs) is useful in OTEL
// and the dev console but not for end-users — they need an action-shaped
// sentence, not a schema dump. Keep the first non-empty line up to a
// reasonable length; everything after the first `\n` is internal detail.
function sanitizeErrorMessage(raw: string): string {
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  // Pydantic prefixes errors with `N validation errors for X` — replace
  // with player-shaped copy. Anything else: pass through truncated.
  if (/validation errors? for /i.test(firstLine)) {
    return "That action couldn't be processed. Your session is still active.";
  }
  return firstLine.length > 200 ? firstLine.slice(0, 197) + "…" : firstLine;
}

const SESSION_KEY = "sidequest-session";

// SavedSession stores the game_slug + mode (MP-01 + playtest 2026-04-30
// follow-on). Mode tells the auto-reconnect navigate path whether the URL
// prefix should be /play/ (multiplayer) or /solo/ (solo). Pre-fix, the
// auto-reconnect always wrote /solo/<slug> regardless of mode — on a
// reload that briefly bounced through "/" the MP URL got rewritten to
// /solo/, half the tabs ended up on /solo/<MP-slug> while the other half
// stayed on /play/<MP-slug>, and `/solo/` semantics could diverge later
// (different reducers, different reconnect path, different side panels).
// Old saved sessions without `mode` default to "solo" — matches pre-fix
// behavior for any persisted entry written before this change.
interface SavedSession {
  gameSlug: string;
  mode?: "solo" | "multiplayer";
}

function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedSession;
    if (data.gameSlug) return data;
    return null;
  } catch {
    return null;
  }
}

function saveSession(gameSlug: string, mode: "solo" | "multiplayer") {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ gameSlug, mode }));
  } catch {
    // non-critical
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // non-critical
  }
}


// Bug 2: HMR state persistence — survive Vite hot reload without losing game progress
const HMR_STATE_KEY = "sidequest-hmr-state";

interface HmrState {
  messages: GameMessage[];
  sessionPhase: SessionPhase;
  character: Record<string, unknown> | null;
}

function loadHmrState(): HmrState | null {
  try {
    const raw = sessionStorage.getItem(HMR_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HmrState;
  } catch {
    return null;
  }
}

function saveHmrState(state: HmrState): void {
  try {
    // Keep only the last 100 messages to avoid quota issues
    const trimmed = {
      ...state,
      messages: state.messages.slice(-100),
    };
    sessionStorage.setItem(HMR_STATE_KEY, JSON.stringify(trimmed));
  } catch {
    // non-critical — quota exceeded
  }
}

// NamePrompt — shown in slug-mode when the joining player has not yet
// confirmed an identity for *this* slug. `initialValue` pre-fills the input
// from the cached `sq:display-name` (if any) but is treated as a *suggestion*,
// not an identity — the player must hit Begin to confirm. This avoids the
// silent "stale localStorage rebinds you to a different player" class of bug
// (see playtests 2026-04-25 "Lenny resumed Laverne" and 2026-04-26 "Richie /
// Potsie"). Keep it minimal — we don't reuse ConnectScreen because that
// requires genres data and the full lobby UI; at slug-arrival we only need
// a name.
function NamePrompt({
  onSubmit,
  initialValue = "",
}: {
  onSubmit: (name: string) => void;
  initialValue?: string;
}) {
  const [v, setV] = useState(initialValue);
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-screen gap-8">
      <div aria-hidden="true" className="text-muted-foreground/30 text-sm tracking-[0.5em]">
        ── ◇ ──
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onSubmit(v.trim());
        }}
        className="flex flex-col items-center gap-4 w-full max-w-sm"
      >
        <label className="flex flex-col gap-2 w-full text-center">
          <span className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
            What name shall be yours?
          </span>
          <input
            value={v}
            onChange={(e) => setV(e.target.value)}
            autoFocus
            aria-label="Player name"
            className="w-full rounded border border-border bg-background px-4 py-2 text-center text-lg focus:outline-none focus:ring-2 focus:ring-primary/60"
          />
        </label>
        <button
          type="submit"
          disabled={!v.trim()}
          className="rounded bg-primary px-6 py-2 text-primary-foreground text-sm tracking-wide uppercase disabled:opacity-40"
        >
          Begin
        </button>
      </form>
    </div>
  );
}

function AppInner() {
  // Slug-mode: when mounted at /solo/:slug or /play/:slug, `slug` is present.
  // AppInner skips ConnectScreen and drives the session-phase state machine
  // directly from the slug-based connect SESSION_EVENT.
  const { slug } = useParams<{ slug?: string }>();

  // Display name — persisted via useDisplayName (localStorage-backed).
  // Set by ConnectScreen handleStart, or by NamePrompt in slug-mode.
  // The hook syncs across component instances in the same tab so
  // ConnectScreen's setName propagates to AppInner without a remount.
  const { name: displayName, setName: setDisplayName } = useDisplayName();
  // Tracks whether the user has *explicitly confirmed* identity for the
  // current slug in this tab's lifetime. The cached `sq:display-name` is
  // not enough — see comment on the slug-mode prompt gate below.
  const [identityConfirmedForSlug, setIdentityConfirmedForSlug] =
    useState<string | null>(null);
  const handleNameSubmit = useCallback(
    (name: string) => {
      setDisplayName(name);
      // Latch confirmation against the current URL slug so a stale cached
      // name from a prior session can't silently re-bind us if the user
      // re-renders before the slug-connect effect persists state.
      setIdentityConfirmedForSlug(slug ?? null);
    },
    [setDisplayName, slug],
  );

  // Bug 2: Hydrate from sessionStorage on mount (HMR recovery)
  const hmrState = loadHmrState();
  // In slug-mode: don't restore "connect" phase from HMR — we drive phase
  // transitions from the server response to our slug-based connect.
  const initialPhase: SessionPhase = (() => {
    if (hmrState?.sessionPhase) return hmrState.sessionPhase;
    // In slug-mode we start at "connect" but skip the ConnectScreen — the
    // slug-connect effect below fires immediately on mount.
    return "connect";
  })();
  const [messages, setMessages] = useState<GameMessage[]>(hmrState?.messages ?? []);
  const [connected, setConnected] = useState(false);
  // Story 65-4: prior-turn art preloaded from the asset ledger on reconnect,
  // fed into ImageBus as a separate pure input (survives the reconnect message
  // purge; no pollution of the message stream). Populated by useAssetPreload.
  const [preloadedAssets, setPreloadedAssets] = useState<SessionAsset[]>([]);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>(initialPhase);
  const [creationScene, setCreationScene] = useState<CreationScene | null>(null);
  const [creationLoading, setCreationLoading] = useState(false);
  const [creationPortraits, setCreationPortraits] = useState<PortraitOption[]>([]);
  const [character, setCharacter] = useState<Record<string, unknown> | null>(hmrState?.character ?? null);
  const [genres, setGenres] = useState<GenresResponse>({});
  const [genreError, setGenreError] = useState(false);
  const [currentGenre, setCurrentGenre] = useState<string | null>(null);
  const [currentWorld, setCurrentWorld] = useState<string | null>(null);
  // Server-announced orbital capability (GameResponse.orbital — the world
  // ships an orbits.yaml). Gates MapWidget's OrbitalChartView; replaces the
  // per-world frontend allowlist that left perseus_cloud's orrery
  // unreachable (sq-playtest 2026-06-07).
  const [worldOrbital, setWorldOrbital] = useState(false);
  // Slug-mode: metadata fetched from GET /api/games/:slug before WS connect fires.
  // gameMetaError surfaces in the alert region; retryCount re-runs the fetch when
  // the user clicks Retry after a transient failure.
  const [gameMetaError, setGameMetaError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // Fatal WebSocket-frame error: ERROR with reconnect_required=false. The
  // socket will keep trying to reconnect forever otherwise (and re-hit the
  // same exception); we capture the typed message + code, surface a full-
  // screen escape panel, and explicitly disconnect so the loop stops.
  // Playtest 2026-04-25 — legacy save schema crashes session_handler;
  // without this UI gate the user is trapped on "Reconnecting…" indefinitely.
  const [fatalError, setFatalError] = useState<{ message: string; code: string | null } | null>(null);
  // Transient per-message rejection (server validation failed for one
  // payload, but the session is still alive). Distinct from fatalError —
  // does NOT disconnect, does NOT show a full-screen panel, just flashes
  // an inline banner so the player knows their last input was rejected.
  // Playtest 2026-04-26 — chargen schema mismatch was wrongly routed to
  // the fatal panel, telling the player "the session ended unexpectedly"
  // and offering "Retry Connection" — both wrong, both UX harmful.
  const [transientError, setTransientError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  // Unified input lock: false after submit, true when narration arrives.
  // Replaces the old thinking/activePlayerName/isMyTurn three-lock system.
  const [canType, setCanType] = useState(true);
  const sessionPhaseRef = useRef<SessionPhase>("connect");
  const autoReconnectAttempted = useRef(false);
  // Latched when slug-connect fires so the mid-session reconnect effect
  // doesn't double-send SESSION_EVENT on the same WS OPEN transition.
  const justConnectedRef = useRef(false);
  // Latched AFTER the slug-connect fetch + connect() runs successfully.
  // Declared here (alongside the other session-lifecycle refs) rather than
  // inline next to the effect so `handleLeave` can reset it — AppInner is a
  // single persistent instance across "/" and "/solo/:slug" (react-router-dom
  // v6 reuses the LobbyRoot element across route matches), so this ref
  // survives navigate() and must be explicitly cleared on Leave or the
  // next game's slug-connect effect short-circuits and never opens the WS
  // (playtest 2026-04-24 "post-lobby hang" bug).
  const slugConnectFired = useRef(false);
  // Stashes the SESSION_EVENT{connect} payload between the slug-connect
  // fetch resolution (when we have the slug + last_seen_seq) and the
  // readyState=OPEN transition (when the WebSocket can actually receive
  // the send). Replaces a 300ms setTimeout that fired blindly regardless
  // of socket state — see story 45-25. Cleared after dispatch in the
  // OPEN-transition effect below; also reset by handleLeave so the next
  // game's slug-connect path starts from a clean slate.
  const pendingConnectPayloadRef = useRef<GameMessage | null>(null);

  // Overlay data from server messages
  const [characterSheet, setCharacterSheet] = useState<CharacterSheetData | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [mapData, setMapData] = useState<MapState | null>(null);

  // GameBoard layout — widget visibility managed internally by useGameBoardLayout
  const { toggleWidget } = useGameBoardLayout(currentGenre ?? undefined);

  // Layout mode — client-only, persisted to localStorage
  const { mode: layoutMode } = useLayoutMode();


  // Party status — richer than state_delta (includes portrait_url)
  const [partyMembers, setPartyMembers] = useState<CharacterSummary[]>([]);

  // Companion roster — narrator-recruited NPC hirelings (playtest 2026-05-06).
  // Surfaced into the Party panel so the UI shows the full active roster
  // (PCs + companions). Empty until the narrator emits companions_added.
  const [partyCompanions, setPartyCompanions] = useState<CompanionSummary[]>([]);

  // Genre resources extracted from PARTY_STATUS (e.g., Luck, Humanity, Fuel)
  const [partyResources, setPartyResources] = useState<Record<string, ResourcePool>>({});

  // Multiplayer identity — who this tab is and whose turn it is
  const [connectedPlayerName, setConnectedPlayerName] = useState<string>("");
  const [activePlayerName, setActivePlayerName] = useState<string | null>(null);
  const [turnStatusEntries, setTurnStatusEntries] = useState<TurnStatusEntry[]>([]);
  // Set true on TURN_STATUS{status="resolving"} (server-emitted when the MP
  // barrier fires and narration dispatch begins), cleared on
  // TURN_STATUS{status="resolved"}. Bridges the gap where seated-but-offline
  // players never emit a "submitted" entry, which left peersOutstanding
  // non-empty for the whole ~30s narration window and pinned the input
  // banner on "Waiting on <offline player> + N others to act…" (playtest
  // 2026-05-10).
  const [narrationInFlight, setNarrationInFlight] = useState(false);
  // Current round counter — updated from ACTION_REVEAL payloads. Starts at 0;
  // first ACTION_REVEAL advances it to the actual round from the server.
  const [currentRound, setCurrentRound] = useState(0);

  // Pause-on-drop (MP-02): server broadcasts GAME_PAUSED when any seated
  // player disconnects and GAME_RESUMED when all seated players are back.
  // `pauseWaitingFor` carries the player_ids the server is waiting on so
  // the PausedBanner can name them.
  const [paused, setPaused] = useState(false);
  const [pauseWaitingFor, setPauseWaitingFor] = useState<string[]>([]);
  // sq-playtest 2026-06-07 (barsoom-3, blocking): a PC the lethality policy
  // ruled dead kept full agency for four rounds because the UI never surfaced
  // the death or locked input. On CHARACTER_INCAPACITATED for THIS client's
  // character we latch this; it locks the InputBar and shows a death banner /
  // re-roll CTA until the player leaves for a fresh session. Peers are NOT
  // locked (SOUL.md The Guitar Solo — the rest of the band plays on).
  const [incapacitation, setIncapacitation] = useState<{
    characterName: string;
    headline: string;
    verdict: string;
    canReroll: boolean;
  } | null>(null);
  // Ref bridge: handleMessage (useCallback, declared above localCharacterName)
  // matches the incapacitated character against the local PC. Synced by an
  // effect once localCharacterName is computed.
  const localCharacterNameRef = useRef<string | null>(null);
  // sq-playtest 2026-06-07 (silent blocked-paused drop): the last real
  // action this player submitted, held until the turn actually runs
  // (cleared at NARRATION_END). If GAME_PAUSED arrives while it's set, the
  // server refused the dispatch (`player_action_blocked_paused`) — the
  // InputBar already cleared optimistically, so restore the draft and say
  // why. Without this a brief peer reconnect (pause + resume inside a
  // second) swallowed a full composition with zero feedback — the
  // Alex-test failure.
  const lastSubmittedActionRef = useRef<string | null>(null);
  // Draft restoration channel to the InputBar (App → GameBoard → InputBar).
  // Epoch bumps so the same text can be restored twice if it bounces twice.
  const [restoredDraft, setRestoredDraft] = useState<{ text: string; epoch: number } | null>(
    null,
  );

  // MP-02 Task 5: seat handshake. After CHARACTER_CREATION{phase:complete},
  // the client claims a `character_slot` via PLAYER_SEAT. The server seats
  // the player in its `SessionRoom` and broadcasts `SEAT_CONFIRMED` to all
  // sockets in the room. We track the seated set so the UI can later render
  // a peer-presence indicator. The setter is wired now; the consumer (badge
  // rendering) is pending and will read this state.
  const [seatedPlayers, setSeatedPlayers] = useState<
    Record<string, string /* character_slot */>
  >({});

  // MP session-state surface (playtest 2026-04-26 GAP). Connected players are
  // tracked from PLAYER_PRESENCE events emitted by the server on connect /
  // disconnect. The local player is added on slug-connect-success below.
  // Combined with `seatedPlayers` (chargen done) this gives the chargen-time
  // session widget enough to show "creating character" vs "ready" per player.
  const [connectedPeerIds, setConnectedPeerIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Game mode for the current slug — populated from the GET /api/games/:slug
  // metadata fetch. Used to gate the MP session widget so it only renders
  // for multiplayer sessions (solo doesn't need invite/roster surfaces).
  const [sessionMode, setSessionMode] = useState<"solo" | "multiplayer" | null>(
    null,
  );

  // MP-03 event cache — per-(slug, player) IndexedDB durable log of
  // seq-carrying events. Populated as messages arrive; consulted at connect
  // time via `getLatestSeq()` so the SESSION_EVENT carries the right
  // `last_seen_seq` without the slug-connect effect needing to wait on
  // async IDB open.
  const { getLatestSeq: getCachedLatestSeq, appendEvent: appendCachedEvent } =
    usePeerEventCache(slug, displayName);
  // Seq-dedupe: MP-03 reconnect replays emit events we may already have in
  // `messages`. Drop any (kind, seq) pair we've processed before so the
  // narration log doesn't double-render on reconnect.
  const seenEventKeysRef = useRef<Set<string>>(new Set());

  // Confrontation state from CONFRONTATION messages (structured encounters)
  const [confrontationData, setConfrontationData] = useState<ConfrontationData | null>(null);
  // Phase 5 (Story 47-3): branch-explicit outcome reveal. Driven by
  // CONFRONTATION_OUTCOME WebSocket messages — the server resolves a
  // magic confrontation, applies its mandatory_outputs, and dispatches
  // the resolved branch + outputs here so the overlay can mount the
  // reveal panel. Cleared when a fresh CONFRONTATION arrives (a new
  // confrontation starts) or the active confrontation closes.
  const [confrontationOutcome, setConfrontationOutcome] = useState<ConfrontationOutcome | null>(null);
  // Tracks whether a CONFRONTATION message arrived this turn — used by
  // NARRATION_END to decide whether the encounter has resolved (fix: playtest-2026-04-12).
  const confrontationReceivedThisTurnRef = useRef(false);

  // Story 71-3 (AC-4, Reviewer-flagged MP hazard): tracks whether the LOCAL
  // player currently has a turn action in flight (submitted, awaiting
  // resolution). Gates the AC-2 NARRATION_END clear so that a NARRATION_END
  // resolving a turn the local player did NOT submit into (e.g. another
  // player's round-trip / an auto-resolved barrier in MP) cannot wipe THIS
  // player's transient error.
  //   ARMED on every genuine local submit that round-trips to NARRATION_END:
  //     - handleSend (text PLAYER_ACTION, non-aside)
  //     - handleDiceThrow's beat-roll block (DICE_THROW with a beat_id)
  //     - handleYield (YIELD)
  //   DISARMED when the local action bounces (both transient-error set sites)
  //   and at every NARRATION_END turn boundary (unconditional reset).
  //   auto_resolved never arms — the server resolved for the player, so none
  //   of those handlers ran — so an auto-resolved player's stale error survives
  //   the round (AC-4 hole stays closed).
  // A ref, not state — read synchronously inside handleMessage without a
  // re-render.
  const localTurnInFlightRef = useRef(false);

  // Dice overlay state from DICE_REQUEST / DICE_RESULT messages (story 34-5)
  const [diceRequest, setDiceRequest] = useState<DiceRequestPayload | null>(null);
  const [diceResult, setDiceResult] = useState<DiceResultPayload | null>(null);
  // Ping-pong 2026-06-07 ("die face ≠ readout ≠ server total"): synchronous
  // mirror of the DISPLAYED dice request, read by the MP frame guard in
  // handleMessage. The server broadcasts every roller's DICE_REQUEST /
  // DICE_RESULT to the whole room; these slots are a single-die readout, so a
  // PEER's frames must never clobber the LOCAL player's in-flight roll (the
  // perseus screenshot: Groucho's banner flipped to Chico's INTELLECT/TARGET
  // mid-roll) and a result must only render under ITS OWN banner. A ref —
  // not state — because request and result can arrive in the same WS batch
  // and the pairing decision must see the just-accepted request.
  const displayedDiceRequestRef = useRef<DiceRequestPayload | null>(null);

  // Orbital chart state from ORBITAL_CHART messages (orbital map Task 15b).
  // The MapWidget's useOrbitalChart hook consumes this as `lastResponse`.
  const [lastOrbitalChart, setLastOrbitalChart] = useState<OrbitalIntentResponse | null>(null);
  // Latest ORBITAL_INTENT rejection (ERROR with an orbital code) — feeds
  // MapWidget's "no local chart" state (ADR-141 / 98-3 AC5). Cleared when
  // a fresh ORBITAL_CHART supersedes it.
  const [lastOrbitalError, setLastOrbitalError] = useState<OrbitalIntentError | null>(null);
  // Bumps every time the server confirms session bind via
  // SESSION_EVENT{ready} or SESSION_EVENT{connected}. Drives the orbital
  // hook's re-fetch when its initial ORBITAL_INTENT was rejected at
  // AwaitingConnect (sq-playtest-pingpong 2026-05-03). Deliberately NOT
  // restored from HMR — only this page lifecycle's actual bind events
  // count, otherwise a stale epoch would suppress the recovery fetch.
  const [sessionBoundEpoch, setSessionBoundEpoch] = useState(0);
  // Story 67-8 (Layer 3): true once the server confirms the session is bound
  // (SESSION_EVENT connected/ready) on the current socket, false whenever the
  // socket drops or a (re)handshake is in flight (AwaitingConnect) or a frame
  // is rejected `session_unbound`. Gates beat-commit so a DICE_THROW is never
  // issued into an OPEN-but-unbound socket — the churn that stranded
  // confrontations. NOT a buffer: an unbound commit is refused, not queued.
  const [sessionBound, setSessionBound] = useState(false);
  // Beat ID pending a client-side dice roll — set when user picks a beat,
  // sent with DiceThrow so the server can apply beat + narrate in one tick.
  const pendingBeatIdRef = useRef<string | null>(null);
  // Freeform text the player typed into the InputBar at the moment they
  // clicked a beat tile (D2 confrontation panel, 2026-05-13). Latched
  // alongside pendingBeatIdRef and re-attached to DICE_THROW.player_action
  // when dice settle. Empty string when the player didn't type anything.
  const pendingPlayerActionRef = useRef<string>("");
  // Story 102-2: the prepared spell chosen in the overlay's "Work a Spell"
  // picker. Latched alongside pendingBeatIdRef and re-attached to
  // DICE_THROW.spell_id when dice settle — consumed atomically with the
  // beat so a stale spell can never leak into a later non-cast commit.
  const pendingSpellIdRef = useRef<string | null>(null);

  // Ref bridge: peerReveals.apply is defined after handleMessage (useCallback).
  // Updated synchronously alongside sendRef so handleMessage always calls the
  // current closure without the circular dep.
  const peerRevealsApplyRef = useRef<((entry: ActionRevealEntry) => void) | null>(null);
  // Same ref bridge for clear() — invoked from TURN_STATUS{status="resolved"}
  // to drop the previous round's "✓ submitted" rows the instant narration
  // completes, instead of waiting for the next round's first ACTION_REVEAL.
  // (2026-05-18 MP playtest.)
  const peerRevealsClearRef = useRef<(() => void) | null>(null);
  // Story 71-4: ref bridges for the ephemeral→persistent peer-action bridge.
  // `snapshot` captures the firewall-filtered reveals into the persistent
  // accumulator at TURN_STATUS{resolved} — called BEFORE clear() so it beats
  // the wipe. `reset` drops the accumulator on the reconnect messages-purge.
  const peerRevealsSnapshotRef = useRef<(() => void) | null>(null);
  const persistedPeerActionsResetRef = useRef<(() => void) | null>(null);

  // sq-playtest 2026-05-28 #G3: the solo PLAYER_ACTION submit (handleSend)
  // shipped with NO payload.round and an empty player_id, failing the server's
  // GameMessage validation (PlayerActionPayload.round is required, ge=0) and
  // tearing down the socket — no solo turn could ever resolve. handleSend is
  // declared before currentPlayerId, so it reads the latest round + seated
  // player id through these refs (assigned just after currentPlayerId is
  // computed) rather than capturing stale closure values.
  const currentRoundRef = useRef(0);
  const currentPlayerIdRef = useRef<string | null>(null);

  // Dice overlay persists after result so the table can see "rolled N vs
  // target M → outcome" through the narrator's resolution. Cleared by:
  // (a) a new DiceRequest arriving (DICE_REQUEST handler below),
  // (b) a local beat click (handleBeatSelect sets a fresh request),
  // (c) the confrontation ending — handled by the effect below,
  // (d) NARRATION_END — the narrator has accepted the roll; holding the
  //     stale TARGET/result widget past the turn boundary makes players
  //     read it as the DC for the next click. Cleared in the NARRATION_END
  //     branch of handleMessage (playtest-pingpong 2026-04-24).
  useEffect(() => {
    if (confrontationData) return;
    displayedDiceRequestRef.current = null;
    setDiceRequest(null);
    setDiceResult(null);
  }, [confrontationData]);

  // Bug 2: Persist critical state to sessionStorage for HMR survival
  useEffect(() => {
    saveHmrState({ messages, sessionPhase, character });
  }, [messages, sessionPhase, character]);

  // Fetch available genres from the server — never hardcode.
  // Only needed in connect phase (for the lobby). In slug-mode we skip
  // ConnectScreen so the genres fetch is still run but not blocking.
  // Response shape is `GenresResponse` (rich metadata per genre + world);
  // see `sidequest-server::list_genres` and `@/types/genres`.
  const fetchGenres = useCallback(() => {
    setGenreError(false);
    fetch("/api/genres")
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json() as Promise<GenresResponse>;
      })
      .then((data) => {
        if (Object.keys(data).length === 0) throw new Error("no genres");
        setGenres(data);
      })
      .catch(() => {
        setGenres({});
        setGenreError(true);
      });
  }, []);

  useEffect(() => {
    fetchGenres();
  }, [fetchGenres]);

  // Metadata is fetched inline in the slug-connect effect below; no separate
  // effect needed. currentGenre is the only consumer — chrome archetype and
  // GameBoard key both read currentGenre.

  // Audio engine — unified mixer for music, SFX, ambience
  const audio = useAudio();

  // Genre theme CSS must process in ALL phases, not just game view.
  // `connected` arms the loud-fail guard: once the session is up, theme_css
  // MUST arrive or the transport is declared broken (No-Silent-Fallbacks).
  useGenreTheme(messages, connected);

  // Chrome archetype: structural CSS (fonts, borders). The lobby renders the
  // neutral `house` chrome; genre archetype applies once a world is committed
  // (creation/game), so the menu never cosplays the last-entered world.
  useChromeArchetype(resolveRootArchetype(sessionPhase, currentGenre));

  // State mirror: process state_delta from server messages into GameStateContext
  useStateMirror(messages);

  // Audio cue processing — runs in all phases so cues aren't missed
  const nowPlaying = useAudioCue(messages, audio.engine);

  // Slash commands — resolve locally from cached state, zero round-trip
  const { execute: executeSlashCommand } = useSlashCommands();

  // Game state for mapping to UI components
  const { state: gameState } = useGameState();

  // Story 65-4: on (re)connect to a saved session, preload prior-turn art from
  // the asset ledger so the gallery rehydrates from R2 without re-rendering.
  // The hook lives here at the WebSocket-owning level; ImageBus stays a pure
  // reducer. Callbacks are stable (useCallback) so the hook's rising-edge
  // effect doesn't refire on unrelated re-renders.
  const handlePreloadAssets = useCallback((rows: SessionAsset[]) => {
    const valid: SessionAsset[] = [];
    for (const row of rows) {
      if (!row.url) {
        // No-Silent-Fallbacks: a ledger row without a resolved CDN url is a
        // server-contract violation — surface it loudly, don't gallery a
        // blank card.
        console.error(
          "useAssetPreload: ledger row has no resolved url — dropping",
          row,
        );
        continue;
      }
      valid.push(row);
    }
    setPreloadedAssets(valid);
  }, []);
  // Story 65-16 AC2b: surface a failed ledger preload to the player instead of
  // only logging it. Reuse the transient-error banner (Story 71-3) — a missing
  // backfill is non-fatal (live renders still arrive), so it belongs on the
  // dismissible strip, not the fatal panel. Stable identity (setTransientError
  // is a stable setter) so the hook's edge effect doesn't refire.
  const handlePreloadError = useCallback((err: unknown) => {
    const detail = err instanceof Error ? `: ${err.message}` : "";
    setTransientError(
      `Couldn't load this session's saved images${detail}. They'll reappear as the next images render.`,
    );
  }, []);
  useAssetPreload({
    slug: slug ?? null,
    connected,
    onAssets: handlePreloadAssets,
    onError: handlePreloadError,
  });

  const handleMessage = useCallback((msg: GameMessage) => {
    // MP-03 seq-dedupe + cache. Narrator-host tags durable events with
    // `payload.seq`. On reconnect the server replays events > last_seen_seq
    // which overlaps live events that arrived during the handshake — we
    // drop any (type, seq) pair we've already processed and persist the
    // first-seen copy to IndexedDB so future reconnects know our high-water
    // mark. THINKING et al. don't carry seq and fall through unchanged.
    const payloadSeq = (msg.payload as { seq?: number } | undefined)?.seq;
    if (typeof payloadSeq === "number" && payloadSeq > 0) {
      const key = `${msg.type}:${payloadSeq}`;
      if (seenEventKeysRef.current.has(key)) {
        return; // Replay duplicate — already rendered and cached
      }
      seenEventKeysRef.current.add(key);
      // Fire-and-forget: IndexedDB latency must not block the render path.
      // Errors here are non-fatal (we keep a stale high-water mark; next
      // reconnect sees more replay) — log instead of throw.
      void appendCachedEvent({ seq: payloadSeq, kind: msg.type, payload: msg.payload }).catch(
        (err) => console.warn("[mp-03] peer cache append failed", err),
      );
    }

    // Thinking indicator: show on THINKING, hide on first content
    if (msg.type === MessageType.THINKING) {
      setThinking(true);
      return;
    }

    if (
      msg.type === MessageType.NARRATION ||
      msg.type === MessageType.NARRATION_END ||
      // ADR-107: out-of-band GM aside answer flows into the narrative
      // scroll (table-visible) but is NOT a turn boundary — it does not
      // unlock input, clear the confrontation panel, or touch dice
      // state. Those side-effects stay gated behind NARRATION_END below.
      msg.type === MessageType.ASIDE_ANSWER
    ) {
      setThinking(false);
      setMessages((prev) => [...prev, msg]);
      // ADR-107: aside answer is the terminal message for an aside —
      // re-enable input immediately. No NARRATION_END will follow.
      if (msg.type === MessageType.ASIDE_ANSWER) {
        setCanType(true);
      }
      // Turn-end signal: unlock input once the narrator has responded.
      // Paired with setCanType(false) in handleSend. Without this, the input
      // stays sealed after every turn until the player disconnects or leaves.
      if (msg.type === MessageType.NARRATION_END) {
        setCanType(true);
        // Fix: playtest-2026-04-12 — Confrontation panel stuck after encounter
        // resolution. The server clears the encounter snapshot BEFORE building
        // the response, so no CONFRONTATION { active: false } message arrives.
        // On NARRATION_END (turn boundary), if no CONFRONTATION message arrived
        // this turn, the encounter has resolved — clear the panel. The ref
        // avoids React batching issues (CONFRONTATION and NARRATION_END can
        // arrive in the same batch).
        if (!confrontationReceivedThisTurnRef.current) {
          setConfrontationData(null);
          // Phase 5 (Story 47-3): clear the outcome reveal alongside
          // the underlying confrontation. Holding the panel past the
          // turn boundary would superimpose the previous resolution
          // on the next confrontation.
          setConfrontationOutcome(null);
        }
        confrontationReceivedThisTurnRef.current = false;
        // Clear the dice TARGET banner and roll-result widget once the
        // narrator resolves the roll. Without this, the previous roll's
        // "TARGET 18 · need 17" + "Rolled 4 vs 18 Fail" stays pinned
        // beside the next set of beat buttons, and players read it as
        // the DC for the next click (playtest-pingpong 2026-04-24).
        displayedDiceRequestRef.current = null;
        setDiceRequest(null);
        setDiceResult(null);
        // Story 71-3 (AC-2): a completed turn round-trip clears the stale
        // transient-error banner. If the local player's prior action bounced
        // (e.g. a session_unbound "please retry" notice) and the retry
        // succeeds, NARRATION_END is the success signal — drop the now-stale
        // error so it doesn't overlay the fresh narration. Two AC-4 guards:
        //   1. Scoped to NARRATION_END (the turn boundary), NOT mid-turn
        //      NARRATION frames.
        //   2. Gated on localTurnInFlightRef — only a NARRATION_END that
        //      resolves a turn THIS player submitted into clears the error,
        //      so a peer's round-trip in MP can't wipe my banner. The flag is
        //      always reset at the turn boundary regardless.
        if (localTurnInFlightRef.current) {
          setTransientError(null);
        }
        localTurnInFlightRef.current = false;
        // The turn ran — the submitted action was consumed, nothing to
        // restore on a later pause (sq-playtest 2026-06-07 blocked-paused).
        lastSubmittedActionRef.current = null;
      }
      return;
    }

    if (msg.type === MessageType.SESSION_EVENT) {
      const event = msg.payload.event as string;
      // Reset pending narration state on reconnect — previous turn's request
      // is lost when the server restarts, so clear the spinner.
      if (event === "connected" || event === "ready") {
        setThinking(false);
        setCanType(true);
        // Story 82-2 (ADR-049): rehydrate the lobby sliders to the player's
        // persisted narrator tuning the server reports on resume, so a returning
        // player sees their saved choice rather than the defaults. payload is
        // Record<string, unknown> on GameMessage, so narrow the two fields.
        const narratorPayload = msg.payload as {
          narrator_verbosity?: NarratorVerbosity | null;
          narrator_vocabulary?: NarratorVocabulary | null;
        };
        if (narratorPayload.narrator_verbosity || narratorPayload.narrator_vocabulary) {
          saveNarratorPrefs({
            narrator_verbosity: narratorPayload.narrator_verbosity ?? undefined,
            narrator_vocabulary: narratorPayload.narrator_vocabulary ?? undefined,
          });
        }
        // sq-playtest-pingpong 2026-05-03 [BUG] Map widget stuck at
        // "Loading orbital chart…" after WS resume. The server's per-
        // connection state machine starts in AwaitingConnect; the orbital
        // hook fires ORBITAL_INTENT on mount. If MapWidget mounts before
        // the bind handshake completes (HMR-restored sessionPhase or page
        // reload race), the server rejects with code=session_unbound and
        // the hook's one-shot fetchedForCycle latch never re-fires. Bump
        // an epoch on every bind confirmation so useOrbitalChart re-
        // fetches the initial view_map after the bind lands. Same epoch
        // covers mid-session uvicorn --reload zombie-bind recovery.
        setSessionBoundEpoch((n) => n + 1);
        // Story 67-8 (Layer 3): the server has confirmed Playing — beat-commit
        // is now safe. Paired with the resets below (socket drop, re-handshake,
        // session_unbound) so the gate tracks the true bound state.
        setSessionBound(true);
      }
      if (event === "waiting") {
        // Server says barrier is active and this player already submitted —
        // lock input until narration arrives (NarrationEnd re-enables it).
        setCanType(false);
        setThinking(true);
      }
      if (event === "connected" && !msg.payload.has_character) {
        sessionPhaseRef.current = "creation";
        setSessionPhase("creation");
      } else if (event === "ready") {
        // On reconnect (phase not yet "game"), clear stale messages to
        // avoid duplicates.  On first connect after chargen,
        // CHARACTER_CREATION "complete" already set phase to "game" —
        // DON'T clear, or the opening narration from the auto-first-turn
        // gets wiped.
        const isReconnect = sessionPhaseRef.current !== "game";
        sessionPhaseRef.current = "game";
        setSessionPhase("game");
        if (isReconnect) {
          setMessages((prev) =>
            prev.filter((m) => m.type === MessageType.SESSION_EVENT),
          );
          // Story 71-4: the transcript is being purged for the replay — drop
          // the persisted peer-action accumulator in lockstep. Peer actions
          // are an ephemeral channel the server does not replay into narration,
          // so they cannot survive a reconnect (pre-existing limitation, logged
          // as a delivery finding) — keep them consistent with the wiped scroll.
          persistedPeerActionsResetRef.current?.();
          // MP-03: messages are about to be re-populated by the server's
          // last_seen_seq replay. Clear the seq-dedupe set in lockstep so
          // replayed events aren't dropped as duplicates of the (now-gone)
          // in-memory state.
          seenEventKeysRef.current.clear();
        }
      }
      // Let theme_css events through to the messages array for useGenreTheme
      if (event !== "theme_css") return;
    }

    if (msg.type === MessageType.CHARACTER_CREATION) {
      // Ignore creation messages if already in game phase
      if (sessionPhaseRef.current === "game") return;

      const phase = msg.payload.phase as string;
      if (phase === "scene" || phase === "confirmation") {
        setCreationScene(msg.payload as unknown as CreationScene);
        setCreationLoading(false);
        // Portrait picker: when the server sends a pick_portrait step,
        // fetch the world's available portraits from the REST endpoint.
        // On failure we degrade to an empty list — the PortraitPanel
        // shows a calm empty/skip state, so chargen is never blocked.
        // The console.error keeps it diagnosable (not a silent fallback).
        if ((msg.payload as Record<string, unknown>).input_type === "pick_portrait") {
          const genre = currentGenre;
          const world = currentWorld;
          if (genre && world) {
            fetch(`/api/chargen/portraits/${encodeURIComponent(genre)}/${encodeURIComponent(world)}`)
              .then((res) => {
                if (!res.ok) throw new Error(`portraits fetch ${res.status}`);
                return res.json() as Promise<{ portraits: PortraitOption[] }>;
              })
              .then((body) => {
                setCreationPortraits(body.portraits);
              })
              .catch((err) => {
                console.error("Failed to fetch chargen portraits:", err);
                setCreationPortraits([]);
              });
          } else {
            setCreationPortraits([]);
          }
        }
      } else if (phase === "complete") {
        const charData = msg.payload.character as Record<string, unknown>;
        setCharacter(charData);
        setCreationScene(null);
        setCreationLoading(false);
        sessionPhaseRef.current = "game";
        setSessionPhase("game");

        // MP-02 Task 5: claim the seat. The server-side handler at
        // session_handler.py::_handle_player_seat seats us in the
        // SessionRoom and broadcasts SEAT_CONFIRMED to every socket in
        // the room. Without this, the room sees the socket as
        // *connected* but never *seated*, so peers can't tell that
        // this player exists as a PC.
        //
        // character_slot must be a stable identifier — character.name
        // is what the genre packs and chargen state machine treat as
        // the slot label (caverns_and_claudes uses character display
        // names; mutant_wasteland uses class+name). The DB primary key
        // for the seat is (slug, player_id), so the slot is mostly
        // descriptive metadata that flows back via SEAT_CONFIRMED.
        //
        // The server emits `character.model_dump()` which nests the
        // name under `core.name` (Python pydantic model). The flat
        // `name` / `character_name` fallbacks are kept for any
        // historical or alternative emission paths but the canonical
        // location is `core.name`.
        const charCore = charData?.core as Record<string, unknown> | undefined;
        const charNameForSeat =
          (charCore?.name as string | undefined) ??
          (charData?.name as string | undefined) ??
          (charData?.character_name as string | undefined);
        if (charNameForSeat && sendRef.current) {
          sendRef.current({
            type: MessageType.PLAYER_SEAT,
            payload: { character_slot: charNameForSeat },
            player_id: "",
          });
        }
      }
      return;
    }

    if (msg.type === MessageType.PLAYER_PRESENCE) {
      // Track peer connect/disconnect so the MP session widget can show a
      // live roster during chargen. The server only broadcasts presence
      // events to PEERS (exclude_socket_id=self) — the local player is
      // added directly in the slug-connect success path. Disconnect drops
      // the peer; the seat (if claimed) stays in seatedPlayers because the
      // character is still seated even when the player is offline.
      const pid = msg.payload?.player_id as string | undefined;
      const state = msg.payload?.state as string | undefined;
      if (pid) {
        if (state === "connected") {
          setConnectedPeerIds((prev) => {
            if (prev.has(pid)) return prev;
            const next = new Set(prev);
            next.add(pid);
            return next;
          });
        } else if (state === "disconnected") {
          setConnectedPeerIds((prev) => {
            if (!prev.has(pid)) return prev;
            const next = new Set(prev);
            next.delete(pid);
            return next;
          });
        }
      }
      return;
    }

    if (msg.type === MessageType.SEAT_CONFIRMED) {
      // MP-02 Task 5: server broadcast confirming a player has claimed a
      // character slot. Update the local seated-roster so the UI can
      // render peer-presence affordances (turn indicator, "X has joined"
      // toast, party-roster fallback when PARTY_STATUS hasn't arrived
      // yet for the peer).
      const payloadPid = msg.payload?.player_id as string | undefined;
      const payloadSlot = msg.payload?.character_slot as string | undefined;
      if (payloadPid && payloadSlot) {
        setSeatedPlayers((prev) => ({ ...prev, [payloadPid]: payloadSlot }));
      }
      return;
    }

    // Track whose turn it is — gates input in multiplayer.
    // TURN_STATUS is state-only, not rendered in narration feed.
    // The turn strip in GameBoard shows whose turn it is.
    if (msg.type === MessageType.TURN_STATUS) {
      const name = msg.payload.player_name as string | undefined;
      const status = msg.payload.status as string | undefined;
      // Server emits player_id at the *message* top level (BaseMessage
      // wire shape), NOT inside the TurnStatusPayload — sidequest-server's
      // TurnStatusPayload (extra="forbid") only carries player_name +
      // status + state_delta. Reading msg.payload.player_id left this
      // undefined for every active/submitted/resolved broadcast, so the
      // per-player entry push below never fired and the submit-barrier
      // strip stayed on "Composing… (0/2)" forever — the same wire-shape
      // bug class as the +1 off-by-one in "Waiting on X + N others"
      // (playtest 2026-05-10). Fall back to msg.payload.player_id for any
      // future server schema change.
      const playerId =
        ((msg as unknown as Record<string, unknown>).player_id as string | undefined) ??
        (msg.payload.player_id as string | undefined);

      if (name && status === "active") {
        setActivePlayerName(name);
      } else if (status === "resolving") {
        setNarrationInFlight(true);
      } else if (status === "resolved") {
        setActivePlayerName(null);
        setTurnStatusEntries([]);
        setNarrationInFlight(false);
        // Story 71-4: snapshot the perception-filtered peer reveals into the
        // persistent accumulator BEFORE the clear() below wipes them — the
        // ephemeral→persistent bridge (Architect ruling A1). Order is the sharp
        // edge: capture must beat clear, so this line precedes it.
        peerRevealsSnapshotRef.current?.();
        // Drop peer reveals from the round that just resolved. Without
        // this, "Laverne ✓ submitted — I walk to the winch..." persists
        // into the next turn's compose phase on every other tab.
        peerRevealsClearRef.current?.();
      }

      // Update per-player turn status entries for TurnStatusPanel.
      //
      // Only "submitted" and "auto_resolved" represent durable per-player
      // sealed-letter state. Skip every other status:
      //   - "active" is a banner-only signal ("this player's narration is
      //     about to run") that always arrives immediately before the
      //     "submitted" emit from the same player; pushing a transient
      //     "pending" entry for it served no consumer.
      //   - "resolving" is a session-level "narrator is running" signal
      //     (already-known guard, 2026-05-10).
      //   - "resolved" is the session-level "turn complete" signal. The
      //     branch above already does ``setTurnStatusEntries([])`` for
      //     it; pushing a "pending" entry after the clear ran was the
      //     2026-05-15 party-panel-inversion bug — whoever submitted
      //     last on turn N got pinned as "pending" into turn N+1, so
      //     CharacterPanel showed them as "Waiting" while the peer who
      //     also hadn't yet declared showed as "ACTING" (the YOU-row
      //     inversion the SM described).
      if (
        playerId && name &&
        (status === "submitted" || status === "auto_resolved")
      ) {
        const mapped: TurnStatusEntry["status"] = status;
        setTurnStatusEntries((prev) => {
          const next = prev.filter((e) => e.player_id !== playerId);
          next.push({ player_id: playerId, character_name: name, status: mapped });
          return next;
        });
      }

      // Batch entries support (server may send full list)
      const entries = msg.payload.entries as Array<Record<string, unknown>> | undefined;
      if (entries) {
        setTurnStatusEntries(
          entries.map((e) => ({
            player_id: (e.player_id as string) ?? "",
            character_name: (e.character_name as string) ?? (e.player_name as string) ?? "",
            status: (e.status as TurnStatusEntry["status"]) ?? "pending",
          })),
        );
      }

      return;
    }

    // Live teammate typing — peer action reveals for the current round.
    // Update the round counter from the payload so the hook receives the
    // canonical round value emitted by the server.
    if (msg.type === MessageType.ACTION_REVEAL) {
      const entry = msg.payload as unknown as ActionRevealEntry;
      setCurrentRound(entry.round);
      peerRevealsApplyRef.current?.(entry);
      return;
    }

    // Capture party status — single source of truth for party + per-character
    // state. As of 2026-04 PartyMember also carries `sheet` (race/stats/
    // abilities/backstory/etc.) and `inventory` (items/gold) facets, replacing
    // the deleted CHARACTER_SHEET and INVENTORY message types. We fan out the
    // local player's slice into characterSheet / inventoryData here.
    if (msg.type === MessageType.PARTY_STATUS) {
      const members = (msg.payload.members as Array<Record<string, unknown>>) ?? [];
      const mapped = members.map(toCharacterSummary);
      // Deduplicate by player_id (HMR/reconnect can re-register players)
      const seen = new Set<string>();
      const deduped = mapped.filter((m) => {
        if (seen.has(m.player_id)) return false;
        seen.add(m.player_id);
        return true;
      });
      setPartyMembers(deduped);

      // Fan out the local player's sheet + inventory facets. The local
      // player is identified by matching `name` against connectedPlayerName,
      // then falling back to the first member (single-player case).
      const localName = connectedPlayerName;
      const rawLocal =
        (localName && members.find((m) => (m.name as string) === localName)) ||
        members[0];
      if (rawLocal) {
        const sheetFacet = rawLocal.sheet as Record<string, unknown> | undefined;
        if (sheetFacet) {
          // Assemble the UI-facing CharacterSheetData from the PartyMember
          // root fields (name/class/level/portrait_url/current_location) plus
          // the nested sheet facet (stats/abilities/backstory).
          // Story 56-1: in MP, surface the controlling player's name on the
          // sheet header. MP-detection: deduped.length > 1. The canonical
          // isMultiplayer at GameBoard.tsx:456-458 is broader (also fires
          // on turnStatusEntries / activePlayerName) — the deduped count
          // is the correct signal here because it is derived directly from
          // the PARTY_STATUS payload assembled in this same handler, before
          // any side-channel signals are available. Erring conservative
          // (this gate suppresses the suffix on a 1-PC payload even if a
          // second PC's PARTY_STATUS arrives later) is appropriate for the
          // load-bearing AC-4: single-player must not regress.
          const isMultiplayer = deduped.length > 1;
          const built = toCharacterSheetData(rawLocal, sheetFacet, isMultiplayer);
          setCharacterSheet(built);
        }
        const invFacet = rawLocal.inventory as Record<string, unknown> | undefined;
        if (invFacet) {
          setInventoryData(invFacet as unknown as InventoryData);
        }
      }

      // Extract genre resources from PARTY_STATUS (light, fuel, luck, …).
      // The server projects each pool as ResourcePoolPayload with the field
      // names CharacterPanel reads (value/max/thresholds), so the wire type is
      // structurally a ResourcePool — no lossy remap. Before the 2026-06-13
      // wiring fix the server sent no `resources` field at all and the
      // CharacterPanel light gauge never rendered in real play.
      const resources = msg.payload.resources as
        | Record<string, ResourcePoolPayload>
        | undefined;
      if (resources && typeof resources === "object") {
        setPartyResources(resources);
      }

      // Companion roster (playtest 2026-05-06). Always overwrite; the
      // server payload is the source of truth. Empty array clears the
      // panel section if every companion was dismissed this turn.
      const rawCompanions = (msg.payload as { companions?: Array<Record<string, unknown>> })
        .companions;
      const mappedCompanions: CompanionSummary[] = Array.isArray(rawCompanions)
        ? rawCompanions
            .map((c) => ({
              name: (c.name as string) ?? "",
              role: (c.role as string) ?? "",
              description: (c.description as string) ?? "",
              notes: (c.notes as string) ?? "",
              recruited_turn: (c.recruited_turn as number) ?? 0,
              recruited_by: (c.recruited_by as string) ?? "",
            }))
            .filter((c) => c.name)
        : [];
      setPartyCompanions(mappedCompanions);

      return;
    }

    // Pause-on-drop (MP-02) — server broadcasts these when seated-player
    // presence changes. The banner is advisory only; PLAYER_ACTION is
    // still blocked server-side while paused, so the UI just mirrors state.
    //
    // Playtest 2026-05-02: when GAME_PAUSED arrives in response to a
    // submitted PLAYER_ACTION (server short-circuits the dispatch), the
    // optimistic input-lock from handleSend leaves the textbox disabled
    // and the thinking pulse stuck on. Roll those back so the user can
    // edit and resubmit once the server resumes — the server is the
    // authority on whether the action ran, and the action did NOT run.
    if (msg.type === MessageType.GAME_PAUSED) {
      const waitingFor = (msg.payload.waiting_for as string[] | undefined) ?? [];
      setPaused(true);
      setPauseWaitingFor(waitingFor);
      setThinking(false);
      setCanType(true);
      // sq-playtest 2026-06-07: if this pause arrived while OUR action was
      // in flight, the server refused the dispatch
      // (player_action_blocked_paused) and the action is GONE — but the
      // InputBar cleared optimistically on submit. Restore the draft and
      // surface a persistent, dismissible notice (the PausedBanner alone
      // can blink away in under a second when the peer's socket bounces
      // straight back — pause→resume swallowed the action invisibly).
      const dropped = lastSubmittedActionRef.current;
      if (dropped) {
        lastSubmittedActionRef.current = null;
        setRestoredDraft((prev) => ({ text: dropped, epoch: (prev?.epoch ?? 0) + 1 }));
        const who = waitingFor.length > 0 ? waitingFor.join(", ") : "a player";
        setTransientError(
          `Your action didn't go through — the table was waiting while ${who} reconnected. ` +
            "Your draft has been restored; submit it again when everyone's back.",
        );
        localTurnInFlightRef.current = false;
      }
      return;
    }
    if (msg.type === MessageType.GAME_RESUMED) {
      setPaused(false);
      setPauseWaitingFor([]);
      return;
    }

    // Character death / incapacitation (sq-playtest 2026-06-07 barsoom-3). The
    // server is the authority — it refuses a downed PC's actions server-side —
    // and this surfaces it: a death banner + input lock for the dead seat only.
    // PC-scoped: lock only when the incapacitated character is OURS (a peer's
    // death must not lock our seat). When we have no local character name yet
    // (solo before the party roster lands), treat it as ours — solo has one PC.
    if (msg.type === MessageType.CHARACTER_INCAPACITATED) {
      const p = msg.payload as unknown as CharacterIncapacitatedPayload;
      const localName = localCharacterNameRef.current;
      if (!localName || p.character_name === localName) {
        setIncapacitation({
          characterName: p.character_name,
          headline: p.headline,
          verdict: p.verdict,
          canReroll: p.can_reroll,
        });
        setThinking(false);
      }
      return;
    }

    // Capture overlay data from server — these update the panels/overlays
    if (msg.type === MessageType.MAP_UPDATE) {
      setMapData(msg.payload as unknown as MapState);
      return;
    }
    // ADR-096 Task 20b: TACTICAL_GRID arrives on room entry and carries the
    // cavern/settlement layout for the Automapper. Patch the matching
    // ExploredLocation in mapData with the payload so the Automapper can
    // route by room_type and render cavern grids via TacticalGridRenderer.
    if (msg.type === MessageType.TACTICAL_GRID) {
      // Shape mirrors ExploredLocation.cavern_payload exactly so the patch
      // below type-checks. Loosening cellular/derived to ``object | null``
      // breaks the ExploredLocation contract (TS2345 at the setMapData
      // call) — the TACTICAL_GRID wire shape and the patched-into shape
      // must agree at the field level.
      const tgPayload = msg.payload as NonNullable<ExploredLocation["cavern_payload"]>;
      setMapData((prev) => {
        if (!prev) return prev;
        const explored = prev.explored.map((loc) => {
          const locId = loc.id ?? loc.name;
          if (locId !== tgPayload.room_id) return loc;
          return { ...loc, cavern_payload: tgPayload };
        });
        // If the room isn't in explored yet (first time seeing it via
        // TACTICAL_GRID before MAP_UPDATE), skip — MAP_UPDATE is the
        // authoritative source for the room list; we only patch here.
        return { ...prev, explored };
      });
      return;
    }
    // COMBAT_EVENT handler removed in story 28-9
    if (msg.type === MessageType.CONFRONTATION) {
      const payload = msg.payload as unknown as ConfrontationData;
      confrontationReceivedThisTurnRef.current = true;
      setConfrontationData(payload.active !== false ? payload : null);
      // Fresh confrontation arriving — clear any stale outcome reveal so
      // the new confrontation starts in its un-resolved state.
      setConfrontationOutcome(null);
      return;
    }
    // Phase 5 (Story 47-3): magic-confrontation outcome dispatch. The
    // server has applied mandatory_outputs and is broadcasting the
    // resolved branch so the ConfrontationOverlay can mount its reveal
    // panel.
    if (msg.type === MessageType.CONFRONTATION_OUTCOME) {
      const payload = msg.payload as unknown as ConfrontationOutcome;
      setConfrontationOutcome(payload);
      return;
    }

    // Dice overlay — driven by DICE_REQUEST and DICE_RESULT (story 34-5).
    // Ping-pong 2026-06-07 MP frame guard ("die face ≠ readout ≠ server
    // total"): own frames always win; a peer DICE_REQUEST never clobbers the
    // local player's displayed roll; a peer DICE_RESULT only renders when it
    // pairs with the displayed request (same request_id) — a result under a
    // different banner was the exact mixed readout from the screenshot.
    // Spectating is preserved: with the slot idle (or already showing a
    // peer), a peer's request+result pair displays and replays normally.
    if (msg.type === MessageType.DICE_REQUEST) {
      const incomingReq = msg.payload as unknown as DiceRequestPayload;
      // Damage follow-on roll (ADR-114 §2). It carries the rolling player's own
      // id, so the local-vs-peer guard below would treat it as "own" and let it
      // CLOBBER the primary check overlay — the d20 tray would show a 2d6 damage
      // total against a bogus "need 2 on d20" banner instead of the committed
      // attack roll's value+tier (playtest 2026-06-10 dice-overlay regression,
      // #759/#760 second-broadcast). The damage is surfaced via the HP bar and
      // the opponent_hp_removed forensics; it is not the primary roll, so it
      // must never occupy the check overlay.
      if (incomingReq.roll_role === "damage") {
        console.debug(
          `[dice-guard] damage DICE_REQUEST ${incomingReq.request_id} (${incomingReq.character_name}) ` +
            `routed away from the primary check overlay`,
        );
        return;
      }
      const selfId = currentPlayerIdRef.current;
      const reqIsOwn = !!selfId && incomingReq.rolling_player_id === selfId;
      const displayed = displayedDiceRequestRef.current;
      const displayedIsOwn =
        !!selfId && displayed !== null && displayed.rolling_player_id === selfId;
      if (!reqIsOwn && displayedIsOwn) {
        // Peer frame while the local roll is displayed — drop, loudly.
        console.warn(
          `[dice-guard] peer DICE_REQUEST ${incomingReq.request_id} (${incomingReq.character_name}) ` +
            `dropped — local roll ${displayed.request_id} is displayed`,
        );
        return;
      }
      displayedDiceRequestRef.current = incomingReq;
      setDiceRequest(incomingReq);
      setDiceResult(null);
      return;
    }
    if (msg.type === MessageType.DICE_RESULT) {
      const incomingRes = msg.payload as unknown as DiceResultPayload;
      // Damage follow-on result — see the DICE_REQUEST handler above. Dropping
      // it keeps the authoritative check result (attack roll value+tier) on the
      // overlay instead of overwriting it with the weapon-damage total.
      if (incomingRes.roll_role === "damage") {
        console.debug(
          `[dice-guard] damage DICE_RESULT ${incomingRes.request_id} (${incomingRes.character_name}) ` +
            `routed away from the primary check overlay`,
        );
        return;
      }
      const selfId = currentPlayerIdRef.current;
      const resIsOwn = !!selfId && incomingRes.rolling_player_id === selfId;
      const displayed = displayedDiceRequestRef.current;
      const pairs = displayed !== null && displayed.request_id === incomingRes.request_id;
      // Drop only on a true MISMATCH (a different roll's banner is up). An
      // idle slot accepts a bare result — e.g. a reconnect that missed the
      // request frame; the tray attributes it by character_name.
      if (!resIsOwn && displayed !== null && !pairs) {
        console.warn(
          `[dice-guard] peer DICE_RESULT ${incomingRes.request_id} (${incomingRes.character_name}) ` +
            `dropped — does not pair with displayed request ${displayed?.request_id ?? "none"}`,
        );
        return;
      }
      setDiceResult(incomingRes);
      return;
    }

    // Orbital chart — server response to ORBITAL_INTENT (orbital map Task 15b).
    if (msg.type === MessageType.ORBITAL_CHART) {
      setLastOrbitalChart(msg.payload as unknown as OrbitalIntentResponse);
      // A successful chart supersedes any prior orbital rejection.
      setLastOrbitalError(null);
      return;
    }

    // Server says the session is gone — re-send the connect handshake so the
    // server can restore (or start fresh).  This happens after a server restart
    // when the client's WebSocket auto-reconnects but never re-sent the connect.
    if (msg.type === MessageType.ERROR && msg.payload.reconnect_required) {
      const saved = loadSession();
      if (saved && sendRef.current) {
        sendRef.current({
          type: MessageType.SESSION_EVENT,
          payload: {
            event: "connect",
            game_slug: saved.gameSlug,
            player_name: connectedPlayerName ?? undefined,
          },
          player_id: connectedPlayerName ?? "",
        });
      }
      return; // Don't show this error in the narrative
    }

    // ERROR frame routing — split fatal vs transient (playtest 2026-04-26).
    //
    // Fatal: a typed unrecoverable failure (`save_schema_invalid` is the
    // only one today; future ones go in FATAL_ERROR_CODES). Stop the
    // reconnect loop, show the full-screen escape panel.
    //
    // Transient: per-message validation rejection — the session is fine,
    // one payload couldn't be processed. Flash an inline banner so the
    // player knows their last input bounced; do NOT disconnect, do NOT
    // claim "the session ended". The pre-fix code path treated EVERY
    // ERROR with `reconnect_required: false` as fatal because that was
    // the default; in practice the server emits validation errors with
    // that same default and they were getting wrongly escalated.
    if (msg.type === MessageType.ERROR) {
      const errorPayload = msg.payload as unknown as ErrorPayload;
      const code = errorPayload.code ?? null;
      const isFatal = code !== null && FATAL_ERROR_CODES.has(code);
      // Orbital intent rejection (ADR-141 / 98-3 AC5): the world has no
      // renderable chart for the requested scope (e.g. the party's current
      // region has no authored systems/<region_id>.yaml — server fails
      // loud per 98-2). Surface it to the Map widget's "no local chart"
      // state; this is a chart-panel concern, not a narrative banner.
      if (code === "orbital_unavailable") {
        setLastOrbitalError({ code, message: errorPayload.message });
        // Symmetry with the ORBITAL_CHART handler (which clears the error):
        // a rejection invalidates any cached chart, or a previously-visited
        // system's orrery would render for the region that just failed
        // (review round-trip 1, story 98-3).
        setLastOrbitalChart(null);
        return;
      }
      if (isFatal) {
        setFatalError({ message: errorPayload.message, code });
        disconnectRef.current?.();
        return;
      }
      // Playtest 2026-04-30: uvicorn ``--reload`` zombies session binding.
      // The server's transport reconnects but the client's stored
      // session is no longer bound to a fresh handler instance —
      // every action gets rejected with "not connected" / "not in
      // Playing state". The server now tags those rejections with
      // ``code="session_unbound"`` so we can auto-recover by re-
      // firing SESSION_EVENT{connect} from the saved slug. The
      // player's original action is lost (one-click cost), but they
      // can immediately retry instead of being stuck on a stale
      // overlay or having to refresh the page.
      if (code === "session_unbound") {
        // Story 67-8 (Layer 3): the session is provably unbound — gate further
        // beat-commits until the rebind below confirms connected/ready again.
        setSessionBound(false);
        const saved = loadSession();
        if (saved && displayName) {
          console.info(
            "[session-unbound] auto-rebinding via SESSION_EVENT{connect}",
            { slug: saved.gameSlug, displayName },
          );
          sendRef.current?.({
            type: MessageType.SESSION_EVENT,
            payload: {
              event: "connect",
              game_slug: saved.gameSlug,
              player_name: displayName,
            },
            player_id: displayName,
          });
          // Surface a non-alarming notice so the player knows their
          // last click bounced AND that recovery is in flight. Don't
          // reuse the generic transientError — that copy is for
          // genuine validation rejections, not transparent recovery.
          setTransientError(
            "Server reconnecting — please retry your last action.",
          );
          setThinking(false);
          setCanType(true);
          // Story 71-3 (AC-4): the local action just bounced — it is no longer
          // in flight. Disarm so only a *fresh* retry that round-trips to
          // NARRATION_END clears this error, not an unrelated turn boundary.
          localTurnInFlightRef.current = false;
          return;
        }
        // No saved session OR no display name — fall through to the
        // generic transient-error path. The player will see the
        // message and can navigate manually.
      }
      // Transient — session stays open. Surface a sanitized one-liner.
      // The raw payload (often a Pydantic dump) goes to the console for
      // dev/OTEL but never to the player surface.
      console.warn("server rejected message", msg.payload);
      setTransientError(sanitizeErrorMessage(errorPayload.message));
      // Server has nothing more to send for this turn — clear thinking
      // so the input bar re-enables and the player can correct.
      setThinking(false);
      setCreationLoading(false);
      setCanType(true);
      // Story 71-3 (AC-4): the local action just bounced — disarm the in-flight
      // gate so an unrelated NARRATION_END can't clear this fresh error before
      // the player retries.
      localTurnInFlightRef.current = false;
      return;
    }

    setMessages((prev) => [...prev, msg]);
  }, [connectedPlayerName, appendCachedEvent, displayName]);

  const sendRef = useRef<typeof send | null>(null);
  // Disconnect ref so handleMessage (declared above useGameSocket) can stop
  // the reconnect loop synchronously when a fatal ERROR frame arrives.
  const disconnectRef = useRef<(() => void) | null>(null);

  const { connect, disconnect, send, readyState, isReconnecting, error } = useGameSocket({
    url: `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`,
    onMessage: handleMessage,
  });

  // MP-03 Task 8 — escalate from "reconnecting" to "offline" after 3s. The
  // ReconnectBanner covers the first few seconds of a dropped socket; if
  // recovery takes longer than that, we tell players the narrator is
  // unreachable and the view is cached/read-only. Clears instantly on
  // successful reconnect.
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (readyState === WebSocket.OPEN) {
      setOffline(false);
      return;
    }
    if (!isReconnecting) return;
    const timer = setTimeout(() => setOffline(true), 3000);
    return () => clearTimeout(timer);
  }, [readyState, isReconnecting]);

  // Story 71-3 (AC-1): clear the stale transient-error banner once the socket
  // has *successfully reconnected*. We track the true→false TRANSITION of
  // isReconnecting (via prevIsReconnectingRef), NOT the bare value, so the
  // clear fires only on genuine recovery — never on initial mount and never
  // on an error that arrived while simply connected-and-never-dropped (AC-4,
  // Reviewer-flagged React edge): on first connect prevIsReconnecting starts
  // false, so the false→false case is not a recovery and does not clear. The
  // clear requires (a) we WERE reconnecting, (b) we no longer are, and (c) the
  // socket is OPEN — a failed reconnect never reaches OPEN and never flips
  // isReconnecting back to false, so the guard stays shut and the error
  // survives the failed attempt.
  const prevIsReconnectingRef = useRef(false);
  useEffect(() => {
    const wasReconnecting = prevIsReconnectingRef.current;
    prevIsReconnectingRef.current = isReconnecting;
    if (wasReconnecting && !isReconnecting && readyState === WebSocket.OPEN) {
      setTransientError(null);
    }
  }, [readyState, isReconnecting]);
  // eslint-disable-next-line react-hooks/immutability
  sendRef.current = send;
  // eslint-disable-next-line react-hooks/immutability
  disconnectRef.current = disconnect;

  const handleCreationRespond = useCallback(
    (payload: Record<string, unknown>) => {
      send({
        type: MessageType.CHARACTER_CREATION,
        payload,
        player_id: "",
      });
      setCreationLoading(true);
    },
    [send],
  );

  // Story 67-1: when the GameBoard render subtree crashes, the ErrorBoundary
  // calls this to signal the server over the still-open socket. The server
  // drops this player from the submit-and-wait turn barrier so a render crash
  // never orphans the whole table's in-flight turn. player_id is "" — the
  // server attributes the crash to this socket's own player.
  const handleGameCrash = useCallback(
    (info: { name?: string; error: Error }) => {
      send({
        type: MessageType.CLIENT_ERROR,
        payload: { reason: "render_crash", component: info.name ?? "GameBoard" },
        player_id: "",
      });
    },
    [send],
  );

  // Send handler with slash command interception
  const handleSend = useCallback(
    (text: string, aside: boolean) => {
      // Try slash commands first — overlay triggers resolve locally
      const slashResult = executeSlashCommand(text);
      if (slashResult.handled) {
        if (slashResult.widget) {
          toggleWidget(slashResult.widget);
        }
        if (slashResult.messages.length > 0) {
          setMessages((prev) => [...prev, ...slashResult.messages]);
          for (const msg of slashResult.messages) {
            send(msg);
          }
        }
        return;
      }

      // Never send slash-prefixed text to the server as a game action.
      // Unrecognised commands are swallowed client-side to prevent
      // "Unexpected message in Playing state" errors from the backend.
      if (text.trimStart().startsWith('/')) {
        return;
      }

      const msg: GameMessage = {
        type: MessageType.PLAYER_ACTION,
        payload: { action: text, aside, round: currentRoundRef.current },
        player_id: currentPlayerIdRef.current ?? "",
      };
      setMessages((prev) => [...prev, msg]);
      send(msg);
      setCanType(false); // Sealed — wait for narration before typing again
      // Story 71-3 (AC-4): a real turn action is now in flight from the local
      // player. Arm the gate so the resulting NARRATION_END is allowed to
      // clear a stale transient error (AC-2). Asides (ADR-107) are not turn
      // round-trips — they resolve via ASIDE_ANSWER, not NARRATION_END — so
      // they must not arm the gate.
      if (!aside) {
        localTurnInFlightRef.current = true;
        // Hold the submitted text until the turn actually runs — restored
        // into the InputBar if the server bounces it with GAME_PAUSED
        // (sq-playtest 2026-06-07 silent blocked-paused drop).
        lastSubmittedActionRef.current = text;
      }
      // Optimistic thinking indicator: show the three-dinkus pulse + themed
      // placeholder immediately on submit instead of waiting for the server's
      // THINKING message. The server will confirm via its own setThinking(true)
      // at line 201; setting it here just eliminates the blank-input-between-
      // submit-and-server-ack gap that made submits feel like they no-oped.
      setThinking(true);
    },
    [send, executeSlashCommand, toggleWidget, currentRound],
  );

  const currentPlayerId = useMemo(
    () => partyMembers.find((m) => m.name === connectedPlayerName)?.player_id ?? null,
    [partyMembers, connectedPlayerName],
  );
  // Keep the handleSend refs (#G3) pointed at the latest round + seated player.
  currentRoundRef.current = currentRound;
  currentPlayerIdRef.current = currentPlayerId;

  const peerReveals = usePeerReveals({ selfPlayerId: currentPlayerId, round: currentRound });
  peerRevealsApplyRef.current = peerReveals.apply;
  peerRevealsClearRef.current = peerReveals.clear;

  // Story 71-4: persisted peer-action accumulator + the snapshot/reset bridges.
  // `snapshot` reads the CURRENT firewall-filtered reveals and captures them;
  // assigned here (alongside apply/clear) because handleMessage is declared
  // before peerReveals exists. The snapshot mirrors the e2e Host bridge exactly.
  const persistedPeerActions = usePersistedPeerActions();
  // GUARD (Story 71-12): MUST capture from the RAW reveals (`peerReveals.reveals`),
  // NEVER from `mergedPeerReveals` (defined just below). `mergedPeerReveals` folds in
  // TURN_STATUS submitted-status for display, so a row's status can be frozen at a past
  // turn's value. Snapshotting the merged map would persist that stale draft into the
  // accumulator — peer actions would then surface under out-of-date context (the
  // stale-draft regression). The merged map is display-only; the accumulator is canonical.
  // Keep this fed from `peerReveals.reveals`. See ADR-104/105 (perception firewall) and 71-10.
  peerRevealsSnapshotRef.current = () =>
    persistedPeerActions.capture(currentRound, peerReveals.reveals);
  persistedPeerActionsResetRef.current = persistedPeerActions.reset;

  // Merge TURN_STATUS authoritative submitted status into the ACTION_REVEAL
  // peer-reveal map. ACTION_REVEAL is a best-effort visibility channel; a
  // late-fire composing event can race past the submitted event and pin the
  // PeerRevealList row on "<peer> is composing" even after the server has
  // emitted TURN_STATUS{submitted} for that peer (sq-playtest 2026-05-12
  // [BUG-LOW] mid-flight TURN_STATUS mislabel). TURN_STATUS is the
  // server-authoritative signal — when it says submitted, the row must
  // show submitted regardless of what the ACTION_REVEAL state machine
  // last saw.
  const mergedPeerReveals = useMemo(
    () => mergePeerRevealsWithSubmittedStatus(peerReveals.reveals, turnStatusEntries),
    [peerReveals.reveals, turnStatusEntries],
  );


  // ADR-036: Outbound ACTION_REVEAL — broadcast composing/submitted reveals to peers.
  // Sourced from partyMembers; character_name falls back to name if missing.
  const localCharacterName = useMemo(
    () =>
      partyMembers.find((m) => m.player_id === currentPlayerId)?.character_name ??
      partyMembers.find((m) => m.player_id === currentPlayerId)?.name ??
      null,
    [partyMembers, currentPlayerId],
  );

  // Keep the ref handleMessage reads in sync (the incapacitation gate matches
  // the downed character against the local PC).
  useEffect(() => {
    localCharacterNameRef.current = localCharacterName;
  }, [localCharacterName]);

  const handleReveal = useCallback(
    (call: InputBarRevealCall) => {
      sendRef.current?.({
        type: MessageType.ACTION_REVEAL,
        payload: {
          player_id: currentPlayerId ?? "",
          character_name: localCharacterName ?? "",
          status: call.status,
          action: call.action,
          aside: call.aside,
          seq: call.seq,
          round: currentRound,
        },
        player_id: currentPlayerId ?? "",
      } as unknown as GameMessage);
    },
    [currentPlayerId, localCharacterName, currentRound],
  );

  const partyOrder = useMemo(
    () => partyMembers.map((m) => m.player_id),
    [partyMembers],
  );

  // Structured beat dispatch via BEAT_SELECTION protocol message.
  //
  // Sends the exact beat_id from ConfrontationDef — NO text synthesis, NO
  // natural-language label, NO dependency on narrator interpretation or
  // label_fallback fuzzy matching. The server validates the beat_id strictly
  // and applies the mechanical delta before the narrator runs.
  //
  // Replaces commit 05a3dfb which synthesized `"${beat.label} (${beat.stat_check})"`
  // as a PLAYER_ACTION text string — violating: no keyword matching (Zork Problem,
  // ADR-010/032), no silent fallbacks (CLAUDE.md × 4 repos), no half-wired features.
  const handleBeatSelect = useCallback(
    (beatId: string, playerAction?: string, spellId?: string) => {
      // Story 67-8 (Layer 3): single gate for every beat-commit precondition —
      // thinking (duplicate), no active confrontation, unknown beat, and the
      // load-bearing one: session not bound (AwaitingConnect). A beat issued
      // while unbound would flush a DICE_THROW into an OPEN-but-unbound socket
      // and be rejected `session_unbound`, stranding the confrontation. Refuse
      // (and let the player retry) — never queue (AC4: no buffering).
      const block = beatDispatchBlockReason(beatId, {
        thinking,
        sessionBound,
        confrontationData,
      });
      if (block) {
        console.warn(`[beat-dispatch] "${beatId}" suppressed: ${block.logReason}`);
        if (block.code === "session_unbound") {
          // Surface the same transparent-recovery notice the reactive
          // session_unbound handler uses — the action bounced, retry shortly.
          setTransientError("Server reconnecting — please retry your roll in a moment.");
        }
        return;
      }
      // Safe to dispatch — the gate above already proved confrontationData is
      // present and contains this beat. Re-narrow for the type checker (and as
      // cheap defense in depth) rather than asserting non-null.
      const beat: BeatOption | undefined = confrontationData?.beats.find(
        (b) => b.id === beatId,
      );
      if (!beat) {
        // Unreachable: the gate above already proved this beat exists. If we
        // ever land here, the gate's invariant has broken — fail LOUDLY
        // (No Silent Fallbacks) rather than silently swallowing the commit.
        console.error(
          `[beat-dispatch] INVARIANT VIOLATED: beat "${beatId}" absent after gate passed — dropping`,
        );
        return;
      }
      // Story 106-4 Part C: a "Drink <potion>" item-use beat is AUTO-SUCCESS,
      // no-roll. It carries no server-authored `difficulty`, so it must NOT take
      // the d20 dice-tray path below (which refuses difficulty-less beats). Commit
      // it directly: the server resolves the heal + consume and the opponent's
      // own answer. `throw_params`/`face` are required wire fields but ignored
      // server-side for item-use (no dice were rolled) — send a zeroed pair.
      if (isItemUseBeat(beatId)) {
        send({
          type: MessageType.DICE_THROW,
          payload: {
            request_id: makeRequestId(),
            throw_params: { velocity: [0, 0, 0], angular: [0, 0, 0], position: [0.5, 0.5] },
            face: [1],
            beat_id: beatId,
          },
          player_id: currentPlayerId ?? "",
        } as unknown as GameMessage);
        return;
      }
      // Build DiceRequest locally — no server round-trip needed.
      // The server will receive beat_id + face + seed in one DiceThrow message.
      const statVal = characterSheet?.stats[beat.stat_check] ?? 10;
      const modifier = Math.floor((statVal - 10) / 2);
      // Story 97-3: the server is the ONLY DC author. The beat offer carries
      // a server-computed `difficulty` (native: beat DC; SWN/hp_depletion:
      // the target's armor class — a number this client cannot know). The
      // old client formula (`clamp(10 + |base|*2, 10..30)`) silently diverged
      // from the server's effective difficulty and made the TARGET banner
      // lie; a beat offer without a server DC is malformed — refuse LOUDLY
      // (No Silent Fallbacks), never resurrect the formula.
      if (typeof beat.difficulty !== "number") {
        console.error(
          `[beat-dispatch] "${beatId}" refused: beat offer carries no server-authored difficulty — ` +
            "the server must author the DC (Story 97-3); the client computes nothing.",
        );
        // Rework round 1: loud means loud TO THE PLAYER (Alex clicks, nothing
        // happens, and he will never open devtools). Same transient strip the
        // session_unbound refusal uses — the click bounced, not the game.
        setTransientError(
          "That move arrived without its difficulty from the server — try re-selecting it, or report this if it persists.",
        );
        return;
      }
      const charSheetName = characterSheet?.name;
      const charLooseName = character?.name;
      const charName: string =
        charSheetName ??
        (typeof charLooseName === "string" ? charLooseName : "Unknown");
      const localReq: DiceRequestPayload = {
        request_id: makeRequestId(),
        rolling_player_id: currentPlayerId ?? "",
        character_name: charName,
        dice: [{ sides: 20, count: 1 }],
        modifier,
        stat: beat.stat_check,
        difficulty: beat.difficulty,
        context: `${beat.label} — ${beat.stat_check} check`,
      };
      pendingBeatIdRef.current = beatId;
      // Stash the player's typed action so handleDiceThrow can attach it
      // to the DICE_THROW once physics settles. Trim defensively; empty
      // string is the well-defined "no action typed" case.
      pendingPlayerActionRef.current = (playerAction ?? "").trim();
      // Story 102-2: stash the picker's chosen spell the same way — null on
      // every non-cast beat, so the DICE_THROW key is attached iff a spell
      // was actually chosen.
      pendingSpellIdRef.current = spellId ?? null;
      displayedDiceRequestRef.current = localReq;
      setDiceResult(null);
      setDiceRequest(localReq);
    },
    [confrontationData, thinking, sessionBound, characterSheet, character, currentPlayerId, send],
  );


  // Dice throw — sent after local physics settles with the client-reported
  // face values (physics-is-the-roll, story 34-12). The server treats `face`
  // as the authoritative roll result and echoes `throw_params` to spectators
  // for deterministic replay animation.
  // Orbital chart — UI sends OrbitalIntent over the WebSocket (orbital map
  // Task 15b/16). Server replies with ORBITAL_CHART, which feeds back via
  // ``lastOrbitalChart`` above. ``sendRef`` is read at call time so the
  // callback survives reconnects without re-binding.
  const sendOrbitalIntent = useCallback((intent: OrbitalIntent) => {
    if (!sendRef.current) return;
    sendRef.current({
      type: MessageType.ORBITAL_INTENT,
      payload: intent,
      player_id: "",
    } as unknown as GameMessage);
  }, []);

  const handleDiceThrow = useCallback(
    (params: DiceThrowParams, face: number[]) => {
      if (!diceRequest) return;
      // Story 67-8 (Layer 3, post-review): the roll may have STARTED while the
      // session was bound, but the session can unbind during the ~1-2s dice
      // physics animation. Never flush a DICE_THROW into an OPEN-but-unbound
      // socket — refuse and let the player re-roll. Not a buffer: the rolled
      // result is discarded and the dice state reset (AC4 / No Silent
      // Fallbacks). handleBeatSelect gates roll START; this gates roll SEND.
      if (!sessionBound) {
        console.warn(
          "[dice-throw] suppressed — session not bound (AwaitingConnect) at throw time",
        );
        setTransientError("Server reconnecting — please retry your roll in a moment.");
        pendingBeatIdRef.current = null;
        pendingPlayerActionRef.current = "";
        pendingSpellIdRef.current = null;
        displayedDiceRequestRef.current = null;
        setDiceResult(null);
        setDiceRequest(null);
        return;
      }
      const beatId = pendingBeatIdRef.current;
      pendingBeatIdRef.current = null;
      // Consume the latched player_action atomically with the beat id.
      // The ref is reset even when beatId is null so a stale free-roll
      // can't accidentally inherit a prior beat's draft text.
      const playerAction = pendingPlayerActionRef.current;
      pendingPlayerActionRef.current = "";
      // Story 102-2: consume the latched spell the same way — reset
      // unconditionally so a later non-cast commit can never inherit it.
      const spellId = pendingSpellIdRef.current;
      pendingSpellIdRef.current = null;
      // REGRESSION fix (playtest 2026-06-04): in a confrontation the player's
      // typed action rides the beat-commit DICE_THROW, not a PLAYER_ACTION
      // frame, so the local transcript never grew a player-echo card — combat
      // was unfollowable ("chandelier swinging completely broken"). The server
      // records this as a `player` narrative author (save /timeline), but the
      // UI dropped it. Mirror handleSend: push a PLAYER_ACTION echo into our own
      // `messages` so the typed line renders alongside the narrator response,
      // exactly as a free-text submit does out of combat. Only when the player
      // actually typed something on a beat roll — a bare beat click (empty
      // player_action) has no text to echo, and a free roll (no beatId) is not
      // a turn action.
      if (beatId && playerAction) {
        setMessages((prev) => [
          ...prev,
          {
            type: MessageType.PLAYER_ACTION,
            payload: {
              action: playerAction,
              aside: false,
              round: currentRoundRef.current,
            },
            player_id: currentPlayerIdRef.current ?? "",
          },
        ]);
      }
      send({
        type: MessageType.DICE_THROW,
        payload: {
          request_id: diceRequest.request_id,
          throw_params: params,
          face,
          ...(beatId ? { beat_id: beatId } : {}),
          ...(beatId && playerAction ? { player_action: playerAction } : {}),
          // Story 102-2: the chosen prepared spell rides the cast-beat commit
          // so the server routes the WN cast spine. Key OMITTED on every
          // non-cast throw — pre-102-2 wire shape unchanged.
          ...(beatId && spellId ? { spell_id: spellId } : {}),
        },
        player_id: "",
      });
      // If this was a beat roll, set thinking — narrator will run server-side
      if (beatId) {
        setCanType(false);
        setThinking(true);
        // Story 71-3 (AC-2/AC-4): a beat roll is a genuine local turn
        // submission that round-trips to NARRATION_END — arm the in-flight
        // gate so a stale transient error clears when the beat resolves
        // (confrontation play, where Sebastien/Jade live, hits this constantly).
        localTurnInFlightRef.current = true;
      }
    },
    [diceRequest, sessionBound, send],
  );

  // Yield action — player steps out of an active confrontation on their terms.
  // Sends a YIELD message to the server; server refreshes edge by 1 + statuses taken.
  const handleYield = useCallback(() => {
    send({
      type: MessageType.YIELD,
      payload: {},
      player_id: "",
    });
    // Story 71-3 (AC-2/AC-4): a yield is a genuine local turn submission that
    // round-trips to NARRATION_END — arm the in-flight gate so a stale
    // transient error clears when the yield resolves.
    localTurnInFlightRef.current = true;
  }, [send]);

  // Story 118-6 / ADR-144 F3f: a Fate action committed from the conflict surface
  // (proactive tile, invoke-bearing action, or concede). Serialized onto a
  // FATE_ACTION message over the WebSocket (the F1d explicit channel) — the
  // server's FateActionHandler is the economy + validation authority. The freeform
  // flourish rides as player_action (narrator color, sanitized server-side).
  const handleFateAction = useCallback(
    (action: FateActionInput) => {
      send({
        type: MessageType.FATE_ACTION,
        payload: {
          request_id: makeRequestId(),
          action: action.action,
          skill: action.skill ?? "",
          target: action.target ?? null,
          difficulty: 0,
          invoke_aspect: action.invoke_aspect ?? "",
          invoke_mode: action.invoke_mode ?? "bonus",
          aspect_text: action.aspect_text ?? "",
          player_action: action.player_action ?? "",
        },
        player_id: "",
      });
      // A committed Fate action is a genuine local turn submission — arm the
      // in-flight gate so a stale transient error clears when it resolves
      // (mirrors handleYield).
      localTurnInFlightRef.current = true;
    },
    [send],
  );

  const navigate = useNavigate();

  // Bug 6: Leave game — disconnect, clear state, return to lobby.
  // Playtest 2026-04-23: must also navigate to "/" — at /solo/:slug, leaving
  // state-only causes the slug-connect effect to re-fire and immediately
  // reload the same session, making the button look broken.
  const handleLeave = useCallback(() => {
    disconnect();
    clearSession();
    setConnected(false);
    setMessages([]);
    // Story 65-16 AC1: drop the prior session's R2 backfill. preloadedAssets is
    // a pure ImageBus input that deliberately survives the reconnect purge
    // (65-4), but on an explicit leave it must NOT leak into the next session.
    setPreloadedAssets([]);
    // A failed-preload banner (AC2b) is per-session too — clear it so it does
    // not bleed into the lobby or the next session.
    setTransientError(null);
    setCharacter(null);
    setCreationScene(null);
    // Story 66: drop the fetched portrait pickers too — without this a
    // same-session world switch briefly shows the previous world's
    // portraits before the new pick_portrait fetch resolves.
    setCreationPortraits([]);
    setThinking(false);
    setCharacterSheet(null);
    setInventoryData(null);
    setMapData(null);
    setPartyMembers([]);
    setPartyCompanions([]);
    setConnectedPlayerName("");
    setActivePlayerName(null);
    setCanType(true);
    setConfrontationData(null);
    setConfrontationOutcome(null);
    displayedDiceRequestRef.current = null;
    setDiceRequest(null);
    setDiceResult(null);
    setPaused(false);
    setPauseWaitingFor([]);
    setIncapacitation(null);
    setSeatedPlayers({});
    setOffline(false);
    seenEventKeysRef.current.clear();
    sessionPhaseRef.current = "connect";
    setSessionPhase("connect");
    autoReconnectAttempted.current = false;
    // Reset slug-connect session state so the NEXT game's slug-connect
    // effect fetches GET /api/games/:new-slug and opens a fresh WebSocket.
    // Without this, `slugConnectFired.current` stays latched to `true` from
    // the prior session — the short-circuit at the top of the effect
    // (`if (slugConnectFired.current) return;`) fires, no fetch happens,
    // no WS opens, UI hangs on "The pages are turning…" forever. The user
    // can only escape by typing the URL manually (full page reload resets
    // all refs). Playtest 2026-04-24 "Post-lobby hang on new-genre first
    // game" bug — confirmed genre-agnostic (MW → C&C, C&C → SO).
    slugConnectFired.current = false;
    justConnectedRef.current = false;
    pendingConnectPayloadRef.current = null;
    setGameMetaError(null);
    setCurrentGenre(null);
    setCurrentWorld(null);
    setWorldOrbital(false);
    // Route off the slug — otherwise the slug-connect effect re-fires.
    // disconnect() above already flushed the SESSION_EVENT outbound.
    navigate("/");
  }, [disconnect, navigate]);

  // Unlock AudioContext on first user gesture (click or keypress).
  // Chrome's autoplay policy blocks audio until a user interaction occurs.
  // We cannot call ensureResumed() eagerly or from auto-reconnect.
  useEffect(() => {
    const engine = audio.engine;
    if (!engine) return;

    const unlock = () => {
      engine.ensureResumed();
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };

    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [audio.engine]);

  // Scene harness: if ?scene=NAME is in the URL, POST to /dev/scene/:name
  // to stage the save. Server returns { slug } (game_slug). Dev harness only —
  // requires the server running with DEV_SCENES=1. Navigates to /solo/:slug
  // so AppInner owns the WebSocket session via the slug-based flow.
  // Blocks the normal autoReconnect path by flipping `autoReconnectAttempted`
  // so the two don't race.
  //
  // Fail loud on any error: a broken scene harness load is a dev-side bug
  // that must be visible, not silently fall back to the manual ConnectScreen.
  const sceneHarnessAttempted = useRef(false);
  useEffect(() => {
    if (sceneHarnessAttempted.current) return;
    const params = new URLSearchParams(window.location.search);
    const sceneName = params.get("scene");
    if (!sceneName) return;
    sceneHarnessAttempted.current = true;
    autoReconnectAttempted.current = true;
    fetch(`/dev/scene/${encodeURIComponent(sceneName)}`, { method: "POST" })
      .then((r) => {
        if (!r.ok) {
          return r.text().then((body) => {
            throw new Error(`${r.status} ${body || r.statusText}`);
          });
        }
        return r.json() as Promise<{ slug: string }>;
      })
      .then(({ slug: sceneSlug }) => {
        console.info(`[scene-harness] loaded ${sceneName} → /solo/${sceneSlug}`);
        navigate(`/solo/${sceneSlug}`);
      })
      .catch((err: Error) => {
        console.error("[scene-harness] failed:", err);
        window.alert(`Scene harness '${sceneName}' failed: ${err.message}`);
      });
  }, [navigate]);

  // Auto-reconnect on page refresh if we have a saved session with a game_slug.
  // Navigates to /solo/:slug — AppInner owns the WebSocket session.
  // No fallback to the legacy genre+world+player path: if there is no slug,
  // the session is stale (pre-MP-01) and must not be reconnected silently.
  //
  // Playtest 2026-04-24: respect URL slug. If the user typed (or was
  // navigated to) /solo/:slug or /play/:slug — e.g. via a Past Journeys
  // click, a shared link, or manual URL entry — trust the URL and let
  // the slug-connect effect below run against it. Without this guard,
  // localStorage's last session unconditionally overrode the URL and
  // shareable/resumable links became inert.
  useEffect(() => {
    if (autoReconnectAttempted.current) return;
    autoReconnectAttempted.current = true;
    if (slug) return;
    const saved = loadSession();
    if (!saved) return;
    // Pingpong 2026-04-30: this navigate used to always write /solo/
    // regardless of the saved session's actual mode. Half the tabs in
    // a 4P MP playtest reload ended up on /solo/<MP-slug> while peers
    // stayed on /play/<MP-slug>; the URL stopped reflecting the
    // session's mode and the per-prefix reducers would have started
    // diverging on the next mode-gated render. Resume the saved session
    // on the prefix that matches its mode. Old saved sessions written
    // before this fix lack the mode field and default to "solo" — same
    // outcome as the pre-fix behavior for those rows.
    const prefix = saved.mode === "multiplayer" ? "/play" : "/solo";
    navigate(`${prefix}/${saved.gameSlug}`);
  }, [navigate, slug]);

  // Slug-mode connect: when AppInner mounts at /solo/:slug or /play/:slug,
  // fetch GET /api/games/:slug (metadata) and then fire SESSION_EVENT{connect}.
  //
  // The fetch is inlined here (rather than a separate effect) so that the
  // connect fires in the same async chain as the metadata resolution — this
  // avoids an extra React render cycle and keeps tests straightforward.
  //
  // Gate order:
  //   1. slug must be present.
  //   2. displayName must be set (NamePrompt may still be showing).
  //   3. Metadata fetch must succeed — seeds currentGenre before the WS
  //      connect fires so genre theming is already applied.
  //   If metadata fetch fails, gameMetaError is set and connect does NOT fire.
  //
  // The existing sessionPhase state machine takes over from the server response:
  //   connected + !has_character → "creation"
  //   ready                      → "game"
  //
  // Dependency on `displayName` means it re-fires after NamePrompt confirms —
  // which is the intended behavior (we need a name before connecting).
  // (`slugConnectFired` ref is declared above with the other
  //  session-lifecycle refs so `handleLeave` can reset it.)
  useEffect(() => {
    if (!slug) return;
    if (!displayName) return; // Wait for NamePrompt
    // Mirror the render-time trust gate (see slug-mode prompt block below):
    // a cached `sq:display-name` alone is NOT a trusted identity for this
    // slug. Without this guard the effect would fire on the same mount that
    // the render returned <NamePrompt>, fetch metadata, open the WS as the
    // stale name, and write the slug into history — silently rebinding
    // identity before the user could confirm. See playtest 2026-04-26
    // (Richie/Potsie regression). identityConfirmedForSlug is added to the
    // dep array so the effect re-fires after handleNameSubmit latches.
    // [BAR-1] 2026-06-05: scope "known" to THIS identity (kept identical to the
    // render gate above). Matching on game_slug alone let a slug left in history
    // by a PRIOR player skip the NamePrompt for a DIFFERENT joiner — the cached
    // display-name was silently bound into that session (Groucho navigated to a
    // barsoom URL, bounced through "/" which auto-resumed a prior player's
    // the_circuit solo save, and the slug-in-history check connected Groucho
    // into the foreign save with no confirmation). Same silent-rebind class as
    // Lenny/Laverne and Richie/Potsie; same fix — re-prompt rather than assume
    // identity. A returning player (display-name matches the entry) still skips.
    const slugKnown = loadHistory().some(
      (e) => e.game_slug === slug && e.player_name === displayName,
    );
    const confirmedThisSlug = identityConfirmedForSlug === slug;
    if (!confirmedThisSlug && !slugKnown) return; // Wait for NamePrompt confirmation
    if (slugConnectFired.current) return;
    // Do NOT latch slugConnectFired here. In React 18 StrictMode the dev-mode
    // double-invoke runs effect → cleanup → effect on initial mount; latching
    // up-front would have the cleanup mark the in-flight fetch as `cancelled`,
    // and the second effect run would short-circuit on the already-true latch
    // — net result: fetch resolves into a cancelled closure, connect() never
    // fires, and the UI sticks on the "pages are turning…" loader forever.
    // Instead, latch *after* the success path runs connect(); cancelled-pass
    // returns are no-ops, and the surviving pass is the one that latches.
    // MP-03: snapshot the peer cache high-water mark at the moment the
    // effect fires. `getLatestSeq` is ref-backed so this is synchronous and
    // reflects whatever IDB has loaded by now. If IDB hasn't resolved yet,
    // we send 0 and accept an unnecessary replay (which dedupe handles).
    const lastSeenSeq = getCachedLatestSeq();
    let cancelled = false;
    fetch(`/api/games/${encodeURIComponent(slug)}`)
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`failed to load game: ${resp.status}`);
        return resp.json() as Promise<{
          genre_slug: string;
          world_slug: string;
          mode: string;
          orbital?: boolean;
        }>;
      })
      .then((body) => {
        if (cancelled) return;
        // Re-check the latch under the surviving closure: if a sibling
        // StrictMode pass already won the race and called connect(), bail
        // out so we don't double-fire the SESSION_EVENT connect handshake.
        if (slugConnectFired.current) return;
        slugConnectFired.current = true;
        // Seed genre state before WS connect fires so theming is applied
        // immediately — GameBoard key, chrome archetype, resource SFX all
        // depend on currentGenre being non-null on first game render.
        setCurrentGenre(body.genre_slug);
        setCurrentWorld(body.world_slug);
        // Server-announced orbital capability (orbits.yaml on the world).
        // Missing field (older server) reads as false — flat map only.
        setWorldOrbital(body.orbital === true);
        // Record this slug in journey history so a page refresh on this
        // tab doesn't re-trigger the slug-mode NamePrompt. Player 1 already
        // appends history via ConnectScreen; this call covers Player 2's
        // direct-URL join path. mode is normalized — the API returns the
        // raw string but JourneyEntry expects "solo" | "multiplayer".
        const normalizedMode: "solo" | "multiplayer" =
          body.mode === "solo" ? "solo" : "multiplayer";
        // Save mode alongside the slug so the auto-reconnect path
        // resumes on the correct prefix (/play/ for MP, /solo/ for solo).
        // Pre-fix this saved only the slug and the auto-reconnect always
        // wrote /solo/<slug> — pingpong 2026-04-30 caught the URL rewrite
        // on MP reload.
        saveSession(slug, normalizedMode);
        // Stash the mode so the MP session widget can decide whether to
        // render. Solo mode: nothing to share, no roster — widget hidden.
        setSessionMode(normalizedMode);
        appendHistory({
          player_name: displayName,
          genre: body.genre_slug,
          world: body.world_slug,
          game_slug: slug,
          mode: normalizedMode,
        });
        setConnectedPlayerName(displayName);
        justConnectedRef.current = true;
        // Stash the SESSION_EVENT payload for dispatch from the
        // readyState=OPEN effect below. player_name carries the
        // human-readable display name from localStorage['sq:display-name'].
        // Required: without it the server falls back to the opaque
        // player_id for the lobby name, and any genre without a
        // name-entry chargen scene (mutant_wasteland etc.) ends up with
        // a UUID on the character sheet header. See playtest 2026-04-23
        // Bug 1.
        pendingConnectPayloadRef.current = {
          type: MessageType.SESSION_EVENT,
          payload: {
            event: "connect",
            game_slug: slug,
            last_seen_seq: lastSeenSeq,
            player_name: displayName,
            // Story 82-2 (ADR-049): carry the lobby-chosen narrator tuning so
            // the server reads it into the per-turn TurnContext. Absent keys
            // are omitted (server falls back to default_for_player_count).
            ...loadNarratorPrefs(),
          },
          player_id: displayName,
        };
        connect();
        setConnected(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Latch was never set (we only latch on the success path now), so
        // the retryCount increment will naturally re-fire the effect.
        setGameMetaError(err instanceof Error ? err.message : "Failed to load game metadata");
      });
    return () => { cancelled = true; };
  }, [slug, displayName, connect, retryCount, getCachedLatestSeq, identityConfirmedForSlug]);

  // WebSocket OPEN transitions — two separate concerns, split into two effects
  // so the cleanup path doesn't depend on App-level `connected` state.
  //
  // Playtest 2026-04-11: this used to be a single effect gated on
  // `readyState === OPEN && wasDisconnected && connected`. The `&& connected`
  // guard is a foot-gun on the initial page-reload path: when the WebSocket
  // first transitions to OPEN, App's `connected` state is still `false`
  // (the slug-connect effect hasn't completed yet). The effect's guard fails.
  // By the time `connected` flips to true, `prevReadyState.current` has already
  // been set to OPEN, so `wasDisconnected` is now false and the effect fails
  // the guard a second time. Net result: on a server-restart + page-reload cycle,
  // the cleanup never runs, and any state that gets stuck during restoration
  // (canType=false, thinking=true) stays stuck until the user leaves the
  // session. See ping-pong playtest 2026-04-11 "InputBar stuck disabled".
  const prevReadyState = useRef(readyState);

  // (0) Slug-connect SESSION_EVENT dispatch on readyState=OPEN.
  // Replaces a 300ms setTimeout that fired blindly regardless of socket
  // state (story 45-25). The slug-connect effect stashes the payload in
  // `pendingConnectPayloadRef` and calls connect(); this effect drains
  // the ref the moment the socket reaches OPEN. Synchronous-OPEN case
  // (StrictMode remount, cached socket) is naturally covered: the effect
  // also runs on mount, and if readyState is already OPEN with a
  // pending payload, it dispatches.
  //
  // Critical: clear the ref AFTER dispatch. Under React 18 StrictMode
  // the dev-mode double-mount runs effect → cleanup → effect; without
  // the clear, the second run would re-send and the server would
  // resolve the opening hook twice.
  useEffect(() => {
    if (readyState === WebSocket.OPEN && pendingConnectPayloadRef.current) {
      sendRef.current?.(pendingConnectPayloadRef.current);
      pendingConnectPayloadRef.current = null;
    }
  }, [readyState]);

  // (1) Defensive state reset — fires on ANY OPEN transition regardless of
  // whether we were "already connected" in App state. Clearing `canType` to
  // `true` and `thinking` to `false` is always safe here: the only path that
  // sets them to "busy" is `handleSend`, which the user cannot call while the
  // input is disabled. Over-firing is intentional — stuck state is the bug,
  // clearing redundantly is not.
  useEffect(() => {
    if (readyState === WebSocket.OPEN && prevReadyState.current !== WebSocket.OPEN) {
      setThinking(false);
      // Do NOT set canType here — the server's "ready" or "waiting"
      // SessionEvent is authoritative. Blindly enabling input races
      // with barrier state on reconnect (see playtest 2026-04-12).
    }
  }, [readyState]);

  // (1b) Story 67-8 (Layer 3): the session is bound only while the socket is
  // OPEN. Any non-OPEN readyState — CONNECTING during a fresh or re-handshake,
  // CLOSING/CLOSED on a drop — means we are back in AwaitingConnect until the
  // server re-confirms connected/ready. Block beat-commit until then so a
  // DICE_THROW is never issued into an unbound socket. (The zombie-bind case —
  // socket stays OPEN but the server session is unbound — is covered by the
  // `session_unbound` reset in handleMessage.)
  useEffect(() => {
    if (readyState !== WebSocket.OPEN) setSessionBound(false);
  }, [readyState]);

  // (2) Re-handshake on reconnect — keeps the original conservative gate.
  // Only re-sends the SESSION_EVENT "connect" payload when the app was
  // previously `connected` (i.e. this is a genuine mid-session reconnect,
  // not the first page-load handshake which is handled by the slug-connect
  // effect above). Uses game_slug — no legacy genre+world+player fallback.
  //
  // Ping-pong 2026-06-07 ("client auto-reconnects but never re-binds"): the
  // rebind keys off the URL slug, NOT the sessionStorage row. A restarting
  // server refuses the first backoff retry, firing onerror — and the
  // `error → clearSession()` effect below wipes the saved session during
  // that window. By the time the socket reopens, loadSession() is null and
  // the old code fell through SILENTLY: an OPEN-but-unbound socket where
  // every PLAYER_ACTION died with `session.message_rejected_unbound`. The
  // URL slug is the authoritative session identity for the whole
  // /solo|play/:slug mount (the slug-connect effect and a manual page
  // reload both use it); the saved session is only a fallback for slugless
  // mounts. No identity at all → fail loud, never silently skip the bind.
  useEffect(() => {
    const wasDisconnected = prevReadyState.current !== WebSocket.OPEN;
    prevReadyState.current = readyState;
    if (readyState === WebSocket.OPEN && wasDisconnected && connected) {
      // Suppress the duplicate connect on the initial handshake: the
      // slug-connect effect already scheduled a SESSION_EVENT{connect}
      // and sending another one here makes the server resolve the opening
      // hook twice.
      if (justConnectedRef.current) {
        justConnectedRef.current = false;
        return;
      }
      const gameSlug = slug ?? loadSession()?.gameSlug;
      if (!gameSlug) {
        console.error(
          "[reconnect] socket reopened but no game slug to re-bind — " +
            "no URL slug and no saved session; the session stays unbound",
        );
        return;
      }
      send({
        type: MessageType.SESSION_EVENT,
        payload: {
          event: "connect",
          game_slug: gameSlug,
          player_name: displayName ?? undefined,
        },
        player_id: displayName ?? "",
      });
    }
  }, [readyState, connected, send, slug, displayName]);

  // If connection fails, clear saved session so we don't loop
  useEffect(() => {
    if (error) {
      clearSession();
    }
  }, [error]);

  const isConnecting = connected && readyState !== WebSocket.OPEN;
  const socketError = error ? "Connection failed. Is the game server running?" : null;
  // Unified alert string: surface both socket errors and game-metadata load failures.
  const alertError = [socketError, gameMetaError].filter(Boolean).join(" — ") || null;

  // Build game messages including character info
  const gameMessages = character
    ? [
        ...messages,
      ]
    : messages;

  // MP session-status roster (playtest 2026-04-26 GAP). Combines:
  //   - the local player (always present once connectedPlayerName is set)
  //   - peers from PLAYER_PRESENCE events (connectedPeerIds)
  // status mapping: in seatedPlayers → "ready", else → "in-chargen". The
  // widget only renders during sessionPhase === "creation" so "playing"
  // never appears here in practice; the mapping is left simple.
  const mpSessionPlayers: SessionPlayerStatus[] = useMemo(() => {
    if (!connectedPlayerName) return [];
    const all = new Set<string>(connectedPeerIds);
    all.add(connectedPlayerName);
    return Array.from(all).map((id) => ({
      id,
      isSelf: id === connectedPlayerName,
      status: id in seatedPlayers ? "ready" : "in-chargen",
    }));
  }, [connectedPlayerName, connectedPeerIds, seatedPlayers]);

  // Map characters for PartyPanel — prefer PARTY_STATUS (has portrait_url), fall back to state_delta
  const characters: CharacterSummary[] = useMemo(
    () =>
      partyMembers.length > 0
        ? partyMembers
        : gameState.characters.map((c) => ({
            player_id: "",
            name: c.name,
            character_name: c.name,
            hp: c.hp,
            hp_max: c.max_hp,
            status_effects: c.statuses,
            class: "",
            level: 1,
            current_location: "",
          })),
    [partyMembers, gameState.characters],
  );

  // Turn gating — two multiplayer models:
  // 1. Sequential (FreePlay): server sends "active" for the acting player, others wait
  // 2. Sealed-letter (Structured): ALL players submit simultaneously, no "active" player
  //
  // In sealed-letter mode, activePlayerName stays null. Input is disabled only
  // when THIS player has already submitted (tracked via turnStatusEntries).
  const isMultiplayer = partyMembers.length > 1 || turnStatusEntries.length > 0 || activePlayerName !== null;
  const activePlayerId = useMemo(
    () => activePlayerName ? (partyMembers.find((m) => m.name === activePlayerName)?.player_id ?? null) : null,
    [partyMembers, activePlayerName],
  );

  // MP input-state classifier (playtest 2026-04-29 HIGH/BUG-LOW + turn-indicator
  // bugs). The UI used to conflate every locked-input state into one placeholder
  // ("Waiting for other players…") and one banner ("It's <X>'s turn…"), neither
  // of which matched the simultaneous-action server model:
  //   - Banner "It's X's turn" implied alternating-turn → made Alex think she
  //     was holding up the group, made Sebastien notice the UI/server mismatch.
  //   - Placeholder "Waiting for other players" was sometimes correct (peers
  //     hadn't submitted) and sometimes wrong (all submitted, narrator running).
  //
  // The classifier returns one of three states:
  //   - 'free': local hasn't submitted yet — input enabled, banner says
  //     "<name> — declare your action" or "<peer> acted — declare yours when ready".
  //   - 'waiting-on-peers': local submitted, at least one peer hasn't yet —
  //     placeholder names the missing peer(s); banner echoes.
  //   - 'waiting-on-narrator': local submitted AND all peers submitted —
  //     merged dispatch is running, narration is being generated.
  //
  // Heuristic: turnStatusEntries is server-emitted, server-authoritative,
  // cleared on TURN_STATUS{status="resolved"}. The canonical-roster fix
  // (sidequest-server 2026-05-12) makes the roster carry every PLAYING
  // peer with `pending` / `submitted` / `auto_resolved` per recipient;
  // filtering by status here is required because a pending peer is in
  // the roster but has NOT sealed — counting them as submitted snaps the
  // banner past "waiting-on-peers" the moment the first broadcast lands
  // (sq-playtest 2026-05-12 host-asymmetry bug). auto_resolved counts
  // as submitted: the barrier has already advanced past those peers.
  const submittedPlayerIds = useMemo(
    () => computeSubmittedPlayerIds(turnStatusEntries),
    [turnStatusEntries],
  );
  const peersOutstanding = useMemo(
    () =>
      partyMembers
        .filter(
          (m) =>
            m.player_id !== currentPlayerId &&
            !submittedPlayerIds.has(m.player_id),
        )
        .map((m) => m.character_name || m.name)
        .filter(Boolean),
    [partyMembers, currentPlayerId, submittedPlayerIds],
  );
  const mpInputState: "free" | "waiting-on-peers" | "waiting-on-narrator" = useMemo(() => {
    if (canType) return "free";
    if (!isMultiplayer) return "waiting-on-narrator";
    // Server-emitted narration-start signal trumps peersOutstanding: when
    // the barrier has fired and the orchestrator is generating prose,
    // seated-but-offline peers will never close the gap on their own.
    if (narrationInFlight) return "waiting-on-narrator";
    return peersOutstanding.length > 0 ? "waiting-on-peers" : "waiting-on-narrator";
  }, [canType, isMultiplayer, narrationInFlight, peersOutstanding]);
  // Build the placeholder string the InputBar will render. With a single
  // outstanding peer we name them; with multiple we use a count to keep
  // the placeholder short ("Waiting on Shirley + 1 other to act…").
  const inputWaitingFor = useMemo(() => {
    if (mpInputState === "free") return undefined;
    if (mpInputState === "waiting-on-narrator") return undefined;
    // waiting-on-peers
    if (peersOutstanding.length === 0) return undefined;
    if (peersOutstanding.length === 1) return `${peersOutstanding[0]} to act`;
    return `${peersOutstanding[0]} + ${peersOutstanding.length - 1} other${
      peersOutstanding.length - 1 === 1 ? "" : "s"
    } to act`;
  }, [mpInputState, peersOutstanding]);

  // In slug-mode, gate the WS connect on an explicit identity confirmation.
  //
  // Two cases require the prompt:
  //   1. No cached display name at all — first-time visitor on this host.
  //   2. Cached name exists, but THIS slug is not in our journey history —
  //      i.e. we've never confirmed identity for this game. The cached name
  //      is treated as a *suggestion* (pre-fill), not as an identity.
  //
  // Case 2 prevents the silent-rebind bug: if Player 2 navigates directly to
  // a /play/<slug> URL on a host that previously played a different game,
  // they MUST hit Begin to confirm — otherwise we'd seat the WS connection
  // under a stale localStorage name they never typed for this session.
  // (Once they've confirmed, slugConnectFired latches and the prompt won't
  // re-fire on remount; subsequent reconnects to the same slug skip the
  // prompt because saveSession() will have recorded it in history via the
  // server's CONNECT_OK→appendHistory path.)
  if (slug) {
    // "Trusted" sources for an identity on this slug:
    //   - This tab's user explicitly hit Begin in the NamePrompt for this slug
    //     (identityConfirmedForSlug latch).
    //   - The slug appears in journey history UNDER THIS DISPLAY-NAME (means
    //     this identity created/played the game via ConnectScreen, which
    //     appends history *with the slug + player_name* before navigating).
    // The cached `sq:display-name` alone is NOT a trusted source — that's the
    // silent-rebind footgun. Nor is a slug left in history by a DIFFERENT
    // player ([BAR-1] 2026-06-05: Groucho bounced through "/" into a prior
    // player's the_circuit save; slug-in-history skipped the prompt). The
    // match must be on (slug AND player_name) — kept identical to the slug-
    // connect effect gate below so render and connect agree.
    const slugKnown = loadHistory().some(
      (e) => e.game_slug === slug && e.player_name === displayName,
    );
    const confirmedThisSlug = identityConfirmedForSlug === slug;
    if (!confirmedThisSlug && !slugKnown) {
      return (
        <NamePrompt
          onSubmit={handleNameSubmit}
          initialValue={displayName ?? ""}
        />
      );
    }
  }

  // Fatal WebSocket-frame error preempts all other UI — the user is
  // disconnected and needs an explicit escape. Per UX addendum: full-screen
  // panel (not a banner — the amber strip was easy to miss), plain-language
  // message, two explicit actions. The panel intentionally lives outside the
  // game ErrorBoundary so it survives crashes that happen inside the game.
  // Only renders for codes in FATAL_ERROR_CODES — per-message validation
  // failures route to the transient-error banner instead.
  if (fatalError) {
    const isSchemaError = fatalError.code === "save_schema_invalid";
    const headline = isSchemaError
      ? "This save can't be loaded"
      : "The session can't continue";
    const subheading = isSchemaError
      ? "The save predates the current game schema. Start a new adventure or move the save aside."
      : "The server reported an unrecoverable error. Your in-progress turn was not saved.";
    return (
      <div
        data-testid="fatal-error-panel"
        data-error-code={fatalError.code ?? undefined}
        className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8 gap-6"
      >
        <div className="max-w-xl flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-bold text-destructive">{headline}</h1>
          <p className="text-base text-muted-foreground">{subheading}</p>
          {/* Server message is shown collapsed by default — useful when
              filing a bug, distracting otherwise. The raw payload is in
              the dev console regardless. */}
          <details className="text-xs text-muted-foreground/60 max-w-full">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <pre className="whitespace-pre-wrap break-words bg-muted/30 rounded p-3 mt-2">
              {fatalError.message}
            </pre>
          </details>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setFatalError(null);
                clearSession();
                navigate("/");
              }}
              className="rounded bg-primary px-6 py-2 text-primary-foreground text-sm tracking-wide uppercase"
            >
              Start a New Adventure
            </button>
            <button
              type="button"
              onClick={() => {
                setFatalError(null);
                clearSession();
                navigate("/");
              }}
              className="rounded border border-border bg-background px-6 py-2 text-foreground text-sm tracking-wide uppercase hover:bg-muted"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="app" className="min-h-screen flex flex-col bg-background text-foreground">
      <ReconnectBanner visible={isReconnecting} />
      <OfflineBanner offline={offline} />
      <PausedBanner paused={paused} waitingFor={pauseWaitingFor} />
      <DeathBanner incapacitation={incapacitation} onReroll={handleLeave} />
      {transientError && (
        <div
          role="alert"
          data-testid="transient-error-banner"
          className="bg-destructive/15 border-b border-destructive/30 text-destructive-foreground px-4 py-2 flex items-center justify-between gap-3"
        >
          <span className="text-sm">{transientError}</span>
          <button
            type="button"
            onClick={() => setTransientError(null)}
            aria-label="Dismiss error"
            className="text-xs uppercase tracking-wider px-3 py-1 rounded hover:bg-destructive/20"
          >
            Dismiss
          </button>
        </div>
      )}
      <main className="flex flex-col flex-1 min-h-0">
        {sessionPhase === "connect" && !slug && (
          <ErrorBoundary name="Connect">
            <ConnectScreen
              genres={genres}
              isConnecting={isConnecting}
              error={alertError}
              genreError={genreError}
              onRetryGenres={fetchGenres}
            />
          </ErrorBoundary>
        )}
        {sessionPhase === "creation" && (
          <ErrorBoundary name="Character Creation">
            {sessionMode === "multiplayer" && slug && connectedPlayerName && (
              <MultiplayerSessionStatus
                slug={slug}
                players={mpSessionPlayers}
              />
            )}
            <CharacterCreation
              scene={creationScene}
              loading={creationLoading}
              onRespond={handleCreationRespond}
              portraits={creationPortraits}
            />
          </ErrorBoundary>
        )}
        {sessionPhase === "game" && (
          <ErrorBoundary name="Game" onCrashReport={handleGameCrash}>
            <ImageBusProvider messages={gameMessages} preloadedAssets={preloadedAssets}>
              <GameBoard
                // `key` forces React to unmount + remount GameBoard (and with
                // it the Dockview instance) on genre switch, so the canonical
                // layout built in onDockviewReady always runs fresh instead
                // of reusing a dragged/reordered in-memory state. Fixes tab
                // order drift between genres per sq-playtest 2026-04-09.
                key={currentGenre ?? "no-genre"}
                messages={gameMessages}
                characters={characters}
                onSend={handleSend}
                restoredDraft={restoredDraft}
                onLeave={handleLeave}
                disabled={readyState !== WebSocket.OPEN || !canType || incapacitation !== null}
                thinking={thinking}
                characterSheet={characterSheet}
                inventoryData={inventoryData}
                mapData={mapData}
                currentLocation={gameState.currentLocation ?? null}
                relationshipsData={gameState.relationships ?? null}
                questsData={gameState.questsData ?? null}
                fateData={gameState.fateState ?? null}
                fateRoll={gameState.fateRoll ?? null}
                onFateAction={handleFateAction}
                audio={audio}
                nowPlaying={nowPlaying}
                knowledgeEntries={gameState.knowledge}
                depletions={gameState.depletions}
                resourceAlerts={gameState.resourceAlerts}
                confrontationData={confrontationData}
                confrontationOutcome={confrontationOutcome}
                onBeatSelect={handleBeatSelect}
                onYield={handleYield}
                diceRequest={diceRequest}
                diceResult={diceResult}
                onDiceThrow={handleDiceThrow}
                currentPlayerId={currentPlayerId ?? undefined}
                activePlayerId={activePlayerId}
                activePlayerName={activePlayerName}
                waitingForPlayer={inputWaitingFor}
                mpInputState={mpInputState}
                peersOutstanding={peersOutstanding}
                resources={partyResources}
                companions={partyCompanions}
                genreSlug={currentGenre ?? undefined}
                worldSlug={currentWorld ?? undefined}
                worldOrbital={worldOrbital}
                peerActionsByRound={persistedPeerActions.byRound}
                navMode={
                  genres[currentGenre ?? ""]?.worlds.find(
                    (w) => w.slug === currentWorld,
                  )?.navigation_mode ?? undefined
                }
                turnStatusEntries={turnStatusEntries}
                layoutMode={layoutMode}
                magicState={gameState.magicState ?? null}
                lastOrbitalChart={lastOrbitalChart}
                lastOrbitalError={lastOrbitalError}
                sendOrbitalIntent={sendOrbitalIntent}
                sessionBoundEpoch={sessionBoundEpoch}
                peerReveals={mergedPeerReveals}
                partyOrder={partyOrder}
                onReveal={handleReveal}
                round={currentRound}
              />
            </ImageBusProvider>
            {/* Dice overlay removed — dice now roll inline in the Confrontation panel */}
          </ErrorBoundary>
        )}
        {/* In slug-mode while sessionPhase is still "connect" (waiting for server
            response after sending the slug-based SESSION_EVENT), show a connecting
            indicator rather than the ConnectScreen (which requires genre selection).
            If metadata load or socket connection failed, surface the error here. */}
        {sessionPhase === "connect" && slug && (
          <div className="flex flex-col items-center justify-center flex-1 min-h-screen gap-4">
            <span
              aria-hidden="true"
              className="text-muted-foreground/30 text-sm tracking-[0.5em]"
            >
              ── ◇ ──
            </span>
            {alertError ? (
              <>
                <p role="alert" className="text-sm text-destructive">
                  {alertError}
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setGameMetaError(null);
                      slugConnectFired.current = false;
                      setRetryCount((c) => c + 1);
                    }}
                    className="rounded bg-primary px-6 py-2 text-primary-foreground text-sm tracking-wide uppercase"
                  >
                    Retry
                  </button>
                  {/* Back to Lobby — every error state needs an escape per UX
                      addendum. Without this, the player is stranded on
                      /solo/<bad-slug> with only Retry, which loops on the
                      same 404. handleLeave clears local session state and
                      navigates to /; safe to call even from the error path. */}
                  <button
                    type="button"
                    onClick={handleLeave}
                    data-testid="lobby-escape-from-error"
                    className="rounded border border-border bg-background px-6 py-2 text-foreground text-sm tracking-wide uppercase hover:bg-muted"
                  >
                    Back to Lobby
                  </button>
                </div>
              </>
            ) : (
              <p
                role="status"
                className="text-sm italic text-muted-foreground/50 animate-pulse"
              >
                The pages are turning…
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function LobbyRoot() {
  return (
    <div data-testid="lobby-root">
      <GameStateProvider>
        <AppInner />
      </GameStateProvider>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LobbyRoot />} />
      <Route path="/solo/:slug" element={<LobbyRoot />} />
      <Route path="/play/:slug" element={<LobbyRoot />} />
      {/*
        Story 100-8 (ADR-135): the reference shell is a PUBLIC table tool —
        session-free by construction. These routes are SIBLINGS of LobbyRoot,
        never nested under it, so the session-owning tree (GameStateProvider →
        AppInner → WebSocket handshake) never mounts on a `/reference/*` URL.
        That sibling placement is the load-bearing no-session invariant (C2).
      */}
      <Route path="/reference/lore/:pack/:world" element={<ReferenceLorePage />} />
      <Route path="/reference/rules/:pack" element={<ReferenceRulesPage />} />
    </Routes>
  );
}

// Story 67-9 (67-8 Layer 2): the GM dashboard is a global overlay, hoisted
// ABOVE <Routes> so toggling #/dashboard never unmounts the session-owning
// tree (LobbyRoot → AppInner → the WebSocket connection + slug-connect
// handshake). Pre-67-9 the dashboard lived inside the per-route LobbyRoot and
// *replaced* AppInner, so opening/closing it tore the socket down and re-ran
// the connect handshake on the way back (a second ws.connection_accepted /
// chargen_gate cycle). Rendering it as a stable sibling above the router keeps
// the single connection alive for the whole page-session; the live session
// view simply sits underneath the opaque full-screen overlay.
function DashboardGate() {
  const [isDashboard, setIsDashboard] = useState(
    () => window.location.hash === "#/dashboard",
  );

  useEffect(() => {
    const onHashChange = () => {
      setIsDashboard(window.location.hash === "#/dashboard");
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (!isDashboard) return null;

  return (
    <div
      data-testid="dashboard-overlay"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#1a1a2e" }}
    >
      <Suspense fallback={<div style={{ color: "#e0e0e0", background: "#1a1a2e", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading dashboard...</div>}>
        <LazyDashboard />
      </Suspense>
    </div>
  );
}

export default function App() {
  // In tests we wrap with MemoryRouter; in production the entry point (main.tsx) provides BrowserRouter.
  // <DashboardGate> is a hash-driven overlay rendered ABOVE <Routes> (story
  // 67-9) — a sibling, never a conditional replacement, so it cannot unmount
  // the connection-owning session tree.
  return (
    <>
      <AppRoutes />
      <DashboardGate />
    </>
  );
}
