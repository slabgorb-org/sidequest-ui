import { useCallback, useEffect, useState } from "react";
import type {
  ForensicSaveEntry,
  ForensicTimelineRound,
  ForensicBundle,
  ForensicSnapshot,
} from "./types";

const API_BASE = (() => {
  const loc = window.location;
  const host = loc.hostname === "localhost" ? "localhost:8765" : loc.host;
  return `${loc.protocol}//${host}`;
})();

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ForensicSourceState {
  saves: ForensicSaveEntry[];
  selectedSlug: string | null;
  rounds: ForensicTimelineRound[];
  selectedRound: number | null;
  bundle: ForensicBundle | null;
  snapshot: ForensicSnapshot | null;
  error: string | null;
  selectSave: (slug: string) => void;
  selectRound: (round: number) => void;
}

export function useForensicSource(): ForensicSourceState {
  const [saves, setSaves] = useState<ForensicSaveEntry[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [rounds, setRounds] = useState<ForensicTimelineRound[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [bundle, setBundle] = useState<ForensicBundle | null>(null);
  const [snapshot, setSnapshot] = useState<ForensicSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load saves once on mount.
  useEffect(() => {
    let cancelled = false;
    getJSON<ForensicSaveEntry[]>("/api/debug/saves")
      .then((data) => {
        if (!cancelled) setSaves(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load timeline when the selected save changes.
  useEffect(() => {
    if (!selectedSlug) return;
    let cancelled = false;
    setRounds([]);
    setSelectedRound(null);
    setBundle(null);
    setSnapshot(null);
    getJSON<ForensicTimelineRound[]>(
      `/api/debug/save/${selectedSlug}/timeline`,
    )
      .then((data) => {
        if (cancelled) return;
        setRounds(data);
        if (data.length > 0) setSelectedRound(data[data.length - 1].round);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  // Load bundle + snapshot when the selected round changes.
  useEffect(() => {
    if (!selectedSlug || selectedRound === null) return;
    let cancelled = false;
    Promise.all([
      getJSON<ForensicBundle>(
        `/api/debug/save/${selectedSlug}/turn/${selectedRound}`,
      ),
      getJSON<ForensicSnapshot>(`/api/debug/save/${selectedSlug}/snapshot`),
    ])
      .then(([b, s]) => {
        if (cancelled) return;
        setBundle(b);
        setSnapshot(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug, selectedRound]);

  const selectSave = useCallback((slug: string) => {
    setError(null);
    setSelectedSlug(slug);
  }, []);
  const selectRound = useCallback((round: number) => {
    setError(null);
    setSelectedRound(round);
  }, []);

  return {
    saves,
    selectedSlug,
    rounds,
    selectedRound,
    bundle,
    snapshot,
    error,
    selectSave,
    selectRound,
  };
}
