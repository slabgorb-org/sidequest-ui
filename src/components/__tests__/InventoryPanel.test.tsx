import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { InventoryPanel } from '../InventoryPanel';

const BASE_INVENTORY = {
  items: [
    { name: 'Elven Longbow', type: 'weapon', equipped: true, description: 'A finely crafted bow.' },
    { name: 'Healing Potion', type: 'consumable', quantity: 3, description: 'Restores health.' },
    { name: 'Iron Shield', type: 'armor', equipped: false, description: 'A sturdy shield.' },
  ],
  gold: 42,
};

describe('InventoryPanel', () => {
  it('renders all item names', () => {
    render(<InventoryPanel data={BASE_INVENTORY} />);
    expect(screen.getByText('Elven Longbow')).toBeInTheDocument();
    expect(screen.getByText('Healing Potion')).toBeInTheDocument();
    expect(screen.getByText('Iron Shield')).toBeInTheDocument();
  });

  it('shows equipped state for weapons/armor', () => {
    render(<InventoryPanel data={BASE_INVENTORY} />);
    // Equipped items should have a visual indicator
    const bow = screen.getByText('Elven Longbow').closest('[data-testid]');
    expect(bow).toHaveAttribute('data-equipped', 'true');

    const shield = screen.getByText('Iron Shield').closest('[data-testid]');
    expect(shield).toHaveAttribute('data-equipped', 'false');
  });

  it('shows quantity for consumables', () => {
    render(<InventoryPanel data={BASE_INVENTORY} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('displays gold amount', () => {
    render(<InventoryPanel data={BASE_INVENTORY} />);
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('renders the genre-declared currency noun when present', () => {
    // Pingpong 2026-04-24 "500 gold in Space Opera" — server emits
    // ``currency_name`` on the inventory payload from the active pack's
    // inventory.yaml (e.g. "credits" for space_opera, "Salvage" for
    // mutant_wasteland). UI must render that noun, not the hardcoded
    // fantasy word "gold".
    render(
      <InventoryPanel
        data={{ items: [], gold: 500, currency_name: 'credits' }}
      />,
    );
    expect(screen.getByText(/500 credits/)).toBeInTheDocument();
    // Defensive: no leftover "gold" label on a non-fantasy pack.
    expect(screen.queryByText(/gold/)).not.toBeInTheDocument();
  });

  it('falls back to "coin" when the payload omits currency_name', () => {
    // Legacy pre-fix servers won't send currency_name — the UI must
    // render a neutral "coin" fallback rather than the former hardcoded
    // "gold" (which leaked fantasy tone into every genre). "coin" is
    // deliberately genre-agnostic.
    render(<InventoryPanel data={{ items: [], gold: 5 }} />);
    expect(screen.getByText(/5 coin/)).toBeInTheDocument();
    expect(screen.queryByText(/gold/)).not.toBeInTheDocument();
  });

  it('renders with empty items list', () => {
    render(<InventoryPanel data={{ items: [], gold: 0 }} />);
    expect(screen.getByTestId('inventory-panel')).toBeInTheDocument();
  });

  it('shows empty-state copy instead of a blank panel when there are no items', () => {
    // sq-playtest 2026-06-19 (pulp_noir/annees_folles): a new PC's Inventory tab
    // rendered just the "Inventory" header over blank space, reading as broken.
    // Keith: "presenting a blank screen is wrong regardless." There must be
    // explicit copy that reads as intentional.
    render(<InventoryPanel data={{ items: [], gold: 0 }} />);
    expect(screen.getByTestId('inventory-empty')).toBeInTheDocument();
    expect(screen.getByText(/Nothing in your pockets yet/i)).toBeInTheDocument();
  });

  it('explains the empty inventory for Fate (aspects, not carried items) when showCurrency is false', () => {
    // Under Fate signature gear is compiled into the FateSheet as aspects, so a
    // Fate inventory is LEGITIMATELY empty much of the time. showCurrency=false is
    // the no-economy signal the GameBoard passes only for Fate packs — when it is
    // set, the empty state explains *why* it's empty so it doesn't read as broken.
    render(<InventoryPanel data={{ items: [], gold: 0 }} showCurrency={false} />);
    expect(screen.getByTestId('inventory-empty')).toBeInTheDocument();
    expect(screen.getByText(/lives in your aspects/i)).toBeInTheDocument();
  });

  it('omits the Fate aspects hint for a native (economy) pack with an empty inventory', () => {
    // The aspects hint is Fate-specific; a native pack (showCurrency default true)
    // shows the generic empty-state line only — no aspects framing.
    render(<InventoryPanel data={{ items: [], gold: 0, currency_name: 'credits' }} />);
    expect(screen.getByText(/Nothing in your pockets yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/aspects/i)).not.toBeInTheDocument();
  });

  it('does NOT show empty-state copy when the inventory has items', () => {
    render(<InventoryPanel data={BASE_INVENTORY} />);
    expect(screen.queryByTestId('inventory-empty')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing in your pockets yet/i)).not.toBeInTheDocument();
  });

  it('suppresses the currency/gold line when showCurrency is false (Fate has no economy)', () => {
    // sq-playtest 2026-06-17 (wry_whimsy/oz): a Fate PC's inventory must show
    // the carried items (silver shoes) WITHOUT the native-ruleset money line —
    // Fate has no economy, so "0 coin" is meaningless native framing. The items
    // still render; only the currency span is gated.
    render(
      <InventoryPanel
        data={{ items: [{ name: 'Silver Shoes', type: 'gear', description: 'Charmed.' }], gold: 0 }}
        showCurrency={false}
      />,
    );
    expect(screen.getByText('Silver Shoes')).toBeInTheDocument();
    expect(screen.queryByText(/coin/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('inventory-currency')).not.toBeInTheDocument();
  });

  it('shows the currency line by default (native packs with an economy are unchanged)', () => {
    render(<InventoryPanel data={{ items: [], gold: 7, currency_name: 'credits' }} />);
    expect(screen.getByTestId('inventory-currency')).toBeInTheDocument();
    expect(screen.getByText(/7 credits/)).toBeInTheDocument();
  });

  it('renders item descriptions', () => {
    render(<InventoryPanel data={BASE_INVENTORY} />);
    expect(screen.getByText(/A finely crafted bow/)).toBeInTheDocument();
  });

  it('groups items by type', () => {
    render(<InventoryPanel data={BASE_INVENTORY} />);
    // Weapons, consumables, and armor should be distinguishable
    expect(screen.getByText(/weapon/i)).toBeInTheDocument();
    expect(screen.getByText(/consumable/i)).toBeInTheDocument();
  });

  it('has a root element with data-testid', () => {
    render(<InventoryPanel data={BASE_INVENTORY} />);
    expect(screen.getByTestId('inventory-panel')).toBeInTheDocument();
  });

  it('shows "Equipped" badge (not "Equip") on equipped items', () => {
    // BUG-LOW: the badge was labeled "Equip" which reads as a CTA implying the
    // item is NOT equipped. The correct status label is "Equipped".
    render(<InventoryPanel data={BASE_INVENTORY} />);
    // Equipped item: badge must say "Equipped"
    expect(screen.getByText('Equipped')).toBeInTheDocument();
    // Must NOT say "Equip" (the old mislabeled string)
    expect(screen.queryByText('Equip')).not.toBeInTheDocument();
    // Non-equipped item: no badge at all
    const shield = screen.getByText('Iron Shield').closest('li');
    expect(shield?.textContent).not.toMatch(/Equipped/);
  });

  it('handles items without quantity field', () => {
    const data = {
      items: [{ name: 'Sword', type: 'weapon', equipped: true, description: 'Sharp.' }],
      gold: 10,
    };
    render(<InventoryPanel data={data} />);
    expect(screen.getByText('Sword')).toBeInTheDocument();
  });
});
