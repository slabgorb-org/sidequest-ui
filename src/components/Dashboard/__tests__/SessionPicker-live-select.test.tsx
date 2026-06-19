import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionPicker } from "../SessionPicker";
import type { ForensicSaveEntry } from "../source/types";

// ---------------------------------------------------------------------------
// Story 126-23 — operator-facing wiring for live-session selection.
//
// The hook now exposes `liveSessions` + `selectSession` (see
// useLiveSource-session-select.test.tsx). This test pins the OTHER end of the
// wire: the SessionPicker must let the operator pick a SPECIFIC live session,
// not just "Live (auto)" vs a saved session. Without this surface the hook's
// selection API is unreachable — a half-wired fix.
//
// Contract (additive, back-compatible): two OPTIONAL props —
//   * `liveSessions: string[]`            — active live slugs to offer
//   * `onSelectLiveSession: (slug) => void` — fired when one is chosen
// The picker renders one option per live session (value `live:<slug>`) and
// routes the change to `onSelectLiveSession(slug)`.
//
// RED: SessionPicker offers a single "Live" option today and ignores these
// props, so neither the per-session option nor the handler call exists.
// ---------------------------------------------------------------------------

const saves: ForensicSaveEntry[] = [
  {
    slug: "perseus_cloud",
    genre: "space_opera",
    world: "perseus_cloud",
    created_at: "x",
    last_played: "y",
    last_activity_ts: 2,
    telemetry_rows: 10,
    mechanical_rows: 4,
  },
];

const DRIVEN = "2026-06-19-annees_folles-cd25d503";
const NEWEST = "2026-06-19-flickering_reach-444686c1";

describe("SessionPicker live-session selection (126-23)", () => {
  it("offers each concurrent live session as a selectable option", () => {
    render(
      <SessionPicker
        sourceKind="live"
        selectedSlug={null}
        liveSlug={NEWEST}
        liveSessions={[NEWEST, DRIVEN]}
        saves={saves}
        onSelectLive={() => {}}
        onSelectLiveSession={() => {}}
        onSelectSave={() => {}}
      />,
    );
    // The driven session the operator wants must be individually selectable —
    // not hidden behind a single auto-follow "Live" entry.
    expect(
      screen.getByRole("option", { name: /annees_folles-cd25d503/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /flickering_reach-444686c1/ }),
    ).toBeInTheDocument();
  });

  it("routes choosing a specific live session to onSelectLiveSession(slug)", () => {
    const onSelectLiveSession = vi.fn();
    render(
      <SessionPicker
        sourceKind="live"
        selectedSlug={null}
        liveSlug={NEWEST}
        liveSessions={[NEWEST, DRIVEN]}
        saves={saves}
        onSelectLive={() => {}}
        onSelectLiveSession={onSelectLiveSession}
        onSelectSave={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: `live:${DRIVEN}` },
    });
    expect(onSelectLiveSession).toHaveBeenCalledWith(DRIVEN);
  });
});
