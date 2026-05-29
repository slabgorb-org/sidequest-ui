import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BackoffStrategy = "fixed" | "exponential";

export interface UseWebSocketOptions<T> {
  /** WebSocket URL to connect to. */
  url: string;
  /** Called for each parsed JSON message. */
  onMessage: (message: T) => void;
  /** Called for binary (Blob) frames. */
  onBinaryMessage?: (data: ArrayBuffer) => void;
  /** Called on WebSocket error events. */
  onError?: (error: Event) => void;
  /** Connect immediately on mount (default: true). */
  autoConnect?: boolean;
  /** Backoff strategy for reconnection (default: "exponential"). */
  backoff?: BackoffStrategy;
  /** Maximum backoff delay in ms (default: 8000). */
  maxBackoffMs?: number;
  /**
   * Whether to reconnect for a given close code (default: reconnect on all
   * codes except 1000). Return false to suppress reconnection.
   */
  shouldReconnect?: (code: number) => boolean;
  /** Custom JSON parser. Default: JSON.parse. */
  parse?: (data: string) => T;
}

export interface UseWebSocketReturn {
  /** True when the WebSocket is open. */
  connected: boolean;
  /** Raw WebSocket readyState value. */
  readyState: number;
  /**
   * True when the socket has previously been OPEN, was not closed intentionally
   * by the caller, and is currently not OPEN — i.e. a user-visible reconnect
   * is in progress. Distinct from `!connected`, which is also true during
   * first-time connect and after intentional disconnect.
   */
  isReconnecting: boolean;
  /** Open a connection (no-op if already connected). */
  connect: () => void;
  /** Close the connection intentionally (suppresses reconnect). */
  disconnect: () => void;
  /** Send a JSON-serializable message. Drops if socket not OPEN. */
  send: (message: unknown) => void;
  /** Last error event, or null. */
  error: Event | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 8000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Generic WebSocket hook with reconnection, binary frame support, and
 * callback-ref stability. Consolidates useGameSocket and useWatcherSocket.
 */
export function useWebSocket<T>({
  url,
  onMessage,
  onBinaryMessage,
  onError,
  autoConnect = true,
  backoff = "exponential",
  maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
  shouldReconnect = (code) => code !== 1000,
  parse = JSON.parse as (data: string) => T,
}: UseWebSocketOptions<T>): UseWebSocketReturn {
  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED);
  const [error, setError] = useState<Event | null>(null);
  // Reactive "have we ever successfully opened?" flag. Must be state (not a
  // ref) so downstream `isReconnecting` recomputes when it flips.
  const [hasEverOpened, setHasEverOpened] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reactive mirror of intentionalClose so `isReconnecting` updates when the
  // caller invokes disconnect(). The ref is kept for the event-handler
  // synchronous read path inside onclose.
  const intentionalCloseRef = useRef(false);
  const [intentionalClose, setIntentionalClose] = useState(false);
  const retryDelayRef = useRef(INITIAL_BACKOFF_MS);

  // Callback refs — prevent stale closures without re-running effects
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onBinaryMessageRef = useRef(onBinaryMessage);
  onBinaryMessageRef.current = onBinaryMessage;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const parseRef = useRef(parse);
  parseRef.current = parse;
  const shouldReconnectRef = useRef(shouldReconnect);
  shouldReconnectRef.current = shouldReconnect;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const nextBackoff = useCallback(() => {
    const current = retryDelayRef.current;
    if (backoff === "exponential") {
      retryDelayRef.current = Math.min(current * 2, maxBackoffMs);
    }
    return current;
  }, [backoff, maxBackoffMs]);

  // Detach a WebSocket's event handlers cleanly. Used before close() on the
  // teardown path (cleanup + replacement) so that async `onclose` events
  // fired by the browser AFTER teardown cannot re-enter React state or
  // trigger the reconnect timer. This is the fix for the playtest 2026-04-11
  // "OTEL dashboard 2x-4x ingest" bug — see the effect cleanup below and
  // the comment on `intentionalCloseRef` for the full race analysis.
  const detachHandlers = (ws: WebSocket | null) => {
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
  };

  const createSocket = useCallback(() => {
    // Tear down any previous socket before replacing the ref. Without this,
    // the old socket's onclose handler could fire after it's been orphaned
    // and still call setReadyState / schedule a reconnect, leaking a ghost
    // connection.
    const prev = wsRef.current;
    detachHandlers(prev);
    // Story 67-8: detaching handlers alone leaves a still-LIVE socket OPEN on
    // the server — a duplicate connection. The freshly-opened replacement sits
    // in AwaitingConnect until its connect handshake completes, and a beat's
    // DICE_THROW racing that window is rejected `session.message_rejected_unbound`
    // (×4+), stranding the confrontation. So if the prior socket is still live,
    // close it too. On the reconnect-timer path the prior socket is already
    // CLOSED, so this is a no-op there (we never double-close).
    if (
      prev &&
      (prev.readyState === WebSocket.OPEN || prev.readyState === WebSocket.CONNECTING)
    ) {
      prev.close();
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setReadyState(WebSocket.OPEN);
      setError(null);
      setHasEverOpened(true);
      retryDelayRef.current = INITIAL_BACKOFF_MS; // reset on success
    };

    ws.onmessage = (ev: MessageEvent) => {
      // Binary frame — delegate to onBinaryMessage if a handler is set.
      if (ev.data instanceof Blob) {
        ev.data
          .arrayBuffer()
          .then((buf) => onBinaryMessageRef.current?.(buf))
          .catch((err) => console.error("Binary frame decode failed:", err));
        return;
      }

      try {
        const parsed = parseRef.current(ev.data as string);
        onMessageRef.current(parsed);
      } catch {
        // Non-JSON message — ignore
      }
    };

    ws.onerror = (ev: Event) => {
      setError(ev);
      onErrorRef.current?.(ev);
    };

    ws.onclose = (ev: CloseEvent) => {
      setReadyState(WebSocket.CLOSED);

      if (!intentionalCloseRef.current && shouldReconnectRef.current(ev.code)) {
        const delay = nextBackoff();
        reconnectTimerRef.current = setTimeout(() => {
          createSocket();
        }, delay);
      }
    };
  }, [url, nextBackoff]);

  const connect = useCallback(() => {
    // Honor the documented contract: no-op if already connected. Story 67-8 —
    // a re-entrant connect() (StrictMode double-invoke of the slug-connect
    // effect, or the slug-connect + reconnect effects both firing on one mount)
    // must NOT tear down a live socket and open a second one. That duplicate is
    // the churn that strands a confrontation in AwaitingConnect. A socket that
    // is mid-handshake (CONNECTING) is handled by createSocket's close-prior
    // guard, not here, so an in-flight connect can still be superseded.
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    clearReconnectTimer();
    intentionalCloseRef.current = false;
    setIntentionalClose(false);
    retryDelayRef.current = INITIAL_BACKOFF_MS;
    createSocket();
  }, [createSocket, clearReconnectTimer]);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    intentionalCloseRef.current = true;
    setIntentionalClose(true);
    wsRef.current?.close();
  }, [clearReconnectTimer]);

  const send = useCallback((message: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  // Auto-connect on mount + cleanup on unmount.
  //
  // Playtest 2026-04-11 fix: the cleanup path used to set
  // `intentionalCloseRef.current = true` and call `wsRef.current?.close()`,
  // relying on the ref flag to suppress reconnection in the async onclose
  // handler. In React 18 StrictMode this is a race: the dev-mode double-
  // mount runs effect → cleanup → effect in rapid succession, and the
  // re-running effect flips the flag back to `false` BEFORE the browser
  // actually fires `onclose` on the torn-down socket. When onclose finally
  // fires, it sees `intentionalCloseRef.current === false` and schedules a
  // reconnect → a ghost WS3 appears alongside the StrictMode-remounted WS2.
  // Both sockets receive the server's history replay on connect (from
  // `watcher.rs::get_watcher_history`) and both pipe events into the
  // dashboard reducer → every span appears 2×. After an API restart both
  // ghosts reconnect, compounding to 4×.
  //
  // The fix is to detach handlers (`ws.onclose = null`, etc.) BEFORE
  // calling close() on the teardown path. Null handlers are unconditionally
  // safe: any async close event from the browser is a no-op, regardless of
  // ref-flag state. The `intentionalCloseRef` flag is still useful for the
  // `disconnect()` path where we don't null handlers (to preserve the
  // setReadyState call), so we keep it set here as well for safety.
  useEffect(() => {
    if (autoConnect) {
      intentionalCloseRef.current = false;
      setIntentionalClose(false);
      createSocket();
    }

    return () => {
      intentionalCloseRef.current = true;
      // Do NOT mirror to setIntentionalClose here — this fires during
      // StrictMode effect cleanup, and flagging the unmount as an intentional
      // close would misreport isReconnecting for the remounted component.
      clearReconnectTimer();
      const ws = wsRef.current;
      if (ws) {
        detachHandlers(ws);
        ws.close();
      }
    };
  }, [url, autoConnect, createSocket, clearReconnectTimer]);

  const connected = readyState === WebSocket.OPEN;
  // Only "reconnecting" when we've had a successful connection, the caller
  // hasn't intentionally closed, and we're not currently OPEN. This is the
  // signal ReconnectBanner renders on — first-time connect and intentional
  // disconnect both resolve to false.
  const isReconnecting = hasEverOpened && !intentionalClose && !connected;

  return { connected, readyState, isReconnecting, connect, disconnect, send, error };
}
