import { render, screen } from "@testing-library/react";
import { LightGauge, CharacterPanel } from "../components/CharacterPanel";
import type { ResourcePool } from "../components/CharacterPanel";
import type { CharacterSheetData } from "../components/CharacterSheet";
import type {
  PartyStatusPayload,
  ResourcePoolPayload,
} from "../types/payloads";

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

// ---------------------------------------------------------------------------
// Wire→gauge flow test (2026-06-13 producer/consumer wiring fix).
//
// The bug this guards: the server's PartyStatusPayload had no `resources`
// field, and the UI's CharacterPanel reads `pool.value`/`pool.max`. The old
// wire ResourcePoolPayload used `current` (never read), so even if the server
// had projected pools the gauge would have rendered "Light undefined/6". This
// test drives a *real* PartyStatusPayload (typed ResourcePoolPayload, server
// `value` field) through App.tsx's exact extraction logic into CharacterPanel,
// proving the projected field names reach LightGauge end-to-end.
//
// It would have FAILED before the fix: with the old wire shape `{current}`,
// the typed extraction yields `value: undefined` → "Light undefined/6".

// Mirror App.tsx's PARTY_STATUS resources handler (App.tsx ~1126): the wire
// payload is cast to Record<string, ResourcePoolPayload> and handed straight
// to CharacterPanel's `resources` prop (ResourcePoolPayload is structurally a
// ResourcePool — value/max/thresholds).
function extractResourcesLikeApp(
  payload: PartyStatusPayload,
): Record<string, ResourcePool> {
  const resources = payload.resources as
    | Record<string, ResourcePoolPayload>
    | undefined;
  return resources && typeof resources === "object" ? resources : {};
}

test("PARTY_STATUS resources.light flows through App handling into the gauge", () => {
  window.localStorage.setItem(
    "sq-character-panel",
    JSON.stringify({ activeTab: "status" }),
  );

  // A PARTY_STATUS payload exactly as the server now projects it (views.py
  // build_session_start_party_status → ResourcePoolPayload with `value`).
  const payload: PartyStatusPayload = {
    members: [],
    resources: {
      light: {
        name: "light",
        label: "Light",
        value: 4,
        min: 0,
        max: 6,
        voluntary: false,
        thresholds: [],
      },
    },
  };

  const partyResources = extractResourcesLikeApp(payload);

  render(
    <CharacterPanel
      character={minimalCharacter()}
      resources={partyResources}
      genreSlug="caverns_and_claudes"
    />,
  );

  // The server `value` field reached LightGauge — not "Light undefined/6".
  expect(screen.getByText(/Light 4\/6/)).toBeInTheDocument();
  expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
});

test("PARTY_STATUS resources.light at 0 renders the −2-in-the-dark affordance", () => {
  window.localStorage.setItem(
    "sq-character-panel",
    JSON.stringify({ activeTab: "status" }),
  );

  const payload: PartyStatusPayload = {
    members: [],
    resources: {
      light: {
        name: "light",
        label: "Light",
        value: 0,
        min: 0,
        max: 6,
        voluntary: false,
        thresholds: [],
      },
    },
  };

  render(
    <CharacterPanel
      character={minimalCharacter()}
      resources={extractResourcesLikeApp(payload)}
      genreSlug="caverns_and_claudes"
    />,
  );

  expect(screen.getByText(/Light 0\/6/)).toBeInTheDocument();
  expect(screen.getByText(/−2 in the dark/)).toBeInTheDocument();
});
