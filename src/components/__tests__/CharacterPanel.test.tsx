import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { CharacterPanel } from "../CharacterPanel";
import type { CharacterSheetData, AbilityDefinition } from "../CharacterSheet";

const makeAbility = (name: string): AbilityDefinition => ({
  name,
  genre_description: `${name} description.`,
  mechanical_effect: `${name} effect.`,
  involuntary: false,
  source: "Class",
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CHARACTER: CharacterSheetData = {
  name: "Kael",
  class: "Ranger",
  race: "Wood Elf",
  level: 3,
  stats: {
    strength: 14,
    dexterity: 18,
    constitution: 12,
    intelligence: 10,
    wisdom: 15,
    charisma: 8,
  },
  abilities: [makeAbility("Tracker"), makeAbility("Beast Companion")],
  class_moves: [],
  backstory: "Born in the Ashwood, raised by wolves.",
  portrait_url: "/renders/kael.png",
  current_location: "The Rusty Cantina",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clear localStorage before each test to avoid prefs leaking between tests. */
beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// AC-1: CharacterPanel renders as a persistent sidebar (not a modal)
// ---------------------------------------------------------------------------

describe("CharacterPanel — AC-1: persistent sidebar", () => {
  it("renders with data-testid character-panel", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByTestId("character-panel")).toBeInTheDocument();
  });

  it("is visible immediately without any user interaction", () => {
    render(<CharacterPanel character={CHARACTER} />);
    const panel = screen.getByTestId("character-panel");
    expect(panel).toBeVisible();
  });

  it("does NOT render as a modal or overlay (no backdrop)", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.queryByTestId("overlay-backdrop")).not.toBeInTheDocument();
  });

  it("displays character name and class prominently", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByText("Kael")).toBeInTheDocument();
    expect(screen.getByText(/Ranger/)).toBeInTheDocument();
  });

  it("displays character portrait when available", () => {
    render(<CharacterPanel character={CHARACTER} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/renders/kael.png");
  });

  it("renders gracefully without portrait", () => {
    const noPortrait = { ...CHARACTER, portrait_url: undefined };
    render(<CharacterPanel character={noPortrait} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Kael")).toBeInTheDocument();
  });

  it("renders portrait placeholder with initials when no portrait_url", () => {
    const noPortrait = { ...CHARACTER, portrait_url: undefined };
    render(<CharacterPanel character={noPortrait} />);
    const placeholder = screen.getByTestId("character-portrait-placeholder");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(placeholder).toHaveTextContent("K");
  });

  it("does not render placeholder when portrait_url is present", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(
      screen.queryByTestId("character-portrait-placeholder"),
    ).not.toBeInTheDocument();
  });

  it("does NOT display per-character location (single source of truth is the top header)", () => {
    render(<CharacterPanel character={CHARACTER} />);
    // The character.current_location field is set once at chargen and was
    // never updated as the player moved, leading to stale location displays.
    // The top-level location header is now the single source of truth.
    expect(screen.queryByText("The Rusty Cantina")).not.toBeInTheDocument();
  });

  it("renders level", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-1b (33-7): Enriched character header — portrait · name · subtitle · level badge
// ---------------------------------------------------------------------------

describe("CharacterPanel — 33-7: enriched header", () => {
  it("renders a character-header row with portrait, subtitle, and level badge", () => {
    render(<CharacterPanel character={CHARACTER} genreSlug="low_fantasy" />);
    // Query by role/testid rather than child count — protects the semantic
    // contract (three meaningful elements) without coupling to DOM structure.
    expect(screen.getByTestId("character-header")).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Kael" })).toBeInTheDocument();
    expect(screen.getByTestId("character-subtitle")).toBeInTheDocument();
    expect(screen.getByTestId("character-level-badge")).toBeInTheDocument();
  });

  it("level badge shows exactly 'Lv N' as a compact chip", () => {
    render(<CharacterPanel character={CHARACTER} />);
    const badge = screen.getByTestId("character-level-badge");
    expect(badge).toBeInTheDocument();
    // Exact match: substring would let "Lv 3000" or "Lv 3 ★" pass incorrectly.
    expect(badge).toHaveTextContent(/^Lv 3$/);
  });

  it("placeholder renders two-character initials for a two-word name", () => {
    const twoWord = { ...CHARACTER, name: "Lyra Dawnforge", portrait_url: undefined };
    render(<CharacterPanel character={twoWord} />);
    const placeholder = screen.getByTestId("character-portrait-placeholder");
    expect(placeholder).toHaveTextContent(/^LD$/);
  });

  // Playtest 2026-04-23: subtitle is class · race (character identity), NOT
  // class · genre (rulebook). Showing the genre slug here ("Beastkin · Mutant
  // Wasteland") conflated two separate concepts and confused the user.
  it("subtitle combines class and race display names with ·", () => {
    render(<CharacterPanel character={CHARACTER} genreSlug="mutant_wasteland" />);
    expect(screen.getByText(/Ranger · Wood Elf/)).toBeInTheDocument();
  });

  it("subtitle falls back to class-only when race is absent", () => {
    const { race: _race, ...withoutRace } = CHARACTER;
    render(<CharacterPanel character={withoutRace} genreSlug="mutant_wasteland" />);
    // Even with a genreSlug present, the subtitle must NOT include genre.
    const subtitle = screen.getByTestId("character-subtitle");
    expect(subtitle.textContent).toBe("Ranger");
    expect(subtitle.textContent).not.toContain("·");
    expect(subtitle.textContent).not.toMatch(/Mutant|Wasteland/);
  });

  it("portrait slot is 48px (w-12 h-12) for both img and placeholder", () => {
    const { rerender } = render(<CharacterPanel character={CHARACTER} />);
    const img = screen.getByRole("img");
    expect(img.className).toContain("w-12");
    expect(img.className).toContain("h-12");
    expect(img.className).toContain("rounded-full");

    rerender(
      <CharacterPanel character={{ ...CHARACTER, portrait_url: undefined }} />,
    );
    const placeholder = screen.getByTestId("character-portrait-placeholder");
    expect(placeholder.className).toContain("w-12");
    expect(placeholder.className).toContain("h-12");
    expect(placeholder.className).toContain("rounded-full");
  });

  it("name uses accent color (var --primary) and truncates", () => {
    render(<CharacterPanel character={CHARACTER} />);
    const name = screen.getByRole("heading", { level: 2, name: "Kael" });
    expect(name.className).toContain("text-[var(--primary)]");
    expect(name.className).toContain("truncate");
  });
});

// ---------------------------------------------------------------------------
// AC-2: Tabbed sections for character info
// ---------------------------------------------------------------------------

describe("CharacterPanel — AC-2: tabbed sections", () => {
  it("renders tab buttons for Stats and Abilities", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByRole("tab", { name: /stats/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /abilities/i })).toBeInTheDocument();
  });

  it("does NOT render a Backstory subtab — backstory lives in the top-level Lore panel", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.queryByRole("tab", { name: /backstory/i })).not.toBeInTheDocument();
  });

  it("shows Stats tab content by default", () => {
    render(<CharacterPanel character={CHARACTER} />);
    const tabpanel = screen.getByRole("tabpanel");
    // Stats tab should show stat names and values
    expect(within(tabpanel).getByText(/strength/i)).toBeInTheDocument();
    expect(within(tabpanel).getByText("14")).toBeInTheDocument();
  });

  it("switches to Abilities tab on click", () => {
    render(<CharacterPanel character={CHARACTER} />);
    fireEvent.click(screen.getByRole("tab", { name: /abilities/i }));
    const tabpanel = screen.getByRole("tabpanel");
    expect(within(tabpanel).getByText("Tracker")).toBeInTheDocument();
    expect(within(tabpanel).getByText("Beast Companion")).toBeInTheDocument();
  });

  it("marks the active tab with aria-selected", () => {
    render(<CharacterPanel character={CHARACTER} />);
    const statsTab = screen.getByRole("tab", { name: /stats/i });
    expect(statsTab).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /abilities/i }));
    expect(statsTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /abilities/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does NOT render an Inventory subtab — inventory has its own top-level panel", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.queryByRole("tab", { name: /inventory/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-3: Tab persistence via useLocalPrefs
// ---------------------------------------------------------------------------

describe("CharacterPanel — AC-3: tab persistence", () => {
  it("persists selected tab to localStorage", () => {
    render(<CharacterPanel character={CHARACTER} />);
    fireEvent.click(screen.getByRole("tab", { name: /abilities/i }));

    const stored = localStorage.getItem("sq-character-panel");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.activeTab).toBe("abilities");
  });

  it("restores previously selected tab from localStorage on mount", () => {
    localStorage.setItem(
      "sq-character-panel",
      JSON.stringify({ activeTab: "abilities" }),
    );
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByRole("tab", { name: /abilities/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("falls back to Stats when localStorage has a stale tab id (e.g. removed Backstory)", () => {
    localStorage.setItem(
      "sq-character-panel",
      JSON.stringify({ activeTab: "backstory" }),
    );
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByRole("tab", { name: /stats/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("falls back to Stats when localStorage has invalid data", () => {
    localStorage.setItem("sq-character-panel", "not-json");
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByRole("tab", { name: /stats/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

// ---------------------------------------------------------------------------
// AC-4: Sidebar is always visible (no collapse) with resize handle
// ---------------------------------------------------------------------------

describe("CharacterPanel — AC-4: always visible with resize", () => {
  it("does NOT render a collapse toggle button", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.queryByTestId("panel-collapse-toggle")).not.toBeInTheDocument();
  });

  it("always shows tab content (no collapsed state)", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("renders as a flexible panel (no fixed width)", () => {
    render(<CharacterPanel character={CHARACTER} />);
    const panel = screen.getByTestId("character-panel");
    expect(panel.style.width).toBe("");
  });
});

// ---------------------------------------------------------------------------
// AC-5: Handles empty/missing data gracefully
// ---------------------------------------------------------------------------

describe("CharacterPanel — AC-5: edge cases", () => {
  it("renders with empty stats", () => {
    const data = { ...CHARACTER, stats: {} };
    render(<CharacterPanel character={data} />);
    expect(screen.getByText("Kael")).toBeInTheDocument();
  });

  it("renders with empty abilities", () => {
    const data = { ...CHARACTER, abilities: [] };
    render(<CharacterPanel character={data} />);
    expect(screen.getByText("Kael")).toBeInTheDocument();
  });

  it("renders with no location", () => {
    const data = { ...CHARACTER, current_location: undefined };
    render(<CharacterPanel character={data} />);
    expect(screen.getByText("Kael")).toBeInTheDocument();
    expect(screen.queryByText("The Rusty Cantina")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-6: Integrated party list
// ---------------------------------------------------------------------------

describe("CharacterPanel — AC-6: integrated party list", () => {
  const PARTY = [
    {
      player_id: "p1",
      name: "Kael",
      character_name: "Kael",
      portrait_url: "/renders/kael.png",
      hp: 24,
      hp_max: 30,
      status_effects: ["poisoned"],
      class: "Ranger",
      level: 3,
      current_location: "The Rusty Cantina",
    },
    {
      player_id: "p2",
      name: "Lyra",
      character_name: "Lyra Dawnforge",
      portrait_url: "",
      hp: 8,
      hp_max: 40,
      status_effects: [],
      class: "Cleric",
      level: 5,
      current_location: "The Rusty Cantina",
    },
  ];

  it("renders a party section when characters are provided", () => {
    render(<CharacterPanel character={CHARACTER} characters={PARTY} />);
    expect(screen.getByTestId("party-section")).toBeInTheDocument();
  });

  it("renders a card for each party member", () => {
    render(<CharacterPanel character={CHARACTER} characters={PARTY} />);
    expect(screen.getByTestId("party-member-p1")).toBeInTheDocument();
    expect(screen.getByTestId("party-member-p2")).toBeInTheDocument();
  });

  it("does not render party section when no characters", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.queryByTestId("party-section")).not.toBeInTheDocument();
  });

  it("does not render party section when characters array is empty", () => {
    render(<CharacterPanel character={CHARACTER} characters={[]} />);
    expect(screen.queryByTestId("party-section")).not.toBeInTheDocument();
  });

  it("renders inline HP per party row sourced from CharacterSummary.hp/hp_max", () => {
    // ADR-114 (ablative HP substrate): this pool IS the character's HP — the
    // engine logs hp=N/M — and the UI label must read "HP". (This is the
    // survivability pool, distinct from the confrontation Edge dual-dial.)
    render(<CharacterPanel character={CHARACTER} characters={PARTY} />);
    // Kael at 24/30 — full opacity tone
    const kaelEdge = screen.getByTestId("party-member-edge-p1");
    expect(kaelEdge).toHaveTextContent("HP 24/30");
    // Lyra at 8/40 = 20% — at or below the 25% threshold, should show
    // destructive tone class for at-a-glance "one push from down" signal.
    const lyraEdge = screen.getByTestId("party-member-edge-p2");
    expect(lyraEdge).toHaveTextContent("HP 8/40");
    expect(lyraEdge.className).toMatch(/destructive/);
  });

  it("renders no stale 'Edge N/M' text in any party row (ADR-114 schema lock)", () => {
    render(<CharacterPanel character={CHARACTER} characters={PARTY} />);
    const partySection = screen.getByTestId("party-section");
    // Lock the rename: a stray "Edge " prefix on a number/number row would
    // mean someone re-introduced the pre-ADR-114 survivability label.
    expect(partySection.textContent ?? "").not.toMatch(/\bEdge\s*\d+\s*\/\s*\d+/);
  });

  it("hides inline HP for genres that don't model the pool (both 0)", () => {
    const NO_EDGE_PARTY = [
      {
        ...PARTY[0],
        player_id: "p3",
        hp: 0,
        hp_max: 0,
      },
    ];
    render(<CharacterPanel character={CHARACTER} characters={NO_EDGE_PARTY} />);
    expect(screen.queryByTestId("party-member-edge-p3")).not.toBeInTheDocument();
    // Old testid must also be gone (catches a partial rename).
    expect(screen.queryByTestId("party-member-hp-p3")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// S2-UX (a, b): YOU/ACTING badges legible + non-acting peers show Waiting
// ---------------------------------------------------------------------------

describe("CharacterPanel — S2-UX: turn-state badges are legible and unambiguous", () => {
  const PARTY = [
    {
      player_id: "p1",
      name: "Kael",
      character_name: "Kael",
      portrait_url: "/renders/kael.png",
      hp: 24,
      hp_max: 30,
      status_effects: [],
      class: "Ranger",
      level: 3,
      current_location: "The Rusty Cantina",
    },
    {
      player_id: "p2",
      name: "Lyra",
      character_name: "Lyra Dawnforge",
      portrait_url: "",
      hp: 30,
      hp_max: 40,
      status_effects: [],
      class: "Cleric",
      level: 5,
      current_location: "The Rusty Cantina",
    },
    {
      player_id: "p3",
      name: "Thane",
      character_name: "Thane",
      portrait_url: "",
      hp: 15,
      hp_max: 28,
      status_effects: [],
      class: "Fighter",
      level: 4,
      current_location: "The Rusty Cantina",
    },
  ];

  it("renders YOU badge on the local player party row", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
      />,
    );
    const youBadge = screen.getByTestId("party-member-you-badge-p1");
    expect(youBadge).toBeInTheDocument();
    expect(youBadge).toHaveTextContent("(YOU)");
  });

  it("renders ACTING badge with a pulse dot on the active player row", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
        activePlayerId="p2"
      />,
    );
    const actingBadge = screen.getByTestId("party-member-acting-badge-p2");
    expect(actingBadge).toBeInTheDocument();
    // Verb chain unified to Composing → Sealed → Resolving (sq-playtest
    // 2026-05-27): the active-player badge reads "Composing", not "ACTING".
    expect(actingBadge).toHaveTextContent(/Composing/);
    // The pulse dot is the kinetic signal Alex needs to see at a glance
    // that someone is mid-turn (per S2-UX (b)).
    expect(within(actingBadge).getByTestId("party-member-acting-pulse-p2")).toBeInTheDocument();
  });

  it("ACTING pulse uses animate-pulse so it draws the eye", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
        activePlayerId="p2"
      />,
    );
    const pulse = screen.getByTestId("party-member-acting-pulse-p2");
    expect(pulse.className).toMatch(/animate-pulse/);
  });

  it("ACTING badge is bumped from text-[10px] (the prior undersized class) to text-[11px]", () => {
    // Regression guard for S2-UX (a) — badge was text-[10px], hard to spot.
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
        activePlayerId="p1"
      />,
    );
    const actingBadge = screen.getByTestId("party-member-acting-badge-p1");
    expect(actingBadge.className).toMatch(/text-\[11px\]/);
  });

  it("renders Waiting indicator on every non-acting peer when a turn is in flight", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
        activePlayerId="p2"
      />,
    );
    // p2 is acting — no waiting badge on its row.
    expect(
      screen.queryByTestId("party-member-waiting-badge-p2"),
    ).not.toBeInTheDocument();
    // p1 (local) and p3 (peer) are waiting — both rows get the badge so
    // Alex can see at a glance "the table is waiting on Lyra, not me".
    expect(screen.getByTestId("party-member-waiting-badge-p1")).toBeInTheDocument();
    expect(screen.getByTestId("party-member-waiting-badge-p3")).toBeInTheDocument();
  });

  it("does NOT render any Waiting / ACTING badges when no player is acting", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
        activePlayerId={null}
      />,
    );
    expect(screen.queryByTestId("party-member-waiting-badge-p1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("party-member-waiting-badge-p2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("party-member-waiting-badge-p3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("party-member-acting-badge-p1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("party-member-acting-badge-p2")).not.toBeInTheDocument();
  });

  // Playtest 2026-05-03 [BUG] floor/turn-status inconsistent across tabs.
  // Simultaneous-action MP: ``submittedPlayerIds`` overrides
  // ``activePlayerId``-based logic. A player IN the set has submitted
  // (badge = WAITING); one NOT in the set still has the floor (badge =
  // ACTING). Pre-fix the labels inverted on whichever tab last submitted
  // because activePlayerId pointed at "the player who just acted."
  it("submittedPlayerIds: submitted player → WAITING, unsubmitted → ACTING", () => {
    // Repro: Scratchy submitted; Itchy still composing.
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
        // activePlayerId intentionally stale to prove submittedPlayerIds wins.
        activePlayerId="p1"
        submittedPlayerIds={new Set(["p1"])}
      />,
    );
    // p1 (submitted) gets the WAITING badge, NOT ACTING.
    expect(screen.getByTestId("party-member-waiting-badge-p1")).toBeInTheDocument();
    expect(screen.queryByTestId("party-member-acting-badge-p1")).not.toBeInTheDocument();
    // p2 (not submitted, still composing) gets ACTING, NOT WAITING.
    expect(screen.getByTestId("party-member-acting-badge-p2")).toBeInTheDocument();
    expect(screen.queryByTestId("party-member-waiting-badge-p2")).not.toBeInTheDocument();
    // p3 (not submitted) also gets ACTING.
    expect(screen.getByTestId("party-member-acting-badge-p3")).toBeInTheDocument();
  });

  it("submittedPlayerIds empty → every PC shows ACTING (round just started)", () => {
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
        activePlayerId={null}
        submittedPlayerIds={new Set()}
      />,
    );
    // No one has submitted yet — every PC has the floor.
    expect(screen.getByTestId("party-member-acting-badge-p1")).toBeInTheDocument();
    expect(screen.getByTestId("party-member-acting-badge-p2")).toBeInTheDocument();
    expect(screen.getByTestId("party-member-acting-badge-p3")).toBeInTheDocument();
  });

  it("submittedPlayerIds undefined → falls back to activePlayerId (back-compat)", () => {
    // Sequential / pre-MP / solo callers must keep the prior behavior:
    // the player named in activePlayerId is ACTING; everyone else is WAITING.
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={PARTY}
        currentPlayerId="p1"
        activePlayerId="p2"
        // submittedPlayerIds intentionally absent.
      />,
    );
    expect(screen.getByTestId("party-member-acting-badge-p2")).toBeInTheDocument();
    expect(screen.getByTestId("party-member-waiting-badge-p1")).toBeInTheDocument();
    expect(screen.getByTestId("party-member-waiting-badge-p3")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// HP badge in the header — mechanics-first players (Sebastien/Jade)
//
// ADR-114 (ablative HP substrate) reclaims this pool as the character's HP —
// the engine logs hp=N/M. The header badge had been labeled "Edge" (a misread
// of the pool as the confrontation composure metric); these tests lock the
// badge to the "HP" label. The genuine confrontation Edge dual-dial lives in
// ConfrontationOverlay and is unaffected.
// ---------------------------------------------------------------------------

describe("CharacterPanel — HP badge in header (ADR-114 substrate)", () => {
  it("renders HP badge when hp + hp_max are present", () => {
    render(
      <CharacterPanel
        character={{ ...CHARACTER, hp: 18, hp_max: 30 }}
      />,
    );
    const badge = screen.getByTestId("character-edge-badge");
    expect(badge).toHaveTextContent("HP 18/30");
    expect(badge).toHaveAttribute("aria-label", "HP 18 of 30");
  });

  it("flags HP badge as destructive when current is at/below 25% of max", () => {
    render(
      <CharacterPanel
        character={{ ...CHARACTER, hp: 5, hp_max: 30 }}
      />,
    );
    const badge = screen.getByTestId("character-edge-badge");
    expect(badge.className).toMatch(/destructive/);
  });

  it("does not render HP badge when hp/hp_max are absent (genres without the pool)", () => {
    render(<CharacterPanel character={CHARACTER} />);
    expect(screen.queryByTestId("character-edge-badge")).not.toBeInTheDocument();
  });

  it("never renders the legacy HP badge testid (rename completeness lock)", () => {
    // Wiring test (per CLAUDE.md): even when edge data is present, the
    // legacy `character-hp-badge` testid must not render — that's the
    // signal a regression has reintroduced the old badge component.
    render(
      <CharacterPanel
        character={{ ...CHARACTER, hp: 18, hp_max: 30 }}
      />,
    );
    expect(screen.queryByTestId("character-hp-badge")).not.toBeInTheDocument();
    // And no "HP N/M" text in the panel header.
    const header = screen.getByTestId("character-header");
    expect(header.textContent ?? "").not.toMatch(/\bHP\s*\d+\s*\/\s*\d+/);
  });
});

// ---------------------------------------------------------------------------
// Wiring test — verify CharacterPanel has non-test consumers
// ---------------------------------------------------------------------------

describe("CharacterPanel — wiring", () => {
  it("is exported from the components directory", async () => {
    // Verify the module exports exist — this catches broken imports
    const mod = await import("../CharacterPanel");
    expect(mod.CharacterPanel).toBeDefined();
    expect(typeof mod.CharacterPanel).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Story 56-1: Show controlling player's name on character displays (MP only)
//
// Source-of-truth context: sprint/context/context-story-56-1.md
// - AC-1: MP CharacterPanel header shows controlling player's name.
// - AC-4: SP path renders no player-name treatment anywhere.
// - AC-5: NPCs / entries with empty player_id never get a suffix.
// - AC-6: At least one wiring test exercises the production data shape.
//
// Implementation assumption being tested: CharacterSheetData carries an
// optional `player_id` (the controlling player's displayName, equal to the
// PARTY_STATUS member.player_id). App.tsx populates it only in MP sessions,
// so the component itself can be dumb — "render if non-empty, else don't."
// This matches the existing MP-gating pattern at GameBoard.tsx:407 where
// (characters?.length ?? 0) > 1 is the established multiplayer signal.
// (Note: the canonical isMultiplayer at GameBoard.tsx:456-458 is broader —
// (characters > 1) || (turnStatusEntries > 0) || activePlayerName != null.
// This story intentionally uses only the deduped-roster signal to keep SP
// suppression conservative; transient/edge states err toward hiding the
// suffix until the roster settles.)
// ---------------------------------------------------------------------------

// A second PC in the party roster — its presence is what flips the "this is
// MP" perception both for the component (companion subsection layout, etc.)
// and for any assertion that asks "is this an MP-context render?"
const SECOND_PC_SUMMARY = {
  player_id: "James",
  name: "James",
  character_name: "Rux",
  hp: 12,
  hp_max: 20,
  status_effects: [],
  class: "Ranger",
  level: 2,
  current_location: "The Rusty Cantina",
};

describe("CharacterPanel — Story 56-1: controlling player name (MP)", () => {
  it("AC-1: renders the controlling player's name inside the character header in MP", () => {
    const character: CharacterSheetData = {
      ...CHARACTER,
      player_id: "Sebastien",
    };
    render(
      <CharacterPanel
        character={character}
        characters={[
          {
            player_id: "Sebastien",
            name: "Sebastien",
            character_name: CHARACTER.name,
            hp: 30,
            hp_max: 30,
            status_effects: [],
            class: CHARACTER.class,
            level: CHARACTER.level,
            current_location: "The Rusty Cantina",
          },
          SECOND_PC_SUMMARY,
        ]}
        currentPlayerId="Sebastien"
      />,
    );
    const header = screen.getByTestId("character-header");
    expect(within(header).getByText(/Sebastien/)).toBeInTheDocument();
  });

  it("AC-1: empty player_id renders no suffix and no dangling em-dash", () => {
    const character: CharacterSheetData = {
      ...CHARACTER,
      player_id: "",
    };
    render(
      <CharacterPanel
        character={character}
        characters={[
          { ...SECOND_PC_SUMMARY, player_id: "Sebastien", name: "Sebastien" },
          SECOND_PC_SUMMARY,
        ]}
        currentPlayerId="Sebastien"
      />,
    );
    const header = screen.getByTestId("character-header");
    // No em-dash + nothing after the character name. The negative case is
    // load-bearing: a SP-style header must not have a half-baked "Kael — "
    // trailing visual artifact.
    expect(header.textContent ?? "").not.toMatch(/—\s*$/);
    expect(header.textContent ?? "").not.toMatch(/—\s*undefined/i);
    expect(header.textContent ?? "").not.toMatch(/—\s*null/i);
  });

  it("AC-1: absent player_id (undefined) renders no suffix and no dangling em-dash", () => {
    // Same negative-case lock as the empty-string variant — undefined and
    // empty-string must produce identical (suffix-less) rendering.
    render(
      <CharacterPanel
        character={CHARACTER}
        characters={[
          { ...SECOND_PC_SUMMARY, player_id: "Sebastien", name: "Sebastien" },
          SECOND_PC_SUMMARY,
        ]}
        currentPlayerId="Sebastien"
      />,
    );
    const header = screen.getByTestId("character-header");
    expect(header.textContent ?? "").not.toMatch(/—\s*$/);
    expect(header.textContent ?? "").not.toMatch(/—\s*undefined/i);
    expect(header.textContent ?? "").not.toMatch(/—\s*null/i);
  });

  it("AC-4: single-player session does NOT render a player-name suffix in the header", () => {
    // The load-bearing AC. Even if the focused character carries a
    // player_id (transient state between SP and MP, for example), a single-
    // PC roster MUST suppress the treatment. App.tsx's MP-gate is the
    // ((characters?.length ?? 0) > 1) signal — Dev's implementation must
    // honor an equivalent gate, OR App.tsx must not populate player_id in
    // SP. Either path passes this test, neither path adds a new prop.
    const character: CharacterSheetData = {
      ...CHARACTER,
      player_id: "Sebastien",
    };
    render(
      <CharacterPanel
        character={character}
        characters={[
          {
            player_id: "Sebastien",
            name: "Sebastien",
            character_name: CHARACTER.name,
            hp: 30,
            hp_max: 30,
            status_effects: [],
            class: CHARACTER.class,
            level: CHARACTER.level,
            current_location: "The Rusty Cantina",
          },
        ]}
        currentPlayerId="Sebastien"
      />,
    );
    const header = screen.getByTestId("character-header");
    // The player name must not appear inside the header in SP. Note we use
    // queryByText with the header subtree — a global match could collide
    // with the party-row testid `party-member-Sebastien` which is fine to
    // exist (it's the roster, not the header).
    expect(within(header).queryByText(/Sebastien/)).not.toBeInTheDocument();
  });

  it("AC-4: SP with companions array does not render a player-name suffix", () => {
    // Companions look like PCs in the roster layout but have no player_id.
    // A naive implementation that counts (characters + companions).length
    // would incorrectly read this as MP. Guard against that.
    const character: CharacterSheetData = {
      ...CHARACTER,
      player_id: "Sebastien",
    };
    render(
      <CharacterPanel
        character={character}
        characters={[
          {
            player_id: "Sebastien",
            name: "Sebastien",
            character_name: CHARACTER.name,
            hp: 30,
            hp_max: 30,
            status_effects: [],
            class: CHARACTER.class,
            level: CHARACTER.level,
            current_location: "The Rusty Cantina",
          },
        ]}
        companions={[
          {
            name: "Bramble",
            role: "Hireling",
            description: "A wiry tracker.",
            notes: "",
            recruited_turn: 4,
            recruited_by: CHARACTER.name,
          },
        ]}
        currentPlayerId="Sebastien"
      />,
    );
    const header = screen.getByTestId("character-header");
    expect(within(header).queryByText(/Sebastien/)).not.toBeInTheDocument();
  });

  it("AC-6 (wiring): MP-shaped data flowing through CharacterPanel renders the player name", () => {
    // Wiring test per sidequest-ui/CLAUDE.md "Every test suite needs a
    // wiring test." This exercises the same data shape App.tsx assembles
    // at sidequest-ui/src/App.tsx:820-869 (PARTY_STATUS → CharacterSheetData
    // build) — minimum: name/class/level/stats/abilities/class_moves/
    // backstory + player_id sourced from the matching party member.
    const built: CharacterSheetData = {
      name: "Rux",
      class: "Ranger",
      race: "Wood Elf",
      level: 2,
      hp: 18,
      hp_max: 20,
      stats: { strength: 12, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 8 },
      abilities: [makeAbility("Tracker")],
      class_moves: [],
      backstory: "Born under the Ashwood canopy.",
      portrait_url: undefined,
      current_location: "The Rusty Cantina",
      player_id: "James",
    };
    render(
      <CharacterPanel
        character={built}
        characters={[
          {
            player_id: "James",
            name: "James",
            character_name: "Rux",
            hp: 18,
            hp_max: 20,
            status_effects: [],
            class: "Ranger",
            level: 2,
            current_location: "The Rusty Cantina",
          },
          SECOND_PC_SUMMARY,
        ]}
        currentPlayerId="James"
      />,
    );
    const header = screen.getByTestId("character-header");
    expect(within(header).getByText(/James/)).toBeInTheDocument();
  });

  it("AC-3 (inheritance): CharacterWidget wrapper renders the same player name", async () => {
    // CharacterWidget.tsx is a 7-line passthrough of CharacterPanel. The
    // story context says no separate edit is needed but the inheritance
    // must be verified — this test locks that the wrapper does not strip
    // or shadow the new player-name treatment.
    const { CharacterWidget } = await import("../GameBoard/widgets/CharacterWidget");
    const character: CharacterSheetData = {
      ...CHARACTER,
      player_id: "Sebastien",
    };
    render(
      <CharacterWidget
        character={character}
        characters={[
          {
            player_id: "Sebastien",
            name: "Sebastien",
            character_name: CHARACTER.name,
            hp: 30,
            hp_max: 30,
            status_effects: [],
            class: CHARACTER.class,
            level: CHARACTER.level,
            current_location: "The Rusty Cantina",
          },
          SECOND_PC_SUMMARY,
        ]}
        currentPlayerId="Sebastien"
      />,
    );
    const header = screen.getByTestId("character-header");
    expect(within(header).getByText(/Sebastien/)).toBeInTheDocument();
  });

  it("AC-5: NPC party-row (empty player_id) does not get a player-name suffix", () => {
    // The party roster (line ~404-525 of CharacterPanel.tsx) iterates over
    // `characters`. An NPC-shaped entry — one with an empty player_id —
    // must not render a stray suffix on its row even when the surrounding
    // session is multiplayer.
    const character: CharacterSheetData = {
      ...CHARACTER,
      player_id: "Sebastien",
    };
    render(
      <CharacterPanel
        character={character}
        characters={[
          {
            player_id: "Sebastien",
            name: "Sebastien",
            character_name: CHARACTER.name,
            hp: 30,
            hp_max: 30,
            status_effects: [],
            class: CHARACTER.class,
            level: CHARACTER.level,
            current_location: "The Rusty Cantina",
          },
          // NPC-shaped: empty player_id is the marker. The DOM testid
          // formula uses player_id verbatim, so an empty key would clash
          // with itself across multiple NPCs — but for this single-NPC
          // case the row should render without a suffix.
          {
            player_id: "",
            name: "Grizelda",
            character_name: "Grizelda",
            hp: 6,
            hp_max: 6,
            status_effects: [],
            class: "Innkeeper",
            level: 1,
            current_location: "The Rusty Cantina",
          },
        ]}
        currentPlayerId="Sebastien"
      />,
    );
    // The row for the NPC: locate by character name, then verify no
    // controlling-player-name suffix decoration appears on the row.
    const grizeldaCell = screen.getByText("Grizelda");
    const row = grizeldaCell.closest("[data-testid^='party-member-']");
    expect(row).not.toBeNull();
    // Negative: no em-dash + name pattern (e.g. "— Grizelda" attribution).
    // The roster row already shows the character name; what must NOT
    // appear is an em-dash-style player-attribution dangling on the row.
    expect((row as HTMLElement).textContent ?? "").not.toMatch(/—\s*[A-Za-z]/);
  });
});
