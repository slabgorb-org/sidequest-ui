# SideQuest UI

React/TypeScript game client for the SideQuest AI Narrator. Connects to the
Python [sidequest-server](https://github.com/slabgorb-org/sidequest-server) via
WebSocket for real-time game sessions (the Rust prototype `sidequest-api` is
archived read-only per ADR-082).

## Quick Start

```bash
npm install       # Install dependencies
npm run dev       # Dev server at localhost:5173
npm test          # Run tests (Vitest)
npm run build     # Type-check + production build
npm run lint      # ESLint
```

The dev server proxies four paths to the Python server at `localhost:8765`:

| Path       | Target                    |
|------------|---------------------------|
| `/ws`      | `ws://localhost:8765`     |
| `/api`     | `http://localhost:8765`   |
| `/genre`   | `http://localhost:8765`   |
| `/renders` | `http://localhost:8765`   |

## Stack

- React 19 + TypeScript 5.9
- Vite 8
- Tailwind CSS 4 + shadcn/ui (base-nova style)
- Vitest 4.1.1 + React Testing Library + JSDOM
- lucide-react for icons

## Session Flow

A game session moves through three phases:

1. **ConnectScreen** (`src/screens/ConnectScreen.tsx`) — Server connection, genre/world selection via dropdowns, player name entry. Persists selections in localStorage.
2. **CharacterCreation** (`src/components/CharacterCreation/`) — AI-driven multi-turn dialogue. The server offers choices and accepts freeform input to build a character collaboratively.
3. **GameBoard** (`src/components/GameBoard/GameBoard.tsx`) — Active gameplay. A widget-based layout (see `widgetRegistry.ts`) that composes the narration, party, inventory, map, and overlay panels listed below.

## Components

All paths are relative to `src/components/` unless noted.

| Component                  | Purpose                                                       |
|----------------------------|---------------------------------------------------------------|
| `GameBoard/GameBoard.tsx`  | Root gameplay layout with widget registry                     |
| `GameBoard/widgets/`       | Modular widget shell: `AudioWidget`, `CharacterWidget`, `ImageGalleryWidget`, `InventoryWidget`, `KnowledgeWidget`, `LocationWidget`, `MapWidget`, `NarrativeWidget`, `QuestsWidget`, `RelationshipsWidget`, `ScrapbookGallery`, `ShipWidget` (confrontations render via `ConfrontationOverlay`, not a widget — the old `ConfrontationWidget` was removed 2026-05-13) |
| `NarrationCards.tsx` + `NarrationFocus.tsx` + `NarrationScroll.tsx` | Narration rendering (current-turn focus + scrollback); `NarrationScroll` consumes live `NarrationDelta` streaming when the server runs with `SIDEQUEST_NARRATOR_STREAMING=1` (server default is **off** — non-streaming on the Anthropic SDK backend per ADR-101) |
| `NarrativeView.tsx` (in `src/screens/`) | Markdown narration (DOMPurify), images |
| `CharacterPanel.tsx`       | Persistent themed sidebar showing active character            |
| `PartyPanel.tsx`           | Party portraits, Edge bars, status effects, recruited-NPC companions |
| `CharacterSheet.tsx`       | Stats grid, abilities, backstory, narrative voice (ADR-040). Renders an HP/vitality bar (ADR-114, HP reinstated after ADR-078's removal). Note: some `Edge`-named identifiers persist here from an incomplete rename and now carry HP values |
| `AbilitiesContent.tsx`     | Lv1 Abilities tab: signature ability + Sensitivities + class_moves + magic block (ADR-095) |
| `InventoryPanel.tsx`       | Items grouped by type, equipped state, currency               |
| `MapOverlay.tsx` + `Automapper.tsx` + `DungeonMapRenderer.tsx` + `TacticalGridRenderer.tsx` | SVG / grid map rendering. Cavern renderer revival (ADR-096) adds image-mode PNG tactical maps |
| `JournalView.tsx` + `KnowledgeJournal.tsx` | Handouts and lore journal; keyword filter (token AND match) |
| `ConfrontationOverlay.tsx` + `InlineDiceTray.tsx` | Encounter / combat overlay; mounts inline 3D dice (ADR-074/075) |
| `LedgerPanel.tsx` + `MagicBlock` | Magic + Edge ledger bars; reacts to `CONFRONTATION_OUTCOME` |
| `OrbitalChart/OrbitalChartView.tsx` + `HudTopStrip` + `HudBottomStrip` | Server-rendered orbital chart with chart-as-calendar HUD overlays (ADR-094) |
| `ShipWidget.tsx` + `useChassisInteriorSVG` | Chassis interior SVG renderer (Kestrel — `voidborn_freighter`) |
| `PeerRevealList.tsx` + `MultiplayerTurnBanner.tsx` | Live teammate typing reveal (ADR-036 amendment 2026-05-03) — peer drafts + submitted state visible during the wait window |
| `TurnStatusPanel.tsx`      | Current turn + phase indicator                                |
| `AudioStatus.tsx`          | 2-channel mixer UI (music/SFX), mute toggles                  |
| `InputBar.tsx`             | Text input with aside toggle; debounced `ACTION_REVEAL` broadcast for live teammate typing |
| `Dashboard/DashboardApp.tsx` | Watcher/GM telemetry app (tabs: Console, Encounter, Lore, Prompt, State, Subsystems, Timeline, Timing) — Prompt tab shows ADR-098 system/user split + bounded marker + expandable section viewer |
| `GenericResourceBar.tsx`   | Reusable resource bar (Edge, magic ledger, faction pools)     |

> This table is a guided tour, not an exhaustive index. Treat `src/components/` as authoritative.

## Keyboard Shortcuts

| Key | Panel          |
|-----|----------------|
| `P` | Party panel    |
| `C` | Character sheet|
| `I` | Inventory      |
| `M` | Map overlay    |
| `J` | Journal        |

## Hooks

Custom hooks under `src/hooks/`:

| Hook                   | Responsibility                                          |
|------------------------|---------------------------------------------------------|
| `useWebSocket`         | Low-level WebSocket transport with reconnect            |
| `useGameSocket`        | Game-message dispatch built on `useWebSocket`           |
| `useStateMirror`       | Sync local game state from server messages; dispatches streaming `NarrationDelta` |
| `useWatcherSocket`     | Telemetry WebSocket for GM mode                         |
| `useSlashCommands`     | Parse `/inventory`, `/character`, `/quests`, etc.       |
| `useAudio`             | Core audio context management                           |
| `useAudioCue`          | Play one-shot audio cues (SFX) from server events       |
| `useGenreTheme`        | Inject genre pack CSS variables (ADR-079)               |
| `useChromeArchetype`   | Archetype-driven UI chrome styling                      |
| `useLayoutMode`        | Desktop/mobile layout selection                         |
| `useBreakpoint`        | Responsive breakpoint detection                         |
| `useLocalPrefs`        | Persisted user preferences (volume, panel layout, etc.) |
| `useRunningHeader`     | Scroll-aware running header state                       |
| `useGameBoardLayout`   | Game board panel arrangement                            |
| `useGameBoardHotkeys`  | Keyboard shortcut bindings for game board panels        |
| `usePeerReveals` + `usePeerEventCache` | Live teammate typing — per-round peer reveal map fed by `ACTION_REVEAL` (ADR-036 amendment 2026-05-03) |
| `useOrbitalChart`      | Orbital chart fetch + plotted_course revision refetch (ADR-094) |
| `useChassisInteriorSVG`| Resolve ship/chassis interior SVG for the active session |

> The full list is authoritative in `src/hooks/`. Former voice hooks
> (`useVoiceChat`, `useVoicePlayback`, `usePushToTalk`, `useWhisper`) were
> removed along with the TTS / WebRTC voice pipeline (2026-04).

## Audio Engine

The audio subsystem uses the Web Audio API with two independent channels:

- **AudioEngine.ts** — 2-channel mixer (music + SFX) with per-channel gain
- **AudioCache.ts** — URL-to-AudioBuffer cache to avoid redundant fetches
- **Crossfader.ts** — Smooth gain-curve transitions between music tracks

The voice channel, `LocalTranscriber.ts`, `Ducker.ts`, and the Kokoro TTS
playback path were all removed in 2026-04. Music-ducking was only ever wired
to duck under TTS voice playback; with voice gone, the entire duck/restore
chain is gone too — the Rust server no longer emits `AudioAction::Duck`
constructions. See `orc-quest/docs/adr/076-narration-protocol-collapse-post-tts.md`.

## WebSocket Protocol

Client-handled message types include `NARRATION`, `NARRATION_END`, `NarrationDelta`
(streaming, opt-in via server-side `SIDEQUEST_NARRATOR_STREAMING=1`; default off),
`PARTY_STATUS`, `CHARACTER_SHEET`, `INVENTORY`, `MAP_UPDATE` (new ADR-055 room-graph
shape — the legacy ADR-019 cartography `MAP_UPDATE` was deleted in the port),
`IMAGE`, `AUDIO_CUE`, `CHAPTER_MARKER`, `SESSION_EVENT`, `TURN_STATUS`,
`CHARACTER_CREATION`, `THINKING`, `ERROR`, `ACTION_QUEUE`, `ACTION_REVEAL` (live
teammate typing per ADR-036 amendment 2026-05-03), `CONFRONTATION`,
`CONFRONTATION_OUTCOME`, `ORBITAL_CHART`, `SCRAPBOOK_ENTRY`, `SECRET_NOTE`,
`GAME_PAUSED` / `GAME_RESUMED`, `PLAYER_PRESENCE` / `PLAYER_SEAT` / `SEAT_CONFIRMED`,
and the dice protocol triplet (`DICE_REQUEST`, `DICE_THROW`, `DICE_RESULT`).

See `src/types/` for the authoritative TypeScript payload definitions and
`orc-quest/docs/api-contract.md` for the cross-repo protocol reference (now includes
the `ACTION_REVEAL` wire contract).

## Tests

Vitest + React Testing Library + JSDOM. Test files cover integration,
component, hook, and audio behavior.

```bash
npm test              # Watch mode
npx vitest run        # Single run
npx vitest run --ui   # Browser UI
```

## Related Repos

- [sidequest](https://github.com/slabgorb-org/sidequest) — Orchestrator (sprint tracking, ADRs)
- [sidequest-server](https://github.com/slabgorb-org/sidequest-server) — Python FastAPI backend
- [sidequest-daemon](https://github.com/slabgorb-org/sidequest-daemon) — Python media services (Z-Image, ACE-Step)
- [sidequest-content](https://github.com/slabgorb-org/sidequest-content) — Genre packs
- [sidequest-composer](https://github.com/slabgorb-org/sidequest-composer) — Notation → rights-free audio (offline tool)
- [sidequest-understudy](https://github.com/slabgorb-org/sidequest-understudy) — Naive simulated-player playtest client
- [sidequest-api](https://github.com/slabgorb/sidequest-api) — Archived Rust prototype (read-only, ADR-082)
