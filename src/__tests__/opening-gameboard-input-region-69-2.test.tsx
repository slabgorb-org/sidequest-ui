/**
 * Story 69-2 — Opening gameboard: full-width action input under the narrative
 * + co-located high-contrast HP pip scale (GameBoard WIRING).
 *
 * Playtest-3 findings (epic 69, sq-playtest-pingpong.md):
 *   - Alex (slow typist): the action input must be a prominent, full-width
 *     target directly beneath the narration — never side-docked or buried.
 *   - Sebastien & Jade (mechanics-first): HP must be legible in the
 *     PLAYER-FACING surface, glanceable while composing an action — not one
 *     Dockview tab away in the CharacterPanel.
 *
 * This suite drives the real GameBoard tree (no import of the new component)
 * so it LOADS and RUNS today, failing on the absent testids rather than a
 * parse-time import error. That proves the harness (ImageBusProvider, the
 * GameBoard render, the matchMedia layout override) is sound now, and pins
 * the wiring contract Dev must satisfy:
 *
 *   - GameBoard tags its input wrapper `data-testid="gameboard-input-region"`
 *     with a `w-full` (full-width) class in BOTH the mobile (MobileTabView)
 *     and desktop (Dockview) layouts.
 *   - That region contains both `input-bar` (existing) and `input-hp-scale`
 *     (new, co-located), and is ordered AFTER the narrative content.
 *   - The co-located HP scale reflects the local player's HP and updates
 *     reactively when characters[] changes (PARTY_STATUS fan-out).
 *
 * Touches no server / protocol / OTEL — pure player-facing UI wiring.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "@/components/GameBoard/GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { CharacterSummary } from "@/types/party";

function character(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
  return {
    player_id: "kael-pid",
    name: "KeithPlayer",
    character_name: "Kael",
    class: "Ranger",
    level: 3,
    hp: 18,
    hp_max: 30,
    status_effects: [],
    portrait_url: "",
    current_location: "",
    ...overrides,
  };
}

function renderBoard(overrides: Partial<GameBoardProps> = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [character()],
    onSend: vi.fn(),
    disabled: false,
    currentPlayerId: "kael-pid",
  };
  const props = { ...defaults, ...overrides };
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
}

/** Force the desktop (Dockview) layout. test-setup reports mobile by default
 *  so jsdom can render widget content; AC-3 needs the HP scale to survive the
 *  desktop path too, where the input area lives OUTSIDE dockview. */
function setMatchMedia(mobile: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: mobile ? query.includes("max-width: 767px") : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════
// AC-1 + AC-5: full-width input region with co-located HP scale (wiring)
// ══════════════════════════════════════════════════════════════════════════

describe("GameBoard — full-width input region + co-located HP scale (AC-1, AC-5 wiring)", () => {
  it("renders a full-width input region containing both the input bar and the HP scale", () => {
    renderBoard();

    const region = screen.getByTestId("gameboard-input-region");
    // AC-1: full-width (not a narrow sidebar / not docked in a tab).
    expect(region.className).toMatch(/\bw-full\b/);
    // Co-location: both the input and the HP scale live inside the same region.
    expect(within(region).getByTestId("input-bar")).toBeInTheDocument();
    expect(within(region).getByTestId("input-hp-scale")).toBeInTheDocument();
  });

  it("the co-located HP scale reflects the local player's HP at the input", () => {
    renderBoard({ characters: [character({ hp: 18, hp_max: 30 })] });

    const region = screen.getByTestId("gameboard-input-region");
    const group = within(region).getByTestId("hp-pip-group-kael-pid");
    expect(group).toHaveAttribute("aria-label", "HP 18 of 30");
  });

  it("input region is ordered after the narrative content, not above it", () => {
    renderBoard();
    const board = screen.getByTestId("game-board");
    const region = screen.getByTestId("gameboard-input-region");
    const content = board.querySelector(".flex-1");
    expect(content).not.toBeNull();
    // Narrative/content region precedes the input region in DOM order.
    expect(
      content!.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AC-4 + AC-5: reactive HP updates flow to the co-located pips
// ══════════════════════════════════════════════════════════════════════════

describe("GameBoard — co-located HP scale reacts to PARTY_STATUS changes (AC-4, AC-5)", () => {
  it("updates the pips and danger styling when the character's HP drops", () => {
    const { rerender } = renderBoard({ characters: [character({ hp: 18, hp_max: 30 })] });

    let group = screen.getByTestId("hp-pip-group-kael-pid");
    expect(group).toHaveAttribute("aria-label", "HP 18 of 30");
    expect(group.className).not.toMatch(/destructive/);

    // Simulate a fresh PARTY_STATUS fan-out dropping Kael to 6/30 (20% → danger).
    rerender(
      <ImageBusProvider messages={[]}>
        <GameBoard
          messages={[]}
          characters={[character({ hp: 6, hp_max: 30 })]}
          onSend={vi.fn()}
          disabled={false}
          currentPlayerId="kael-pid"
        />
      </ImageBusProvider>,
    );

    group = screen.getByTestId("hp-pip-group-kael-pid");
    expect(group).toHaveAttribute("aria-label", "HP 6 of 30");
    expect(group.className).toMatch(/destructive/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AC-3: responsive — HP scale survives both mobile and desktop layouts
// ══════════════════════════════════════════════════════════════════════════

describe("GameBoard — co-located HP scale is present across layouts (AC-3 responsive)", () => {
  afterEach(() => {
    setMatchMedia(true); // restore shared mobile default for later test files
  });

  it("mobile layout: HP scale renders in the full-width input region", () => {
    setMatchMedia(true);
    renderBoard();
    const region = screen.getByTestId("gameboard-input-region");
    expect(region.className).toMatch(/\bw-full\b/);
    expect(within(region).getByTestId("input-hp-scale")).toBeInTheDocument();
  });

  it("desktop layout: HP scale still renders in the full-width input region", () => {
    setMatchMedia(false);
    renderBoard();
    const region = screen.getByTestId("gameboard-input-region");
    expect(region.className).toMatch(/\bw-full\b/);
    expect(within(region).getByTestId("input-hp-scale")).toBeInTheDocument();
  });
});
