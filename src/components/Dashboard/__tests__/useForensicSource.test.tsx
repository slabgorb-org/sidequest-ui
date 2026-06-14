import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useForensicSource } from "../source/useForensicSource";
import type { ForensicSaveEntry } from "../source/types";

const SAVES: ForensicSaveEntry[] = [
  { slug: "perseus_cloud", genre: "space_opera", world: "perseus_cloud", created_at: "x", last_played: "y", last_activity_ts: 2, telemetry_rows: 10, mechanical_rows: 4 },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("/api/debug/saves")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SAVES) });
      }
      if (url.includes("/timeline")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ round: 1, seq_start: 1, seq_end: 9, event_kind_counts: {}, narrative_authors: ["gm"], ts: "t" }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("useForensicSource", () => {
  it("loads the saves list on mount", async () => {
    const { result } = renderHook(() => useForensicSource());
    await waitFor(() => expect(result.current.saves).toHaveLength(1));
    expect(result.current.saves[0].slug).toBe("perseus_cloud");
  });

  it("loads the timeline and auto-selects the last round when a save is selected", async () => {
    const { result } = renderHook(() => useForensicSource());
    await waitFor(() => expect(result.current.saves).toHaveLength(1));

    act(() => result.current.selectSave("perseus_cloud"));

    await waitFor(() => expect(result.current.rounds).toHaveLength(1));
    expect(result.current.selectedRound).toBe(1);
  });
});
