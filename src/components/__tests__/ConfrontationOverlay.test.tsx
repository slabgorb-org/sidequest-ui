import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfrontationOverlay } from '../ConfrontationOverlay';
import type {
  ConfrontationData,
  EncounterActor,
  EncounterMetric,
  BeatOption,
  SecondaryStats,
} from '../ConfrontationOverlay';

// ═══════════════════════════════════════════════════════════
// Test fixtures
// ═══════════════════════════════════════════════════════════

const STANDOFF_ACTORS: EncounterActor[] = [
  { name: 'The Stranger', role: 'duelist', portrait_url: '/portraits/stranger.png' },
  { name: 'Black Bart', role: 'duelist', portrait_url: '/portraits/bart.png' },
];

const STANDOFF_PLAYER_METRIC: EncounterMetric = {
  name: 'tension',
  current: 3,
  starting: 0,
  threshold: 10,
};

const STANDOFF_OPPONENT_METRIC: EncounterMetric = {
  name: 'tension',
  current: 1,
  starting: 0,
  threshold: 10,
};

const STANDOFF_BEATS: BeatOption[] = [
  { id: 'stare_down', label: 'Stare Down', kind: 'press', base: 2, stat_check: 'NERVE', risk: 'Flinch' },
  { id: 'taunt', label: 'Taunt', kind: 'press', base: 1, stat_check: 'PRESENCE' },
  { id: 'draw', label: 'Draw!', kind: 'finisher', base: 3, stat_check: 'DRAW', resolution: true },
];

const STANDOFF_DATA: ConfrontationData = {
  type: 'standoff',
  label: 'High Noon Standoff',
  category: 'pre_combat',
  actors: STANDOFF_ACTORS,
  player_metric: STANDOFF_PLAYER_METRIC,
  opponent_metric: STANDOFF_OPPONENT_METRIC,
  beats: STANDOFF_BEATS,
  secondary_stats: null,
  genre_slug: 'spaghetti_western',
  mood: 'standoff',
};

const NEGOTIATION_ACTORS: EncounterActor[] = [
  { name: 'Player', role: 'negotiator' },
  { name: 'Crime Lord Vex', role: 'counterpart', portrait_url: '/portraits/vex.png' },
];

const NEGOTIATION_DATA: ConfrontationData = {
  type: 'negotiation',
  label: 'Corporate Negotiation',
  category: 'social',
  actors: NEGOTIATION_ACTORS,
  player_metric: {
    name: 'leverage',
    current: 5,
    starting: 0,
    threshold: 10,
  },
  opponent_metric: {
    name: 'leverage',
    current: 4,
    starting: 0,
    threshold: 10,
  },
  beats: [
    { id: 'pressure', label: 'Apply Pressure', kind: 'press', base: 2, stat_check: 'Cool' },
    { id: 'concede', label: 'Concede Point', kind: 'soak', base: 1, stat_check: 'Net' },
    { id: 'bluff', label: 'Bluff', kind: 'press', base: 3, stat_check: 'Cool', risk: 'Exposed' },
  ],
  secondary_stats: null,
  genre_slug: 'neon_dystopia',
  mood: 'tension',
};

const CHASE_SECONDARY_STATS: SecondaryStats = {
  stats: {
    hp: { current: 18, max: 18 },
    speed: { current: 3, max: 3 },
    armor: { current: 2, max: 2 },
    maneuver: { current: 3, max: 3 },
    fuel: { current: 10, max: 10 },
  },
};

const CHASE_DATA: ConfrontationData = {
  type: 'chase',
  label: 'Wasteland Pursuit',
  category: 'movement',
  actors: [
    { name: 'War Rig', role: 'pursuer' },
    { name: 'Player', role: 'quarry' },
  ],
  player_metric: {
    name: 'separation',
    current: 5,
    starting: 0,
    threshold: 10,
  },
  opponent_metric: {
    name: 'closing',
    current: 2,
    starting: 0,
    threshold: 10,
  },
  beats: [
    { id: 'floor_it', label: 'Floor It', kind: 'press', base: 2, stat_check: 'DRAW' },
    { id: 'swerve', label: 'Swerve', kind: 'press', base: 1, stat_check: 'NERVE', risk: 'Spin out' },
  ],
  secondary_stats: CHASE_SECONDARY_STATS,
  genre_slug: 'road_warrior',
  mood: 'tension',
};

const COMBAT_DATA: ConfrontationData = {
  type: 'combat',
  label: 'Ambush!',
  category: 'combat',
  actors: [
    { name: 'Raider', role: 'enemy' },
    { name: 'Player', role: 'combatant' },
  ],
  player_metric: {
    name: 'pressure',
    current: 0,
    starting: 0,
    threshold: 5,
  },
  opponent_metric: {
    name: 'pressure',
    current: 0,
    starting: 0,
    threshold: 5,
  },
  beats: [
    { id: 'attack', label: 'Attack', kind: 'press', base: 1, stat_check: 'GRIT' },
    { id: 'defend', label: 'Defend', kind: 'soak', base: 1, stat_check: 'NERVE' },
  ],
  secondary_stats: null,
  genre_slug: 'spaghetti_western',
  mood: 'combat',
};

// ═══════════════════════════════════════════════════════════
// AC1: ConfrontationOverlay renders for any confrontation type
// ═══════════════════════════════════════════════════════════

describe('AC1: Renders for any confrontation type', () => {
  it('renders standoff confrontation', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    expect(screen.getByTestId('confrontation-overlay')).toBeInTheDocument();
  });

  it('renders negotiation confrontation', () => {
    render(<ConfrontationOverlay data={NEGOTIATION_DATA} />);
    expect(screen.getByTestId('confrontation-overlay')).toBeInTheDocument();
  });

  it('renders chase confrontation', () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);
    expect(screen.getByTestId('confrontation-overlay')).toBeInTheDocument();
  });

  it('renders combat confrontation', () => {
    render(<ConfrontationOverlay data={COMBAT_DATA} />);
    expect(screen.getByTestId('confrontation-overlay')).toBeInTheDocument();
  });

  it('displays the confrontation label', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    expect(screen.getByText('High Noon Standoff')).toBeInTheDocument();
  });

  it('returns null when data is null', () => {
    const { container } = render(<ConfrontationOverlay data={null} />);
    expect(container.firstChild).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// AC2: Dual-dial metric bars (player + opponent edges)
// ═══════════════════════════════════════════════════════════

describe('AC2: Dual-dial metric display', () => {
  it('renders both player and opponent metric bars', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    const bars = screen.getAllByTestId('metric-bar');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute('data-metric-side', 'player');
    expect(bars[1]).toHaveAttribute('data-metric-side', 'opponent');
  });

  it('groups both bars under a dual-dial container', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    expect(screen.getByTestId('dual-dial-bars')).toBeInTheDocument();
  });

  it('shows player edge progress relative to its own threshold', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    // Player metric: current=3, threshold=10 → 30%
    const fills = screen.getAllByTestId('metric-bar-fill');
    expect(fills[0]).toHaveStyle({ width: '30%' });
  });

  it('shows opponent edge progress relative to its own threshold', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    // Opponent metric: current=1, threshold=10 → 10%
    const fills = screen.getAllByTestId('metric-bar-fill');
    expect(fills[1]).toHaveStyle({ width: '10%' });
  });

  it('labels each bar with its side via aria-label', () => {
    // D2 redesign (2026-05-13): the visible chip is "You"/"Them"; the long-
    // form "Player edge"/"Opponent edge" label lives on aria-label for screen
    // readers + tests. data-metric-side stays load-bearing for selection.
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    expect(screen.getByLabelText(/Player edge/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Opponent edge/i)).toBeInTheDocument();
  });

  it('flags a bar at threshold for visual emphasis', () => {
    const data: ConfrontationData = {
      ...STANDOFF_DATA,
      player_metric: { ...STANDOFF_DATA.player_metric, current: 10 },
    };
    render(<ConfrontationOverlay data={data} />);
    const bars = screen.getAllByTestId('metric-bar');
    expect(bars[0]).toHaveAttribute('data-at-threshold', 'true');
    expect(bars[1]).not.toHaveAttribute('data-at-threshold');
  });
});

// ═══════════════════════════════════════════════════════════
// AC3: Available beats render as action buttons
// ═══════════════════════════════════════════════════════════

describe('AC3: Beat action buttons', () => {
  it('renders all available beats as buttons', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    expect(screen.getByRole('button', { name: /Stare Down/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Taunt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Draw!/i })).toBeInTheDocument();
  });

  it('shows stat check on beat buttons', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    // Each beat button should show which stat it checks
    expect(screen.getByText(/NERVE/)).toBeInTheDocument();
    expect(screen.getByText(/PRESENCE/)).toBeInTheDocument();
    expect(screen.getByText(/DRAW/)).toBeInTheDocument();
  });

  it('marks resolution beats distinctly', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    const drawButton = screen.getByRole('button', { name: /Draw!/i });
    // Resolution beats should have a distinct visual treatment
    expect(drawButton).toHaveAttribute('data-resolution', 'true');
  });

  it('exposes risk indicator on risky beat buttons via accessible label', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    // "Stare Down" has risk: "Flinch". The risk text lives on the button's
    // title/aria-label (tooltip surface) so the visible label stays scannable
    // — previously risk text was jammed inline, making 3-field button labels
    // like "Ram Grip [Rig damage on failure...]".
    const stareDown = screen.getByRole('button', { name: /Stare Down.*Flinch/i });
    expect(stareDown).toBeInTheDocument();
    expect(stareDown).toHaveAttribute('title', expect.stringMatching(/Flinch/i));
  });

  it('renders negotiation beats', () => {
    render(<ConfrontationOverlay data={NEGOTIATION_DATA} />);
    expect(screen.getByRole('button', { name: /Apply Pressure/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Concede Point/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bluff/i })).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// AC4: Actor chips (compact status line)
//
// D2 redesign (2026-05-13): the panel now mounts above the InputBar, not
// as a side dockview tab. Actors render as tiny initial-bubbles in a one-
// line status row instead of full portrait + name + role cards — the full
// portrait gallery is the CharacterPanel's job. Name + role live on the
// chip's title attribute so they're still surfaced for tooltips/a11y.
// ═══════════════════════════════════════════════════════════

describe('AC4: Actor chips', () => {
  it('renders one chip per actor', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    const chips = screen.getAllByTestId('actor-portrait');
    expect(chips).toHaveLength(2);
  });

  it('surfaces actor name + role via chip title attribute', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    const chips = screen.getAllByTestId('actor-portrait');
    expect(chips[0]).toHaveAttribute('title', expect.stringMatching(/The Stranger.*duelist/));
    expect(chips[1]).toHaveAttribute('title', expect.stringMatching(/Black Bart.*duelist/));
  });

  it('shows the actor initial inside the chip', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    const overlay = screen.getByTestId('confrontation-overlay');
    // Both standoff actors start with different letters → both appear inside
    // the overlay's actor chips.
    expect(within(overlay).getByText('T')).toBeInTheDocument();
    expect(within(overlay).getByText('B')).toBeInTheDocument();
  });

  it('renders chips for participants with no portrait_url', () => {
    render(<ConfrontationOverlay data={NEGOTIATION_DATA} />);
    const chips = screen.getAllByTestId('actor-portrait');
    expect(chips).toHaveLength(2);
    // "Player" (no portrait_url) is still a chip with its title set.
    expect(chips[0]).toHaveAttribute('title', expect.stringMatching(/Player/));
  });
});

// ═══════════════════════════════════════════════════════════
// AC5: Secondary stats render when present
// ═══════════════════════════════════════════════════════════

describe('AC5: Secondary stats', () => {
  it('renders secondary stats for chase', () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);
    expect(screen.getByTestId('secondary-stats')).toBeInTheDocument();
  });

  it('shows rig HP bar', () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);
    expect(screen.getByText(/18.*\/.*18/)).toBeInTheDocument();
  });

  it('shows fuel gauge', () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);
    expect(screen.getByText(/fuel/i)).toBeInTheDocument();
    // Fuel renders as "10 / 10" inside the secondary stats panel.
    // Disambiguate from the dual-dial bars (which also render
    // "current / threshold") by scoping to the panel.
    const panel = screen.getByTestId('secondary-stats');
    expect(panel).toHaveTextContent(/10\s*\/\s*10/);
  });

  it('shows speed and maneuver', () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);
    expect(screen.getByText(/speed/i)).toBeInTheDocument();
    expect(screen.getByText(/maneuver/i)).toBeInTheDocument();
  });

  it('does not render secondary stats when null', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    expect(screen.queryByTestId('secondary-stats')).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// AC6: Standoff still exposes its type via data-type
//
// D2 redesign (2026-05-13): the old letterbox/extreme-closeup theming
// targeted the side-dockview tab layout. With the panel now mounting in
// the input area, the compact status line is the only chrome and there's
// no closeup-frame to letterbox. data-type stays on the root so
// genre-themed CSS overrides remain wireable in the future.
// ═══════════════════════════════════════════════════════════

describe('AC6: Standoff exposes data-type', () => {
  it('marks standoff overlay with data-type="standoff"', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    const overlay = screen.getByTestId('confrontation-overlay');
    expect(overlay).toHaveAttribute('data-type', 'standoff');
  });
});

// ═══════════════════════════════════════════════════════════
// AC7: Chase delegates to chase visualization
// ═══════════════════════════════════════════════════════════

describe('AC7: Chase type rendering', () => {
  it('renders chase-specific layout', () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);
    const overlay = screen.getByTestId('confrontation-overlay');
    expect(overlay).toHaveAttribute('data-type', 'chase');
  });

  it('shows separation metric for chase', () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);
    expect(screen.getByText(/separation/i)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// AC8: Combat keeps current layout
// ═══════════════════════════════════════════════════════════

describe('AC8: Combat type rendering', () => {
  it('renders combat-specific layout', () => {
    render(<ConfrontationOverlay data={COMBAT_DATA} />);
    const overlay = screen.getByTestId('confrontation-overlay');
    expect(overlay).toHaveAttribute('data-type', 'combat');
  });
});

// ═══════════════════════════════════════════════════════════
// AC9: Genre theming
// ═══════════════════════════════════════════════════════════

describe('AC9: Genre-themed visual treatment', () => {
  it('applies genre slug as data attribute', () => {
    render(<ConfrontationOverlay data={STANDOFF_DATA} />);
    const overlay = screen.getByTestId('confrontation-overlay');
    expect(overlay).toHaveAttribute('data-genre', 'spaghetti_western');
  });

  it('neon_dystopia gets its genre attribute', () => {
    render(<ConfrontationOverlay data={NEGOTIATION_DATA} />);
    const overlay = screen.getByTestId('confrontation-overlay');
    expect(overlay).toHaveAttribute('data-genre', 'neon_dystopia');
  });

  it('road_warrior gets its genre attribute', () => {
    render(<ConfrontationOverlay data={CHASE_DATA} />);
    const overlay = screen.getByTestId('confrontation-overlay');
    expect(overlay).toHaveAttribute('data-genre', 'road_warrior');
  });
});
