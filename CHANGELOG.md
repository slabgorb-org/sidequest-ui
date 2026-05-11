# Changelog

All notable changes to the SideQuest React/TypeScript game client.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
