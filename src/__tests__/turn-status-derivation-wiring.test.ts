import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Wiring test: turn-status derivation helpers consumed by App.tsx ───────────
//
// sq-playtest 2026-05-12 [BUG] host peer-submission visibility +
// [BUG-LOW] PeerRevealList composing/submitted mislabel.
//
// computeSubmittedPlayerIds + mergePeerRevealsWithSubmittedStatus are
// pure helpers in src/lib/turnStatusDerivation.ts. Pin them as consumed
// by App.tsx so a future refactor that re-introduces the inline
// `new Set(turnStatusEntries.map(e => e.player_id))` (status-blind set)
// or that wires `peerReveals.reveals` directly into GameBoard (without
// the TURN_STATUS merge) fails fast.
// ─────────────────────────────────────────────────────────────────────────────

const appSrc = fs.readFileSync(
  path.resolve(__dirname, "../App.tsx"),
  "utf-8",
);

describe("Wiring: turn-status derivation helpers consumed by App.tsx", () => {
  it("imports computeSubmittedPlayerIds and mergePeerRevealsWithSubmittedStatus from @/lib/turnStatusDerivation", () => {
    expect(appSrc).toMatch(
      /from\s+["']@\/lib\/turnStatusDerivation["']/,
    );
    expect(appSrc).toMatch(/computeSubmittedPlayerIds/);
    expect(appSrc).toMatch(/mergePeerRevealsWithSubmittedStatus/);
  });

  it("calls computeSubmittedPlayerIds with turnStatusEntries (not the legacy status-blind Set)", () => {
    // Bug 1 pin: must NOT regress to `new Set(turnStatusEntries.map(e => e.player_id))`.
    // The canonical-roster fix makes that set include pending peers and
    // collapse peersOutstanding to empty after the first broadcast.
    expect(appSrc).toMatch(
      /computeSubmittedPlayerIds\s*\(\s*turnStatusEntries\s*\)/,
    );
    expect(appSrc).not.toMatch(
      /new\s+Set\s*\(\s*turnStatusEntries\.map\s*\(\s*\(?\s*e\s*\)?\s*=>\s*e\.player_id\s*\)\s*\)/,
    );
  });

  it("passes the merged peer reveals (not peerReveals.reveals directly) to GameBoard", () => {
    // Bug 2 pin: PeerRevealList input must be the merged map so a
    // TURN_STATUS{submitted} authoritatively wins over a stale ACTION_REVEAL
    // composing event.
    expect(appSrc).toMatch(/peerReveals=\{mergedPeerReveals\}/);
    expect(appSrc).not.toMatch(/peerReveals=\{peerReveals\.reveals\}/);
  });

  it("derives mergedPeerReveals via mergePeerRevealsWithSubmittedStatus(peerReveals.reveals, turnStatusEntries)", () => {
    expect(appSrc).toMatch(
      /mergePeerRevealsWithSubmittedStatus\s*\(\s*peerReveals\.reveals\s*,\s*turnStatusEntries\s*\)/,
    );
  });

  it("snapshots the RAW peerReveals.reveals into the accumulator, never the display-only mergedPeerReveals (71-12 prose guard → 71-36 machine guard)", () => {
    // Accumulator-direction invariant. The 71-12 review left this as a prose
    // comment at App.tsx:~1395; 71-36 machine-guards it. mergedPeerReveals folds
    // TURN_STATUS submitted-status in for *display*, so a row's status can be
    // frozen at a past turn's value. Snapshotting the merged map would persist
    // that stale draft into the canonical accumulator (the stale-draft
    // regression). The capture call MUST be fed peerReveals.reveals.
    expect(appSrc).toMatch(
      /persistedPeerActions\.capture\(\s*currentRound\s*,\s*peerReveals\.reveals\s*\)/,
    );
    // Regression guard: fails fast if a future refactor flips the snapshot to
    // the merged map.
    expect(appSrc).not.toMatch(
      /persistedPeerActions\.capture\([^)]*mergedPeerReveals/,
    );
  });
});
