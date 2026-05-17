/**
 * TurnStatusPanel — Shows pending/submitted status per player during turn collection.
 *
 * Presentational component: receives turn entries as props, renders status per player.
 * WebSocket integration lives in the parent (provider/hook layer).
 *
 * Story 13-13: Enhanced with sealed-letter visual metaphor for multiplayer prominence.
 * Per-player sealed/unsealed indicators, "all letters sealed" transition state,
 * hidden in single-player, data attributes for CSS styling.
 */

import { useEffect, useMemo, useRef } from 'react';

export interface TurnStatusEntry {
  player_id: string;
  character_name: string;
  status: 'pending' | 'submitted' | 'auto_resolved';
}

export type GameMode = 'freeplay' | 'structured' | 'cinematic';

export interface TurnStatusPanelProps {
  entries: TurnStatusEntry[];
  localPlayerId?: string;
  gameMode?: GameMode;
  onLocalStatusChange?: (status: TurnStatusEntry['status']) => void;
}

function isResolved(status: TurnStatusEntry['status']): boolean {
  return status === 'submitted' || status === 'auto_resolved';
}

export function TurnStatusPanel({
  entries,
  localPlayerId,
  gameMode,
  onLocalStatusChange,
}: TurnStatusPanelProps) {
  // Deduplicate by player_id — last entry wins
  const deduped = useMemo(() => {
    const map = new Map<string, TurnStatusEntry>();
    for (const entry of entries) {
      map.set(entry.player_id, entry);
    }
    return Array.from(map.values());
  }, [entries]);

  const localEntry = localPlayerId
    ? deduped.find((e) => e.player_id === localPlayerId)
    : undefined;

  const localStatus = localEntry?.status;
  // `entries` only ever carries submitted/auto_resolved players — App.tsx
  // deliberately never pushes a "pending" entry (the 2026-05-15
  // party-panel-inversion regression). So `every(isResolved)` over a
  // peers-only list reads as "all sealed" on the last-to-act player's
  // own tab while they still owe an action (playtest 2026-05-17, Katia:
  // "All letters sealed — resolving…" with her input still live). A tab
  // always knows whether ITS OWN player has acted; gate all-resolved on
  // the local player being present AND resolved so a peers-only list can
  // never falsely claim the turn is resolving. When localPlayerId is
  // unknown (spectator) keep the original behavior — don't over-constrain
  // what we can't observe.
  const localResolved = localEntry !== undefined && isResolved(localEntry.status);
  const allResolved =
    deduped.length > 0 &&
    deduped.every((e) => isResolved(e.status)) &&
    (localPlayerId === undefined || localResolved);
  const showWaiting = localStatus !== undefined && isResolved(localStatus) && !allResolved;
  const isStructured = gameMode === 'structured';
  const sealedCount = deduped.filter((e) => isResolved(e.status)).length;
  const localAutoResolved = localStatus === 'auto_resolved';

  // Track previous status to deduplicate callback fires
  const prevStatusRef = useRef<TurnStatusEntry['status'] | undefined>(undefined);

  // Notify parent of local player status changes — gated by mode and deduped by ref
  useEffect(() => {
    if (gameMode === 'freeplay') return;
    if (localStatus && localStatus !== prevStatusRef.current && onLocalStatusChange) {
      onLocalStatusChange(localStatus);
    }
    prevStatusRef.current = localStatus;
  }, [localStatus, onLocalStatusChange, gameMode]);

  // Mode-aware: hidden in freeplay (after hooks to satisfy Rules of Hooks)
  if (gameMode === 'freeplay') {
    return null;
  }

  // Hidden in single-player during active game modes — panel only shows for multiplayer (2+ players)
  if (gameMode && deduped.length < 2) {
    return null;
  }

  return (
    <div
      data-testid="turn-status-panel"
      data-sealed-round={isStructured ? 'true' : undefined}
      data-all-in={isStructured && allResolved ? 'true' : undefined}
      role={isStructured ? 'status' : undefined}
      className="flex items-center gap-3 text-sm"
    >
      {deduped.map((entry) => {
        const sealed = isResolved(entry.status);
        return (
          <div
            key={entry.player_id}
            data-testid={`turn-entry-${entry.player_id}`}
            data-local={localPlayerId ? String(entry.player_id === localPlayerId) : undefined}
            className="flex items-center gap-1.5"
          >
            <span className="font-medium text-foreground/80">{entry.character_name}</span>
            <span
              data-testid="status-indicator"
              data-status={entry.status}
              data-letter={isStructured ? (sealed ? 'sealed' : 'unsealed') : undefined}
              data-timeout={entry.status === 'auto_resolved' ? 'true' : undefined}
              className={`inline-block w-2 h-2 rounded-full ${
                sealed ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            {isStructured ? (
              <span className={sealed ? 'text-emerald-400' : 'text-amber-400'}>{sealed ? '✓ Sealed' : 'Composing…'}</span>
            ) : (
              entry.status === 'auto_resolved' && (
                <span className="text-amber-500 text-xs ml-1">timed out</span>
              )
            )}
          </div>
        );
      })}
      {isStructured && !allResolved && (
        <span className="text-muted-foreground ml-2">({sealedCount}/{deduped.length})</span>
      )}
      {isStructured && allResolved && (
        <span className="text-emerald-400 ml-2 font-medium">All letters sealed — resolving…</span>
      )}
      {!isStructured && showWaiting && <span>Waiting for other players...</span>}
      {!isStructured && allResolved && <span>Resolving turn...</span>}
      {localAutoResolved && (
        <span className="text-amber-500 ml-2 font-medium">
          Your action timed out
        </span>
      )}
    </div>
  );
}
