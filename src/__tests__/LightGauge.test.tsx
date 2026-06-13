import { render, screen } from "@testing-library/react";
import { LightGauge, CharacterPanel } from "../components/CharacterPanel";
import type { CharacterSheetData } from "../components/CharacterSheet";

test("renders pips for current/max light", () => {
  render(<LightGauge current={4} max={6} torchCharges={2} />);
  expect(screen.getByText(/Light 4\/6/)).toBeInTheDocument();
  expect(screen.getByText(/2 torch/i)).toBeInTheDocument();
});

test("shows the -2 affordance when dark", () => {
  render(<LightGauge current={0} max={6} torchCharges={1} />);
  expect(screen.getByText(/−2 in the dark/)).toBeInTheDocument();
});

test("no -2 affordance when lit", () => {
  render(<LightGauge current={3} max={6} torchCharges={1} />);
  expect(screen.queryByText(/−2 in the dark/)).not.toBeInTheDocument();
});

test("omits the torch readout when torchCharges is absent", () => {
  render(<LightGauge current={3} max={6} />);
  expect(screen.getByText(/Light 3\/6/)).toBeInTheDocument();
  expect(screen.queryByText(/torch/i)).not.toBeInTheDocument();
});

// Wiring test: the LightGauge must actually render inside CharacterPanel's
// Status tab when a "light" pool is present in `resources` — not just exist as
// an isolated unit. CharacterPanel persists its active tab in localStorage;
// seed it to "status" so the Status tabpanel mounts.
function minimalCharacter(): CharacterSheetData {
  return {
    name: "Delver",
    class: "scavenger",
    level: 1,
    stats: {},
    abilities: [],
  } as unknown as CharacterSheetData;
}

test("CharacterPanel renders the light gauge from resources.light in the Status tab", () => {
  window.localStorage.setItem(
    "sq-character-panel",
    JSON.stringify({ activeTab: "status" }),
  );
  render(
    <CharacterPanel
      character={minimalCharacter()}
      resources={{
        light: { value: 4, max: 6, thresholds: [] },
      }}
      genreSlug="caverns_and_claudes"
    />,
  );
  expect(screen.getByText(/Light 4\/6/)).toBeInTheDocument();
});
