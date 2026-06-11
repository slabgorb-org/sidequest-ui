import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CharacterCreation } from "../CharacterCreation";

/**
 * Story 103-3 RED — Roll the Bones UI affordance (build plan §D-C).
 *
 * Server-driven like every chargen scene: `input_type: "roll_the_bones"`
 * plus `rolled_stats` (six { name, value } in pack order — the standard
 * six) and `reroll_budget_remaining`.
 *
 * Pinned UX contract — playgroup rubric:
 *  - Sebastien/Jade (mechanics-first): every rolled value is visible,
 *    per stat, in order. The math is on screen, not narrated away.
 *  - Alex (no time pressure): nothing auto-commits. Rerolls are explicit
 *    per-stat buttons; a separate confirm (data-testid "bones-confirm")
 *    sends the response. A hopeless array can be confirmed immediately —
 *    the UI never forces a reroll.
 *
 * Wire protocol (mirrors arrange_*): reroll responds
 * `{ phase: "bones_reroll", stat }`; confirm responds
 * `{ phase: "bones_confirm" }`. Budget renders in
 * data-testid "bones-budget"; at 0 every reroll button is disabled.
 */

const ROLLED = [
  { name: "STR", value: 9 },
  { name: "DEX", value: 16 },
  { name: "CON", value: 5 },
  { name: "INT", value: 11 },
  { name: "WIS", value: 13 },
  { name: "CHA", value: 4 },
];

function bonesScene(overrides: Record<string, unknown> = {}) {
  return {
    phase: "scene",
    input_type: "roll_the_bones",
    prompt: "The bones lie where they fall.",
    rolled_stats: ROLLED,
    reroll_budget_remaining: 2,
    ...overrides,
  };
}

function renderBones(scene = bonesScene(), onRespond = vi.fn()) {
  render(<CharacterCreation scene={scene} loading={false} onRespond={onRespond} />);
  return onRespond;
}

describe("CharacterCreation: Roll the Bones (103-3)", () => {
  it("renders all six stats with their rolled values, in payload order", () => {
    renderBones();
    for (const { name, value } of ROLLED) {
      expect(screen.getByTestId(`bones-stat-${name}`)).toHaveTextContent(name);
      expect(screen.getByTestId(`bones-stat-${name}`)).toHaveTextContent(String(value));
    }
    const rows = screen.getAllByTestId(/^bones-stat-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(
      ROLLED.map(({ name }) => `bones-stat-${name}`),
    );
  });

  it("shows the remaining reroll budget", () => {
    renderBones();
    expect(screen.getByTestId("bones-budget")).toHaveTextContent("2");
  });

  it("sends bones_reroll with the stat when a reroll button is clicked", () => {
    const onRespond = renderBones();
    fireEvent.click(screen.getByRole("button", { name: /reroll dex/i }));
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith({ phase: "bones_reroll", stat: "DEX" });
  });

  it("sends bones_confirm from the explicit confirm button — and nothing else", () => {
    const onRespond = renderBones();
    fireEvent.click(screen.getByTestId("bones-confirm"));
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith({ phase: "bones_confirm" });
  });

  it("disables every reroll button when the budget is exhausted", () => {
    const onRespond = renderBones(bonesScene({ reroll_budget_remaining: 0 }));
    for (const { name } of ROLLED) {
      const btn = screen.getByRole("button", { name: new RegExp(`reroll ${name}`, "i") });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
    }
    expect(onRespond).not.toHaveBeenCalled();
    expect(screen.getByTestId("bones-budget")).toHaveTextContent("0");
  });

  it("lets a hopeless array stand — confirm is enabled with no reroll spent", () => {
    const hopeless = ROLLED.map(({ name }) => ({ name, value: 3 }));
    const onRespond = renderBones(bonesScene({ rolled_stats: hopeless }));
    const confirm = screen.getByTestId("bones-confirm");
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onRespond).toHaveBeenCalledWith({ phase: "bones_confirm" });
  });
});
