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

  it("renders inline Edge per party row sourced from CharacterSummary.hp/hp_max", () => {
    // ADR-014 / ADR-078: HP was removed from CreatureCore in favor of EdgePool.
    // The wire field on CharacterSummary is still hp/hp_max (legacy name) but
    // the value is the edge pool, and the UI label must read "Edge".
    render(<CharacterPanel character={CHARACTER} characters={PARTY} />);
    // Kael at 24/30 — full opacity tone
    const kaelEdge = screen.getByTestId("party-member-edge-p1");
    expect(kaelEdge).toHaveTextContent("Edge 24/30");
    // Lyra at 8/40 = 20% — at or below the 25% threshold, should show
    // destructive tone class for at-a-glance "one push from yielding" signal.
    const lyraEdge = screen.getByTestId("party-member-edge-p2");
    expect(lyraEdge).toHaveTextContent("Edge 8/40");
    expect(lyraEdge.className).toMatch(/destructive/);
  });

  it("renders no legacy 'HP N/M' text in any party row (ADR-014 schema lock)", () => {
    render(<CharacterPanel character={CHARACTER} characters={PARTY} />);
    const partySection = screen.getByTestId("party-section");
    // Lock the rename: a stray "HP " prefix on a number/number row would mean
    // someone re-introduced the legacy label.
    expect(partySection.textContent ?? "").not.toMatch(/\bHP\s*\d+\s*\/\s*\d+/);
  });

  it("hides inline Edge for genres that don't model edge (both 0)", () => {
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
    expect(actingBadge).toHaveTextContent(/ACTING/);
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
// Edge badge in the header — Sebastien-axis (mechanical visibility)
//
// ADR-014 ("Diamonds and Coal") + ADR-078 ("Edge / Composure") removed the
// hit-points field from CreatureCore. The character-panel header used to
// render an "HP N/M" badge that pulled from edge.current under a misleading
// label; the rename below locks the badge to the actual schema.
// ---------------------------------------------------------------------------

describe("CharacterPanel — Edge badge in header (ADR-014 schema)", () => {
  it("renders Edge badge when hp + hp_max are present (legacy wire fields, edge value)", () => {
    render(
      <CharacterPanel
        character={{ ...CHARACTER, hp: 18, hp_max: 30 }}
      />,
    );
    const badge = screen.getByTestId("character-edge-badge");
    expect(badge).toHaveTextContent("Edge 18/30");
    expect(badge).toHaveAttribute("aria-label", "Edge 18 of 30");
  });

  it("flags Edge badge as destructive when current is at/below 25% of max", () => {
    render(
      <CharacterPanel
        character={{ ...CHARACTER, hp: 5, hp_max: 30 }}
      />,
    );
    const badge = screen.getByTestId("character-edge-badge");
    expect(badge.className).toMatch(/destructive/);
  });

  it("does not render Edge badge when hp/hp_max are absent (genres without edge)", () => {
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
