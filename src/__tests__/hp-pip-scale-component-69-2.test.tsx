/**
 * Story 69-2 — co-located high-contrast HP pip scale (component contract).
 *
 * Focused behavioral tests for the extracted, reusable HP pip component.
 *
 * Reuse-first (context-story-69-2 / Architect): HP pips already exist as the
 * module-private `EdgeBadge` + `FolioEdgeTicks` inside CharacterPanel. Those
 * are NOT exported, so co-locating them with the action input means extracting
 * the pip idiom into a shared component (`@/components/HpPipScale`). These
 * tests pin that component's contract. They touch no server / protocol / OTEL.
 *
 * RED: HpPipScale does not exist yet — this whole suite fails to resolve its
 * import until Dev creates the component. (Wiring of the component into the
 * GameBoard input region is proven separately in
 * `opening-gameboard-input-region-69-2.test.tsx`, which runs independently.)
 *
 * Test-design contract (chosen by TEA — see Design Deviations in session):
 *   - `@/components/HpPipScale` exports `HpPipScale`
 *       props: { characters: CharacterSummary[]; currentPlayerId?: string }
 *   - container testid: `input-hp-scale`
 *   - local player's group testid: `hp-pip-group-{player_id}`,
 *     aria-label `HP {cur} of {max}` (matches the existing EdgeBadge a11y
 *     convention so screen readers read the same string everywhere)
 *   - one pip per max-HP unit, testid `hp-pip`, `data-filled="true"` for the
 *     first `cur` pips (mirrors FolioEdgeTicks' diamond-per-unit idiom)
 *   - danger styling at ratio <= 0.25 → group className matches /destructive/
 *     (same threshold + token convention as EdgeBadge / FolioEdgeTicks)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("HpPipScale — pip rendering & legibility (AC-2, AC-4)", () => {
  it("is importable from @/components/HpPipScale", async () => {
    const mod = await import("@/components/HpPipScale");
    expect(typeof mod.HpPipScale).toBe("function");
  });

  it("renders one pip per max-HP unit, filling the current HP", async () => {
    const { HpPipScale } = await import("@/components/HpPipScale");
    render(<HpPipScale characters={[character({ hp: 7, hp_max: 10 })]} currentPlayerId="kael-pid" />);

    const pips = screen.getAllByTestId("hp-pip");
    expect(pips).toHaveLength(10);
    const filled = pips.filter((p) => p.getAttribute("data-filled") === "true");
    expect(filled).toHaveLength(7);
  });

  it("exposes an accessible 'HP cur of max' label matching the EdgeBadge convention", async () => {
    const { HpPipScale } = await import("@/components/HpPipScale");
    render(<HpPipScale characters={[character({ hp: 18, hp_max: 30 })]} currentPlayerId="kael-pid" />);

    const group = screen.getByTestId("hp-pip-group-kael-pid");
    expect(group).toHaveAttribute("aria-label", "HP 18 of 30");
    // Visible legible value for sighted mechanics-first players (Sebastien/Jade).
    expect(group).toHaveTextContent("HP 18/30");
  });

  it("applies destructive (danger) styling when HP ratio is <= 25%", async () => {
    const { HpPipScale } = await import("@/components/HpPipScale");
    render(<HpPipScale characters={[character({ hp: 7, hp_max: 40 })]} currentPlayerId="kael-pid" />);

    // 7/40 = 17.5% → danger, same threshold as EdgeBadge/FolioEdgeTicks.
    const group = screen.getByTestId("hp-pip-group-kael-pid");
    expect(group.className).toMatch(/destructive/);
  });

  it("does NOT apply danger styling above the 25% threshold", async () => {
    const { HpPipScale } = await import("@/components/HpPipScale");
    render(<HpPipScale characters={[character({ hp: 18, hp_max: 30 })]} currentPlayerId="kael-pid" />);

    const group = screen.getByTestId("hp-pip-group-kael-pid");
    expect(group.className).not.toMatch(/destructive/);
  });

  it("handles 0 HP without crashing — all pips empty, danger styling on", async () => {
    const { HpPipScale } = await import("@/components/HpPipScale");
    render(<HpPipScale characters={[character({ hp: 0, hp_max: 8 })]} currentPlayerId="kael-pid" />);

    const pips = screen.getAllByTestId("hp-pip");
    expect(pips).toHaveLength(8);
    expect(pips.filter((p) => p.getAttribute("data-filled") === "true")).toHaveLength(0);
    expect(screen.getByTestId("hp-pip-group-kael-pid").className).toMatch(/destructive/);
  });

  it("handles full HP — every pip filled, no danger", async () => {
    const { HpPipScale } = await import("@/components/HpPipScale");
    render(<HpPipScale characters={[character({ hp: 12, hp_max: 12 })]} currentPlayerId="kael-pid" />);

    const pips = screen.getAllByTestId("hp-pip");
    expect(pips.filter((p) => p.getAttribute("data-filled") === "true")).toHaveLength(12);
    expect(screen.getByTestId("hp-pip-group-kael-pid").className).not.toMatch(/destructive/);
  });

  it("resolves the local player by currentPlayerId, not just the first character", async () => {
    const { HpPipScale } = await import("@/components/HpPipScale");
    render(
      <HpPipScale
        characters={[
          character({ player_id: "lyra-pid", character_name: "Lyra", hp: 40, hp_max: 40 }),
          character({ player_id: "kael-pid", character_name: "Kael", hp: 9, hp_max: 30 }),
        ]}
        currentPlayerId="kael-pid"
      />,
    );

    const group = screen.getByTestId("hp-pip-group-kael-pid");
    expect(group).toHaveAttribute("aria-label", "HP 9 of 30");
  });

  it("renders the scale container without crashing when the party is empty", async () => {
    const { HpPipScale } = await import("@/components/HpPipScale");
    render(<HpPipScale characters={[]} currentPlayerId="kael-pid" />);

    expect(screen.getByTestId("input-hp-scale")).toBeInTheDocument();
    expect(screen.queryAllByTestId("hp-pip")).toHaveLength(0);
  });
});
