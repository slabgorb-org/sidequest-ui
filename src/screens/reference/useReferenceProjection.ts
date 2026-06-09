// Story 100-8 (Phase 2) — session-free REST fetch for reference projections
// (AC4). Fetches the public projection JSON over plain `fetch` (no WebSocket,
// no game session, no auth). Surfaces loading and error states so the pages
// never white-screen: a non-2xx response OR a rejected promise both resolve to
// an error string the page renders in an `role="alert"` region.

import { useEffect, useState } from "react";

export interface ProjectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Internal settle-state tags the url it resolved for, so a url change shows a
// loading state immediately (during render) without a synchronous setState in
// the effect body — and never renders one url's content under another's route.
interface SettledState<T> {
  url: string;
  data: T | null;
  error: string | null;
}

export function useReferenceProjection<T>(url: string): ProjectionState<T> {
  const [settled, setSettled] = useState<SettledState<T>>({
    url,
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          // No-Silent-Fallbacks: a non-2xx is a loud failure, not an empty page.
          throw new Error(`Reference request failed (HTTP ${res.status}).`);
        }
        return (await res.json()) as T;
      })
      .then((data) => {
        if (!cancelled) setSettled({ url, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load reference content.";
        setSettled({ url, data: null, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  // If the settled state is for a previous url (route param changed without a
  // remount), or nothing has resolved yet, we are loading the current url.
  if (settled.url !== url || (settled.data === null && settled.error === null)) {
    return { data: null, loading: true, error: settled.url === url ? settled.error : null };
  }

  return { data: settled.data, loading: false, error: settled.error };
}
