import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StateTab } from "../tabs/StateTab";
import type {
  SessionStateView,
  NpcRegistryEntry,
  PlayerStateView,
  ItemView,
  TropeStateView,
} from "@/types/watcher";

// ---------------------------------------------------------------------------
// RED suite for story 124-4 — Inspector State tab, dark-Tufte treatment.
//
// Design source: docs/design-bundles/2026-06-16-tufte-inspector-state-tab/
//   - NPC registry: each NPC's Big-Five personality is a 5-bar OCEAN sparkline
//     fingerprint (small multiples), bound to the LIVE `ocean` dict.
//   - Tropes: a SORTED progression bar plot (highest progression first).
//   - Inventory: per-item narrative-weight BARS with named/evolved thresholds.
//   - Location/regions, character HP bullet bar, working search filter.
//
// No-fabrication rule (epic 124): every graphic binds to live SessionStateView.
// Where a field is absent, the tab renders "—"/nothing — it never invents data.
//
// These tests are written to FAIL against the current consumer-styled tab
// (text-only OCEAN summary, unsorted tropes, numeric-only weight). The current
// tab renders ZERO inline <svg> graphics, so the sparkline/bar assertions are
// cleanly RED until Dev implements the Tufte glyphs.
// ---------------------------------------------------------------------------

function ocean(o: number, c: number, e: number, a: number, n: number): Record<string, number> {
  return { openness: o, conscientiousness: c, extraversion: e, agreeableness: a, neuroticism: n };
}

function makeNpc(over: Partial<NpcRegistryEntry> = {}): NpcRegistryEntry {
  return {
    name: "Sister Veil",
    pronouns: "she/her",
    role: "oracle",
    location: "Sunken Cloister",
    last_seen_turn: 42,
    age: "ageless",
    appearance: "veiled",
    ocean_summary: null,
    ocean: ocean(8, 7, 3.5, 6.2, 4.8),
    hp: 18,
    max_hp: 18,
    ...over,
  };
}

function makeItem(over: Partial<ItemView> = {}): ItemView {
  return {
    id: over.name ?? over.id ?? "item-1",
    name: "Emberbrand Glaive",
    description: "A glaive wreathed in banked coals.",
    narrative_weight: 0.86,
    state: "attuned",
    source_turn: 3,
    tags: [],
    ...over,
  };
}

function makePlayer(over: Partial<PlayerStateView> = {}): PlayerStateView {
  return {
    player_name: "p1",
    character_name: "Kaelen Vire",
    character_class: "Warden",
    character_hp: 41,
    character_max_hp: 58,
    character_level: 7,
    character_xp: 12400,
    region_id: "sunken_cloister",
    display_location: "Sunken Cloister · Nave",
    inventory: { items: [], gold: 340 },
    ...over,
  };
}

function makeTrope(over: Partial<TropeStateView> = {}): TropeStateView {
  return { trope_definition_id: "broken_oath", status: "active", progression: 0.5, ...over };
}

function makeView(over: Partial<SessionStateView> = {}): SessionStateView {
  return {
    session_key: "fantasy/aetheria-reach",
    genre_slug: "fantasy",
    world_slug: "aetheria-reach",
    current_location: "The Sunken Cloister",
    discovered_regions: ["Ashfen Marsh", "Sunken Cloister", "Emberhold"],
    narration_history_len: 42,
    turn_mode: "turn-based",
    npc_registry: [],
    trope_states: [],
    players: [],
    player_count: 1,
    has_music_director: true,
    has_audio_mixer: true,
    region_names: [],
    last_activity_ts: 1000,
    ...over,
  };
}

const noop = () => {};

/** All <svg> in the tree that carry at least `n` <rect> bars. */
function svgsWithBars(container: HTMLElement, n: number): SVGSVGElement[] {
  return Array.from(container.querySelectorAll("svg")).filter(
    (svg) => svg.querySelectorAll("rect").length >= n,
  ) as SVGSVGElement[];
}

// ===========================================================================
// OCEAN 5-bar sparkline fingerprint — bound to the live `ocean` dict
// ===========================================================================

describe("StateTab Tufte — OCEAN sparkline fingerprint", () => {
  it("renders a 5-bar SVG glyph from the live `ocean` dict (not a text summary)", () => {
    const view = makeView({ npc_registry: [makeNpc({ ocean: ocean(8, 7, 3.5, 6.2, 4.8) })] });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    // The signature Tufte move: OCEAN becomes a graphic. A 5-bar glyph = one
    // bar per Big-Five dimension. The current text-only tab has no <svg>.
    const glyphs = svgsWithBars(container, 5);
    expect(glyphs.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps all 5 bars even when a dimension is exactly 0 (uses ?? not ||)", () => {
    // TS lang-review rule #4: `value || fallback` drops a legitimate 0.
    // A zeroed openness/extraversion must still draw its bar slot.
    const view = makeView({ npc_registry: [makeNpc({ ocean: ocean(0, 0, 0, 0, 5) })] });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    const glyphs = svgsWithBars(container, 5);
    expect(glyphs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the glyph from `ocean` even when the dead `ocean_summary` is null", () => {
    // Production always sends ocean_summary=None (rest.py:495); the data lives
    // in `ocean`. The tab must read `ocean`, not the dead summary field.
    const view = makeView({
      npc_registry: [makeNpc({ ocean: ocean(9, 6, 7, 2, 8), ocean_summary: null })],
    });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(svgsWithBars(container, 5).length).toBeGreaterThanOrEqual(1);
  });

  it("degrades to a placeholder (no fabricated glyph) when `ocean` is absent", () => {
    // Identity-only pool members carry ocean=null. No-fabrication: show "—",
    // never invent a personality fingerprint.
    const view = makeView({
      npc_registry: [
        makeNpc({ name: "Marya the Drawn", ocean: undefined, ocean_summary: null }),
      ],
      // nothing else graphical in the tree, so any 5-bar svg would be a bug
    });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(svgsWithBars(container, 5).length).toBe(0);
    expect(screen.getByText("Marya the Drawn")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("exposes the five OCEAN values to assistive tech (accessible name on the glyph)", () => {
    const view = makeView({ npc_registry: [makeNpc({ ocean: ocean(8, 7, 3.5, 6.2, 4.8) })] });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    const glyph = svgsWithBars(container, 5)[0];
    expect(glyph).toBeTruthy();
    // A bare bar-chart svg is opaque to a screen reader (and to a maintainer).
    // The glyph must carry an accessible name: aria-label or a <title>.
    const accessibleName =
      glyph.getAttribute("aria-label") ??
      glyph.querySelector("title")?.textContent ??
      "";
    expect(accessibleName.length).toBeGreaterThan(0);
    expect(accessibleName.toLowerCase()).toContain("ocean");
  });
});

// ===========================================================================
// Tropes — SORTED progression bar plot
// ===========================================================================

describe("StateTab Tufte — tropes progression bar plot", () => {
  it("sorts tropes by progression, highest first (regardless of input order)", () => {
    const view = makeView({
      trope_states: [
        makeTrope({ trope_definition_id: "lost_heir", progression: 0.3, status: "dormant" }),
        makeTrope({ trope_definition_id: "reluctant_hero", progression: 0.88, status: "active" }),
        makeTrope({ trope_definition_id: "mentor_betrayal", progression: 0.62, status: "active" }),
      ],
    });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    const text = container.textContent ?? "";
    const iHero = text.indexOf("reluctant_hero");
    const iMentor = text.indexOf("mentor_betrayal");
    const iHeir = text.indexOf("lost_heir");
    expect(iHero).toBeGreaterThanOrEqual(0);
    expect(iMentor).toBeGreaterThan(iHero); // 0.62 after 0.88
    expect(iHeir).toBeGreaterThan(iMentor); // 0.30 last
  });

  it("shows each trope's progression value and status", () => {
    const view = makeView({
      trope_states: [
        makeTrope({ trope_definition_id: "reluctant_hero", progression: 0.88, status: "active" }),
      ],
    });
    render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(screen.getByText(/reluctant_hero/)).toBeInTheDocument();
    expect(screen.getByText(/0\.88/)).toBeInTheDocument();
    expect(screen.getByText(/active/)).toBeInTheDocument();
  });

  it("renders the progression as an inline bar graphic, not just a number", () => {
    const view = makeView({
      // one trope, no NPC ocean, no items → the only bar graphic is the trope's
      trope_states: [makeTrope({ trope_definition_id: "broken_oath", progression: 0.45 })],
    });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(svgsWithBars(container, 1).length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// Inventory — narrative-weight bars with named/evolved thresholds
// ===========================================================================

describe("StateTab Tufte — inventory narrative-weight bars", () => {
  it("labels item stages by narrative-weight threshold (evolved ≥0.7, named ≥0.5, else unnamed)", () => {
    const view = makeView({
      players: [
        makePlayer({
          inventory: {
            gold: 0,
            items: [
              makeItem({ id: "i1", name: "Emberbrand Glaive", narrative_weight: 0.86 }),
              makeItem({ id: "i2", name: "Warden's Sigil", narrative_weight: 0.58 }),
              makeItem({ id: "i3", name: "Frayed rope", narrative_weight: 0.08 }),
            ],
          },
        }),
      ],
    });
    render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(screen.getByText("evolved")).toBeInTheDocument();
    expect(screen.getByText("named")).toBeInTheDocument();
    expect(screen.getByText("unnamed")).toBeInTheDocument();
  });

  it("renders narrative weight as an inline bar graphic per item", () => {
    const view = makeView({
      // single item, no ocean, no tropes → the only bar graphic is the weight bar
      npc_registry: [],
      players: [
        makePlayer({
          inventory: { gold: 0, items: [makeItem({ id: "i1", name: "Lone Relic", narrative_weight: 0.71 })] },
        }),
      ],
    });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(svgsWithBars(container, 1).length).toBeGreaterThanOrEqual(1);
  });

  it("renders nothing fabricated when inventory is empty (no-fabrication)", () => {
    const view = makeView({ players: [makePlayer({ inventory: { gold: 0, items: [] } })] });
    render(<StateTab debugState={[view]} onRefresh={noop} />);

    // None of the stage labels should appear with no items present.
    expect(screen.queryByText("evolved")).not.toBeInTheDocument();
    expect(screen.queryByText("named")).not.toBeInTheDocument();
    expect(screen.queryByText("unnamed")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Character HP bullet bar + location / regions
// ===========================================================================

describe("StateTab Tufte — character + location", () => {
  it("shows the character HP value and a bullet-bar graphic", () => {
    const view = makeView({
      npc_registry: [],
      players: [makePlayer({ character_hp: 41, character_max_hp: 58 })],
    });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(screen.getByText(/41\/58/)).toBeInTheDocument();
    expect(svgsWithBars(container, 1).length).toBeGreaterThanOrEqual(1);
  });

  it("direct-labels the current location and every discovered region", () => {
    const view = makeView({
      current_location: "The Sunken Cloister",
      discovered_regions: ["Ashfen Marsh", "Emberhold"],
    });
    render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(screen.getByText(/The Sunken Cloister/)).toBeInTheDocument();
    expect(screen.getByText(/Ashfen Marsh/)).toBeInTheDocument();
    expect(screen.getByText(/Emberhold/)).toBeInTheDocument();
  });
});

// ===========================================================================
// Search filter — over NPCs and items
// ===========================================================================

describe("StateTab Tufte — search filter", () => {
  it("filters the NPC registry by name/role/location", () => {
    const view = makeView({
      npc_registry: [
        makeNpc({ name: "Sister Veil", role: "oracle" }),
        makeNpc({ name: "Brakka Stonejaw", role: "smith", location: "Emberhold" }),
      ],
    });
    render(<StateTab debugState={[view]} onRefresh={noop} />);

    const search = screen.getByPlaceholderText(/filter/i);
    fireEvent.change(search, { target: { value: "veil" } });

    expect(screen.getByText("Sister Veil")).toBeInTheDocument();
    expect(screen.queryByText("Brakka Stonejaw")).not.toBeInTheDocument();
  });

  it("filters inventory items by name", () => {
    const view = makeView({
      npc_registry: [],
      players: [
        makePlayer({
          inventory: {
            gold: 0,
            items: [
              makeItem({ id: "i1", name: "Emberbrand Glaive" }),
              makeItem({ id: "i2", name: "Frayed rope" }),
            ],
          },
        }),
      ],
    });
    render(<StateTab debugState={[view]} onRefresh={noop} />);

    const search = screen.getByPlaceholderText(/filter/i);
    fireEvent.change(search, { target: { value: "glaive" } });

    expect(screen.getByText("Emberbrand Glaive")).toBeInTheDocument();
    expect(screen.queryByText("Frayed rope")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Wiring / contract — the tab is a faithful consumer of the live shape
// ===========================================================================

describe("StateTab Tufte — live SessionStateView contract (wiring)", () => {
  it("renders every section from a single live-shaped view object", () => {
    // One realistic /api/debug/state payload exercising every section. This is
    // the wiring test: the tab is reachable from DashboardApp:148 with exactly
    // this shape, and must consume the previously-dead fields (ocean, tropes,
    // narrative_weight) — not just the always-present scalars.
    const view = makeView({
      npc_registry: [makeNpc({ name: "Sister Veil", ocean: ocean(8, 7, 3.5, 6.2, 4.8) })],
      trope_states: [makeTrope({ trope_definition_id: "broken_oath", progression: 0.62 })],
      players: [
        makePlayer({
          inventory: { gold: 340, items: [makeItem({ id: "i1", name: "Emberbrand Glaive", narrative_weight: 0.86 })] },
        }),
      ],
    });
    const { container } = render(<StateTab debugState={[view]} onRefresh={noop} />);

    expect(screen.getByText(/The Sunken Cloister/)).toBeInTheDocument(); // location
    expect(screen.getByText(/Ashfen Marsh/)).toBeInTheDocument(); // region
    expect(screen.getByText(/Kaelen Vire/)).toBeInTheDocument(); // character (combined title string)
    expect(screen.getByText("Emberbrand Glaive")).toBeInTheDocument(); // inventory item
    expect(screen.getByText("Sister Veil")).toBeInTheDocument(); // npc
    expect(screen.getByText(/broken_oath/)).toBeInTheDocument(); // trope
    // and the two graphical proofs that the dead fields are now bound:
    expect(svgsWithBars(container, 5).length).toBeGreaterThanOrEqual(1); // ocean glyph
  });

  it("shows the empty-state prompt when there are no sessions", () => {
    const onRefresh = vi.fn();
    render(<StateTab debugState={[]} onRefresh={onRefresh} />);
    expect(screen.getByText(/no active sessions/i)).toBeInTheDocument();
  });
});
