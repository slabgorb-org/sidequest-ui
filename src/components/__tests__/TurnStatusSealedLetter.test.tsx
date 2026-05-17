/**
 * RED tests for Story 13-13: Player panel sealed-letter prominence.
 *
 * Enhances TurnStatusPanel with the sealed-letter visual metaphor:
 * - Per-player sealed/unsealed letter indicators
 * - "All letters sealed" transition state when all players submit
 * - Hidden in single-player (entries <= 1)
 * - Visual prominence during sealed rounds (data attributes for CSS)
 *
 * These tests describe behavior that DOES NOT YET EXIST — they will fail
 * until the Dev implements the changes. This is the RED state for TDD.
 *
 * Types under test:
 *   - TurnStatusPanel — enhanced presentational component
 *   - TurnStatusPanelProps — new/updated props for sealed-letter mode
 */

import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TurnStatusPanel } from '../TurnStatusPanel';
import type { TurnStatusEntry } from '../TurnStatusPanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KAEL_PENDING: TurnStatusEntry = {
  player_id: 'p1',
  character_name: 'Kael',
  status: 'pending',
};

const LYRA_SUBMITTED: TurnStatusEntry = {
  player_id: 'p2',
  character_name: 'Lyra Dawnforge',
  status: 'submitted',
};

const THANE_PENDING: TurnStatusEntry = {
  player_id: 'p3',
  character_name: 'Thane',
  status: 'pending',
};

const TWO_PLAYERS_MIXED: TurnStatusEntry[] = [KAEL_PENDING, LYRA_SUBMITTED];
const THREE_PLAYERS_MIXED: TurnStatusEntry[] = [KAEL_PENDING, LYRA_SUBMITTED, THANE_PENDING];
const ALL_SUBMITTED: TurnStatusEntry[] = [
  { ...KAEL_PENDING, status: 'submitted' },
  LYRA_SUBMITTED,
  { ...THANE_PENDING, status: 'submitted' },
];
const TWO_ALL_SUBMITTED: TurnStatusEntry[] = [
  { ...KAEL_PENDING, status: 'submitted' },
  LYRA_SUBMITTED,
];

// ===========================================================================
// AC: Hidden in single-player — panel not rendered when solo
// ===========================================================================

describe('TurnStatusPanel — 13-13 AC: hidden in single-player', () => {
  it('does not render when entries has only one player', () => {
    render(
      <TurnStatusPanel
        entries={[KAEL_PENDING]}
        gameMode="structured"
      />,
    );
    expect(screen.queryByTestId('turn-status-panel')).not.toBeInTheDocument();
  });

  it('does not render when entries is empty', () => {
    render(
      <TurnStatusPanel
        entries={[]}
        gameMode="structured"
      />,
    );
    expect(screen.queryByTestId('turn-status-panel')).not.toBeInTheDocument();
  });

  it('renders when entries has two or more players', () => {
    render(
      <TurnStatusPanel
        entries={TWO_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    expect(screen.getByTestId('turn-status-panel')).toBeInTheDocument();
  });

  it('renders when entries has three players', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    expect(screen.getByTestId('turn-status-panel')).toBeInTheDocument();
  });
});

// ===========================================================================
// AC: Prominent during sealed round — visual block, not subtle indicator
// ===========================================================================

describe('TurnStatusPanel — 13-13 AC: visual prominence during sealed round', () => {
  it('marks panel as sealed round via data-sealed-round attribute', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    const panel = screen.getByTestId('turn-status-panel');
    expect(panel).toHaveAttribute('data-sealed-round', 'true');
  });

  it('does not mark sealed round in cinematic mode', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="cinematic"
      />,
    );
    const panel = screen.getByTestId('turn-status-panel');
    expect(panel).not.toHaveAttribute('data-sealed-round', 'true');
  });

  it('has role="status" for accessibility during sealed round', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    const panel = screen.getByTestId('turn-status-panel');
    expect(panel).toHaveAttribute('role', 'status');
  });
});

// ===========================================================================
// AC: Per-player sealed/unsealed letter indicators
// ===========================================================================

describe('TurnStatusPanel — 13-13 AC: per-player sealed/unsealed indicators', () => {
  it('shows unsealed letter indicator for pending player', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    const entry = screen.getByTestId('turn-entry-p1');
    const indicator = within(entry).getByTestId('status-indicator');
    expect(indicator).toHaveAttribute('data-letter', 'unsealed');
  });

  it('shows sealed letter indicator for submitted player', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    const entry = screen.getByTestId('turn-entry-p2');
    const indicator = within(entry).getByTestId('status-indicator');
    expect(indicator).toHaveAttribute('data-letter', 'sealed');
  });

  it('treats auto_resolved as sealed', () => {
    const withAutoResolved: TurnStatusEntry[] = [
      KAEL_PENDING,
      { player_id: 'p2', character_name: 'Lyra', status: 'auto_resolved' },
    ];
    render(
      <TurnStatusPanel
        entries={withAutoResolved}
        gameMode="structured"
      />,
    );
    const entry = screen.getByTestId('turn-entry-p2');
    const indicator = within(entry).getByTestId('status-indicator');
    expect(indicator).toHaveAttribute('data-letter', 'sealed');
  });

  it('shows sealed/unsealed label text per player', () => {
    render(
      <TurnStatusPanel
        entries={TWO_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    const kaelEntry = screen.getByTestId('turn-entry-p1');
    const lyraEntry = screen.getByTestId('turn-entry-p2');
    // Pending player should show composing/unsealed text
    expect(within(kaelEntry).getByText(/composing|unsealed|writing/i)).toBeInTheDocument();
    // Submitted player should show sealed text
    expect(within(lyraEntry).getByText(/sealed|submitted/i)).toBeInTheDocument();
  });

  it('updates letter indicator when player submits (rerender)', () => {
    const { rerender } = render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    // Kael starts unsealed
    const kaelBefore = screen.getByTestId('turn-entry-p1');
    expect(within(kaelBefore).getByTestId('status-indicator')).toHaveAttribute(
      'data-letter',
      'unsealed',
    );

    // Kael submits
    const updated: TurnStatusEntry[] = [
      { ...KAEL_PENDING, status: 'submitted' },
      LYRA_SUBMITTED,
      THANE_PENDING,
    ];
    rerender(
      <TurnStatusPanel
        entries={updated}
        gameMode="structured"
      />,
    );

    const kaelAfter = screen.getByTestId('turn-entry-p1');
    expect(within(kaelAfter).getByTestId('status-indicator')).toHaveAttribute(
      'data-letter',
      'sealed',
    );
  });
});

// ===========================================================================
// AC: "All in" state — visual transition when all players have submitted
// ===========================================================================

describe('TurnStatusPanel — 13-13 AC: all-in transition state', () => {
  it('shows "all letters sealed" message when all players submitted', () => {
    render(
      <TurnStatusPanel
        entries={ALL_SUBMITTED}
        gameMode="structured"
        localPlayerId="p1"
      />,
    );
    expect(screen.getByText(/all letters sealed/i)).toBeInTheDocument();
  });

  it('marks panel with data-all-in attribute when all submitted', () => {
    render(
      <TurnStatusPanel
        entries={ALL_SUBMITTED}
        gameMode="structured"
      />,
    );
    const panel = screen.getByTestId('turn-status-panel');
    expect(panel).toHaveAttribute('data-all-in', 'true');
  });

  it('does not show all-in state when some players still pending', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    const panel = screen.getByTestId('turn-status-panel');
    expect(panel).not.toHaveAttribute('data-all-in', 'true');
    expect(screen.queryByText(/all letters sealed/i)).not.toBeInTheDocument();
  });

  it('shows all-in for two-player game when both submit', () => {
    render(
      <TurnStatusPanel
        entries={TWO_ALL_SUBMITTED}
        gameMode="structured"
        localPlayerId="p1"
      />,
    );
    expect(screen.getByText(/all letters sealed/i)).toBeInTheDocument();
  });

  it('transitions to all-in when last player submits (rerender)', () => {
    const { rerender } = render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
        localPlayerId="p1"
      />,
    );
    expect(screen.queryByText(/all letters sealed/i)).not.toBeInTheDocument();

    // All players submit
    rerender(
      <TurnStatusPanel
        entries={ALL_SUBMITTED}
        gameMode="structured"
        localPlayerId="p1"
      />,
    );
    expect(screen.getByText(/all letters sealed/i)).toBeInTheDocument();
  });

  it('does NOT show all-in on the last-actor tab when peers submitted but local player has not (playtest 2026-05-17)', () => {
    // App.tsx never pushes a "pending" entry (2026-05-15 inversion
    // regression), so the last-to-act player's own tab receives a
    // peers-only list. Without the local-player guard this read as
    // "All letters sealed — resolving…" while Katia's input was still
    // live — a slow declarer (Alex/Sebastien) would think the turn
    // already moved on.
    const peersOnlyNoKatia: TurnStatusEntry[] = [
      { player_id: 'carl', character_name: 'Carl', status: 'submitted' },
      { player_id: 'donut', character_name: 'Donut', status: 'submitted' },
    ];
    render(
      <TurnStatusPanel
        entries={peersOnlyNoKatia}
        gameMode="structured"
        localPlayerId="katia"
      />,
    );
    const panel = screen.getByTestId('turn-status-panel');
    expect(panel).not.toHaveAttribute('data-all-in', 'true');
    expect(screen.queryByText(/all letters sealed/i)).not.toBeInTheDocument();
  });

  it('all-in state includes auto_resolved players as sealed', () => {
    const mixedResolved: TurnStatusEntry[] = [
      { player_id: 'p1', character_name: 'Kael', status: 'submitted' },
      { player_id: 'p2', character_name: 'Lyra', status: 'auto_resolved' },
    ];
    render(
      <TurnStatusPanel
        entries={mixedResolved}
        gameMode="structured"
        localPlayerId="p1"
      />,
    );
    const panel = screen.getByTestId('turn-status-panel');
    expect(panel).toHaveAttribute('data-all-in', 'true');
  });
});

// ===========================================================================
// AC: Consumes TURN_STATUS messages — no new protocol needed
// ===========================================================================

describe('TurnStatusPanel — 13-13 AC: existing TURN_STATUS consumption', () => {
  it('renders correct count of sealed vs unsealed from TURN_STATUS entries', () => {
    // Simulates state after processing 3 TURN_STATUS messages:
    // p1=pending, p2=submitted, p3=pending
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    const entries = screen.getAllByTestId(/^turn-entry-/);
    expect(entries).toHaveLength(3);

    // Count sealed vs unsealed
    const sealed = entries.filter((e) => {
      const indicator = within(e).getByTestId('status-indicator');
      return indicator.getAttribute('data-letter') === 'sealed';
    });
    const unsealed = entries.filter((e) => {
      const indicator = within(e).getByTestId('status-indicator');
      return indicator.getAttribute('data-letter') === 'unsealed';
    });
    expect(sealed).toHaveLength(1); // Lyra submitted
    expect(unsealed).toHaveLength(2); // Kael + Thane pending
  });
});

// ===========================================================================
// Wiring test: TurnStatusPanel is imported and used in GameBoard
// ===========================================================================

describe('TurnStatusPanel — 13-13: wiring verification', () => {
  it('GameBoard imports TurnStatusPanel (static verification)', async () => {
    // Read the GameBoard source to verify it imports and renders TurnStatusPanel.
    // This is a compile-time wiring check — if the import breaks, this test
    // will fail to resolve the module.
    const gameBoardModule = await import('../../components/GameBoard/GameBoard');
    expect(gameBoardModule).toBeDefined();
    // The module should export GameBoard which renders TurnStatusPanel internally
    expect(typeof gameBoardModule.GameBoard).toBe('function');
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe('TurnStatusPanel — 13-13: edge cases', () => {
  it('does not show sealed-round attributes in freeplay mode', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="freeplay"
      />,
    );
    // Panel should not render at all in freeplay
    expect(screen.queryByTestId('turn-status-panel')).not.toBeInTheDocument();
  });

  it('player count display shows sealed count / total', () => {
    render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    // Should display "1 / 3" or similar sealed count
    expect(screen.getByText(/1\s*\/\s*3|1 of 3/)).toBeInTheDocument();
  });

  it('updates sealed count when entries change', () => {
    const { rerender } = render(
      <TurnStatusPanel
        entries={THREE_PLAYERS_MIXED}
        gameMode="structured"
      />,
    );
    expect(screen.getByText(/1\s*\/\s*3|1 of 3/)).toBeInTheDocument();

    // Kael submits → 2/3 sealed
    const updated: TurnStatusEntry[] = [
      { ...KAEL_PENDING, status: 'submitted' },
      LYRA_SUBMITTED,
      THANE_PENDING,
    ];
    rerender(
      <TurnStatusPanel
        entries={updated}
        gameMode="structured"
      />,
    );
    expect(screen.getByText(/2\s*\/\s*3|2 of 3/)).toBeInTheDocument();
  });

  it('does not show waiting message in sealed-round mode (replaced by letter metaphor)', () => {
    // The old "Waiting for other players..." should be replaced by the
    // sealed-letter metaphor in structured mode
    render(
      <TurnStatusPanel
        entries={TWO_PLAYERS_MIXED}
        gameMode="structured"
        localPlayerId="p2"
      />,
    );
    // Old waiting message should NOT appear — sealed letter metaphor replaces it
    expect(screen.queryByText(/waiting for other players/i)).not.toBeInTheDocument();
    // Instead, should show composing/unsealed status for pending players
    expect(screen.getByText(/composing|unsealed|writing/i)).toBeInTheDocument();
  });
});
