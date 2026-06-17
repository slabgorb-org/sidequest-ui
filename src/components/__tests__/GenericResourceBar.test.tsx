import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GenericResourceBar } from '../GenericResourceBar';
import type {
  ResourceBarProps,
  ResourceThreshold,
} from '../GenericResourceBar';

// ═══════════════════════════════════════════════════════════
// Test fixtures
// ═══════════════════════════════════════════════════════════

const LUCK_THRESHOLDS: ResourceThreshold[] = [
  { value: 3, label: 'Unlucky', direction: 'low' },
  { value: 8, label: 'Lucky Streak', direction: 'high' },
];

const BASE_PROPS: ResourceBarProps = {
  name: 'Luck',
  value: 5,
  max: 10,
  genre_slug: 'spaghetti_western',
  thresholds: LUCK_THRESHOLDS,
};

const HUMANITY_PROPS: ResourceBarProps = {
  name: 'Humanity',
  value: 7,
  max: 10,
  genre_slug: 'neon_dystopia',
  thresholds: [
    { value: 3, label: 'Losing Grip', direction: 'low' },
    { value: 9, label: 'Transcendent', direction: 'high' },
  ],
};

const HEAT_PROPS: ResourceBarProps = {
  name: 'Heat',
  value: 4,
  max: 10,
  genre_slug: 'pulp_noir',
  thresholds: [
    { value: 7, label: 'Too Hot', direction: 'high' },
  ],
};

const FUEL_PROPS: ResourceBarProps = {
  name: 'Fuel',
  value: 8,
  max: 10,
  genre_slug: 'road_warrior',
  thresholds: [
    { value: 2, label: 'Running on Fumes', direction: 'low' },
  ],
};

// Mock for audio sting callback
const mockOnThresholdCrossed = vi.fn();

// ═══════════════════════════════════════════════════════════
// AC1: GenericResourceBar renders with name, value, max
// ═══════════════════════════════════════════════════════════

describe('AC1: Renders with name, value, max', () => {
  it('renders the resource bar element', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    expect(screen.getByTestId('resource-bar')).toBeInTheDocument();
  });

  it('displays the resource name', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    expect(screen.getByText('Luck')).toBeInTheDocument();
  });

  it('displays the current value', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it('displays the max value', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it('displays value in "current / max" format', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    expect(screen.getByText(/5\s*\/\s*10/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════
// AC2: Progress bar shows correct percentage
// ═══════════════════════════════════════════════════════════

describe('AC2: Progress bar percentage', () => {
  it('renders the fill element', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    expect(screen.getByTestId('resource-bar-fill')).toBeInTheDocument();
  });

  it('shows 50% width for value 5 of max 10', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    const fill = screen.getByTestId('resource-bar-fill');
    expect(fill).toHaveStyle({ width: '50%' });
  });

  it('shows 70% width for value 7 of max 10', () => {
    render(<GenericResourceBar {...HUMANITY_PROPS} />);
    const fill = screen.getByTestId('resource-bar-fill');
    expect(fill).toHaveStyle({ width: '70%' });
  });

  it('shows 80% width for value 8 of max 10', () => {
    render(<GenericResourceBar {...FUEL_PROPS} />);
    const fill = screen.getByTestId('resource-bar-fill');
    expect(fill).toHaveStyle({ width: '80%' });
  });
});

// ═══════════════════════════════════════════════════════════
// AC3: Genre-themed colors via data-genre attribute
// ═══════════════════════════════════════════════════════════

describe('AC3: Genre-themed colors', () => {
  it('applies spaghetti_western genre attribute', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    const bar = screen.getByTestId('resource-bar');
    expect(bar).toHaveAttribute('data-genre', 'spaghetti_western');
  });

  it('applies neon_dystopia genre attribute', () => {
    render(<GenericResourceBar {...HUMANITY_PROPS} />);
    const bar = screen.getByTestId('resource-bar');
    expect(bar).toHaveAttribute('data-genre', 'neon_dystopia');
  });

  it('applies pulp_noir genre attribute', () => {
    render(<GenericResourceBar {...HEAT_PROPS} />);
    const bar = screen.getByTestId('resource-bar');
    expect(bar).toHaveAttribute('data-genre', 'pulp_noir');
  });

  it('applies road_warrior genre attribute', () => {
    render(<GenericResourceBar {...FUEL_PROPS} />);
    const bar = screen.getByTestId('resource-bar');
    expect(bar).toHaveAttribute('data-genre', 'road_warrior');
  });
});

// ═══════════════════════════════════════════════════════════
// AC4: Threshold markers displayed on the bar
// ═══════════════════════════════════════════════════════════

describe('AC4: Threshold markers', () => {
  it('renders threshold markers', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    const markers = screen.getAllByTestId('threshold-marker');
    expect(markers).toHaveLength(2);
  });

  it('positions low threshold marker at correct percentage', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    const markers = screen.getAllByTestId('threshold-marker');
    // value 3 of max 10 = 30%
    const lowMarker = markers.find((m) => m.getAttribute('data-direction') === 'low');
    expect(lowMarker).toHaveStyle({ left: '30%' });
  });

  it('positions high threshold marker at correct percentage', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    const markers = screen.getAllByTestId('threshold-marker');
    // value 8 of max 10 = 80%
    const highMarker = markers.find((m) => m.getAttribute('data-direction') === 'high');
    expect(highMarker).toHaveStyle({ left: '80%' });
  });

  it('shows threshold labels', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    expect(screen.getByText('Unlucky')).toBeInTheDocument();
    expect(screen.getByText('Lucky Streak')).toBeInTheDocument();
  });

  it('renders single threshold when only one defined', () => {
    render(<GenericResourceBar {...HEAT_PROPS} />);
    const markers = screen.getAllByTestId('threshold-marker');
    expect(markers).toHaveLength(1);
  });

  it('renders no markers when no thresholds provided', () => {
    const noThresholds = { ...BASE_PROPS, thresholds: [] };
    render(<GenericResourceBar {...noThresholds} />);
    expect(screen.queryAllByTestId('threshold-marker')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// AC5: Pulse animation on threshold crossing
// ═══════════════════════════════════════════════════════════

describe('AC5: Pulse animation on threshold crossing', () => {
  it('does not pulse when value is between thresholds', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    const bar = screen.getByTestId('resource-bar');
    expect(bar).not.toHaveClass('threshold-pulse');
  });

  it('applies pulse class when value crosses low threshold', () => {
    const crossedLow = { ...BASE_PROPS, value: 2 };
    render(<GenericResourceBar {...crossedLow} />);
    const bar = screen.getByTestId('resource-bar');
    expect(bar).toHaveClass('threshold-pulse');
  });

  it('applies pulse class when value crosses high threshold', () => {
    const crossedHigh = { ...BASE_PROPS, value: 9 };
    render(<GenericResourceBar {...crossedHigh} />);
    const bar = screen.getByTestId('resource-bar');
    expect(bar).toHaveClass('threshold-pulse');
  });

  it('marks which threshold was crossed via data attribute', () => {
    const crossedLow = { ...BASE_PROPS, value: 2 };
    render(<GenericResourceBar {...crossedLow} />);
    const bar = screen.getByTestId('resource-bar');
    expect(bar).toHaveAttribute('data-threshold-crossed', 'Unlucky');
  });
});

// ═══════════════════════════════════════════════════════════
// AC6: Toast notification on threshold crossing
// ═══════════════════════════════════════════════════════════

describe('AC6: Toast notification on threshold crossing', () => {
  it('shows toast when low threshold crossed', () => {
    const crossedLow = { ...BASE_PROPS, value: 2 };
    render(<GenericResourceBar {...crossedLow} />);
    expect(screen.getByTestId('threshold-toast')).toBeInTheDocument();
    expect(screen.getByTestId('threshold-toast')).toHaveTextContent(/Unlucky/);
  });

  it('shows toast when high threshold crossed', () => {
    const crossedHigh = { ...BASE_PROPS, value: 9 };
    render(<GenericResourceBar {...crossedHigh} />);
    expect(screen.getByTestId('threshold-toast')).toBeInTheDocument();
    expect(screen.getByTestId('threshold-toast')).toHaveTextContent(/Lucky Streak/);
  });

  it('does not show toast when no threshold crossed', () => {
    render(<GenericResourceBar {...BASE_PROPS} />);
    expect(screen.queryByTestId('threshold-toast')).not.toBeInTheDocument();
  });

  it('toast includes resource name for context', () => {
    const crossedLow = { ...BASE_PROPS, value: 2 };
    render(<GenericResourceBar {...crossedLow} />);
    expect(screen.getByTestId('threshold-toast')).toHaveTextContent(/Luck/);
  });
});

// ═══════════════════════════════════════════════════════════
// AC7: Audio sting on threshold crossing
// ═══════════════════════════════════════════════════════════

describe('AC7: Audio sting on threshold crossing', () => {
  it('calls onThresholdCrossed callback when low threshold crossed', () => {
    const crossedLow = { ...BASE_PROPS, value: 2, onThresholdCrossed: mockOnThresholdCrossed };
    render(<GenericResourceBar {...crossedLow} />);
    expect(mockOnThresholdCrossed).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'Luck',
        threshold: expect.objectContaining({ label: 'Unlucky', direction: 'low' }),
      }),
    );
  });

  it('calls onThresholdCrossed callback when high threshold crossed', () => {
    mockOnThresholdCrossed.mockClear();
    const crossedHigh = { ...BASE_PROPS, value: 9, onThresholdCrossed: mockOnThresholdCrossed };
    render(<GenericResourceBar {...crossedHigh} />);
    expect(mockOnThresholdCrossed).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'Luck',
        threshold: expect.objectContaining({ label: 'Lucky Streak', direction: 'high' }),
      }),
    );
  });

  it('does not call onThresholdCrossed when no threshold crossed', () => {
    mockOnThresholdCrossed.mockClear();
    render(<GenericResourceBar {...BASE_PROPS} onThresholdCrossed={mockOnThresholdCrossed} />);
    expect(mockOnThresholdCrossed).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
// AC8: Multiple resource bars render independently
// ═══════════════════════════════════════════════════════════

describe('AC8: Multiple resource bars', () => {
  it('renders multiple bars simultaneously', () => {
    render(
      <div>
        <GenericResourceBar {...BASE_PROPS} />
        <GenericResourceBar {...HUMANITY_PROPS} />
        <GenericResourceBar {...HEAT_PROPS} />
      </div>,
    );
    const bars = screen.getAllByTestId('resource-bar');
    expect(bars).toHaveLength(3);
  });

  it('each bar shows its own name', () => {
    render(
      <div>
        <GenericResourceBar {...BASE_PROPS} />
        <GenericResourceBar {...HUMANITY_PROPS} />
      </div>,
    );
    expect(screen.getByText('Luck')).toBeInTheDocument();
    expect(screen.getByText('Humanity')).toBeInTheDocument();
  });

  it('each bar has its own genre attribute', () => {
    render(
      <div>
        <GenericResourceBar {...BASE_PROPS} />
        <GenericResourceBar {...HUMANITY_PROPS} />
      </div>,
    );
    const bars = screen.getAllByTestId('resource-bar');
    expect(bars[0]).toHaveAttribute('data-genre', 'spaghetti_western');
    expect(bars[1]).toHaveAttribute('data-genre', 'neon_dystopia');
  });

  it('each bar shows correct fill width independently', () => {
    render(
      <div>
        <GenericResourceBar {...BASE_PROPS} />
        <GenericResourceBar {...HUMANITY_PROPS} />
      </div>,
    );
    const fills = screen.getAllByTestId('resource-bar-fill');
    expect(fills[0]).toHaveStyle({ width: '50%' });
    expect(fills[1]).toHaveStyle({ width: '70%' });
  });

  it('threshold crossing on one bar does not affect others', () => {
    const crossedLow = { ...BASE_PROPS, value: 2 };
    render(
      <div>
        <GenericResourceBar {...crossedLow} />
        <GenericResourceBar {...HUMANITY_PROPS} />
      </div>,
    );
    const bars = screen.getAllByTestId('resource-bar');
    expect(bars[0]).toHaveClass('threshold-pulse');
    expect(bars[1]).not.toHaveClass('threshold-pulse');
  });
});

// ═══════════════════════════════════════════════════════════
// AC9: Zero and max edge cases
// ═══════════════════════════════════════════════════════════

describe('AC9: Edge cases', () => {
  it('renders correctly at zero value', () => {
    const zeroProps = { ...BASE_PROPS, value: 0 };
    render(<GenericResourceBar {...zeroProps} />);
    const fill = screen.getByTestId('resource-bar-fill');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('renders correctly at max value', () => {
    const maxProps = { ...BASE_PROPS, value: 10 };
    render(<GenericResourceBar {...maxProps} />);
    const fill = screen.getByTestId('resource-bar-fill');
    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('clamps display at 0% when value is negative', () => {
    const negativeProps = { ...BASE_PROPS, value: -1 };
    render(<GenericResourceBar {...negativeProps} />);
    const fill = screen.getByTestId('resource-bar-fill');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('clamps display at 100% when value exceeds max', () => {
    const overProps = { ...BASE_PROPS, value: 15 };
    render(<GenericResourceBar {...overProps} />);
    const fill = screen.getByTestId('resource-bar-fill');
    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('renders with no thresholds defined', () => {
    const noThresholds: ResourceBarProps = {
      name: 'Stamina',
      value: 5,
      max: 10,
      genre_slug: 'low_fantasy',
      thresholds: [],
    };
    render(<GenericResourceBar {...noThresholds} />);
    expect(screen.getByTestId('resource-bar')).toBeInTheDocument();
    expect(screen.getByText('Stamina')).toBeInTheDocument();
  });

  it('handles max of 1 correctly', () => {
    const singlePoint: ResourceBarProps = {
      name: 'Last Chance',
      value: 1,
      max: 1,
      genre_slug: 'spaghetti_western',
      thresholds: [],
    };
    render(<GenericResourceBar {...singlePoint} />);
    const fill = screen.getByTestId('resource-bar-fill');
    expect(fill).toHaveStyle({ width: '100%' });
  });
});

// ═══════════════════════════════════════════════════════════
// AC10: Omitted thresholds — the board must NOT crash (playtest 2026-06-17)
//
// The PARTY_STATUS wire OMITS the `thresholds` key entirely when a pool
// declares none (ProtocolBase drops empty-default lists — Rust `is_empty`
// parity). pulp_noir's `heat` pool has no thresholds, so the UI received a
// pool object with `thresholds === undefined`, and `for (const t of
// thresholds)` threw `TypeError: thresholds is not iterable`, killing the
// whole GameBoard via the error boundary. `thresholds: []` (covered above)
// did NOT reproduce it — only the OMITTED case does. Guard the omitted case.
// ═══════════════════════════════════════════════════════════

describe('AC10: Omitted thresholds (wire omits empty list) must not crash', () => {
  // Mirror exactly what the deserialized PARTY_STATUS pool looks like when the
  // server omitted the empty `thresholds` list: the key is simply absent.
  const OMITTED: ResourceBarProps = {
    name: 'Heat',
    value: 3,
    max: 5,
    genre_slug: 'pulp_noir',
  };

  it('renders the bar when thresholds is omitted entirely', () => {
    render(<GenericResourceBar {...OMITTED} />);
    expect(screen.getByTestId('resource-bar')).toBeInTheDocument();
    expect(screen.getByText('Heat')).toBeInTheDocument();
    expect(screen.getByText(/3\s*\/\s*5/)).toBeInTheDocument();
  });

  it('renders no threshold markers when thresholds is omitted', () => {
    render(<GenericResourceBar {...OMITTED} />);
    expect(screen.queryAllByTestId('threshold-marker')).toHaveLength(0);
  });

  it('does not pulse or toast when thresholds is omitted', () => {
    render(<GenericResourceBar {...OMITTED} />);
    expect(screen.getByTestId('resource-bar')).not.toHaveClass('threshold-pulse');
    expect(screen.queryByTestId('threshold-toast')).not.toBeInTheDocument();
  });

  it('explicit undefined thresholds behaves like omitted (no crash)', () => {
    render(<GenericResourceBar {...OMITTED} thresholds={undefined} />);
    expect(screen.getByTestId('resource-bar')).toBeInTheDocument();
    expect(screen.queryAllByTestId('threshold-marker')).toHaveLength(0);
  });
});
