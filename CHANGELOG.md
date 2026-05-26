# Changelog

All notable changes to the SideQuest React/TypeScript game client.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-05-26

### Added
- **Reference link surface** — `ReferenceLinks` renders Rules and Lore anchors
  in the narrative widget; `CharacterSheet` hyperlinks abilities and class, and
  `KnowledgeJournal` entries deep-link to the lore page (mirrors server
  `reference_url` additions).
- **LocationPanel region-header deep-link** — region headers reference into the
  location surface (63-6).
- **Scene Library fixture picker** — Scene fixture picker added to
  `ConnectScreen` (51-4).
- **CharacterSheet mechanical surfacing** — RigComposure, Edge, and injury tags
  shown on the sheet (53-5).
- **GameBoard render-crash reporting** — reports a `GameBoard` render crash to
  the server over the open socket (67-1).

### Changed
- **Confrontation strip relayout** — persistent die lane with compact beats;
  class-move pills now carry labels and tooltips.
- Survivability pool relabeled from Edge to HP per ADR-114.

### Fixed
- Guarded beatless confrontations, empty abilities-tab (empty-state message),
  and `mapData.explored` / `galleryImages` length access in `GameBoard`
  content-signal memos.
- Collapsed doubled `CharacterSheet` header when `player_id` equals the
  character name (#279).
- MP peer-reveal staleness — `TURN_STATUS` is authoritative for host
  `peersOutstanding` and `PeerRevealList` (#275).
- Lobby self-evicts past-journey cards whose save returns 404 (#276).
- Re-enabled input after `ASIDE_ANSWER` receipt (#272).
- Improved em / peer-reveal-banner legibility on light and terminal
  archetypes.
- Proxied `/reference` to the server (Task 11 wiring gap).

## [1.2.0] - 2026-05-23

### Added
- **Out-of-band aside channel (UI)** — `ASIDE_ANSWER` consumer and gm-aside
  narration segment, per ADR-107 (50-25).
- **Persistent LocationPanel** — location tab between Map and Knowledge with
  `LOCATION_OVERLAY_CHANGED` and `LocationDescriptionPayload` TypeScript types,
  plus GM-panel lie-detector treatment for location spans (ADR-109; 54-2/54-7/
  54-9/54-8).
- **Confrontation panel D2 redesign** — tile-grid layout above the InputBar,
  typed action threaded through beat dispatch, with finished token and flavor
  wiring.
- **PromptTab cache attribution display** in the GM panel (60-2).
- **MP controlling-player labels** — controlling player's name shown on
  character displays in multiplayer (#258).
- Generalized tone-chip renderer to any axis name (58-3); runtime cavern payload
  (`cellular=null`) accepted in adapter and renderer (52-5).
- Genre-specific narrator-thinking loaders (WIP).
- Journal pipeline: consumes narrator-supplied `Footnote.fact_id` and
  propagates UI confidence with canonical `JOURNAL_RESPONSE` winning (#240/#242).

### Changed
- **Dice core extracted** to shared `@local/dice-lib`; sidequest-ui dice tests
  trimmed to integration-only (#237).
- Wired `CharacterPanel`, `InventoryPanel`, and `KnowledgeJournal` to the genre
  theme (#243); genre `theme_css` grace window bumped 4s → 8s, with loud-fail
  when theme CSS never arrives after connect.
- Renamed `victoria` genre to `tea_and_murder`.
- Removed the GitHub Actions CI workflow; bumped `protobufjs` /
  `@protobufjs/utf8` dependencies.
- Turn-banner copy: "declare your action" replaces "you have the floor".

### Fixed
- MP seal/peer-reveal: single authoritative seal set, never show "all letters
  sealed" on a tab whose own player is still pending, and clear peer reveals on
  `TURN_STATUS` resolved.
- Theme legibility — preserve italic luminance by dropping the `--accent` color
  override; BS-UX visibility remediation (legible labels, amber chrome, dropcap
  containment).
- Routed `cdn.slabgorb.com` audio fetches through Vite's same-origin proxy.
- Resolved `@local/dice-lib` sibling checkout and lockfile drift (post-#237).

## [1.1.0] - 2026-05-11

### Added
- **Narration-in-flight status tracking** — UI tracks per-player narration
  state to keep offline-player turn coordination coherent under the
  ADR-036 turn barrier.
- **TURN_STATUS wire-shape consumer** — receives per-player
  `TURN_STATUS` broadcasts from the server (paired with
  sidequest-server MP TURN_STATUS broadcast, 47-5).
- README refresh.

## [1.0.0] - prior

Initial React/TypeScript client post-Rust-port. Not formally tagged at
the time; recorded here for continuity.
