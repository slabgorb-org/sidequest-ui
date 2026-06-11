import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CharacterCreation } from "../CharacterCreation";

/**
 * Story 103-2 RED — the stock chargen step (build plan §D-B, story AC7).
 *
 * Chargen is the one sanctioned menu surface (story context: "Natural-
 * language entry stays open elsewhere — this is chargen"). The stock step
 * is server-driven like every other scene: `input_type: "stock"` plus a
 * `stock_options` payload of
 *
 *   { id, label, description?, deltas: { attr_mods?, move?, ac?,
 *     trauma_target_mod?, granted_mutations? } }
 *
 * Pinned UX contract — two audiences from the playgroup rubric:
 *  - Sebastien/Jade (mechanics-first): the mechanical deltas of the
 *    SELECTED stock render legibly BEFORE confirmation — signed attr
 *    mods, AC/Move/Trauma values, granted mutation display names.
 *  - Alex (no time pressure): selecting a stock only previews it; a
 *    separate explicit confirm button sends the response. Browse freely,
 *    commit deliberately.
 *
 * Wire protocol: confirm responds `{ phase: "scene", choice: String(i+1) }`
 * — the same choice protocol every scene uses; the server maps the index.
 */

const STOCK_SCENE = {
  phase: "scene",
  input_type: "stock",
  prompt: "Six roads into the world. Choose what you are.",
  stock_options: [
    {
      id: "sleeper",
      label: "Sleeper",
      description: "Woke from the long cold racks.",
      deltas: {},
    },
    {
      id: "harbor_seal",
      label: "Harbor Seal Uplift",
      description: "An Animal stock of the Whalecoast.",
      deltas: {
        attr_mods: { STR: 1, WIS: -1 },
        move: 12,
        ac: 14,
        trauma_target_mod: 1,
        granted_mutations: ["Crushing Jaws"],
      },
    },
  ],
};

function renderStockScene(onRespond = vi.fn()) {
  render(<CharacterCreation scene={STOCK_SCENE} loading={false} onRespond={onRespond} />);
  return onRespond;
}

describe("CharacterCreation: stock branch (103-2)", () => {
  it("renders a card per stock option when input_type is stock", () => {
    renderStockScene();
    expect(screen.getByTestId("stock-option-sleeper")).toBeInTheDocument();
    expect(screen.getByTestId("stock-option-harbor_seal")).toBeInTheDocument();
    expect(screen.getByText("Sleeper")).toBeInTheDocument();
    expect(screen.getByText("Harbor Seal Uplift")).toBeInTheDocument();
  });

  it("selecting a stock previews its mechanical deltas before confirmation", () => {
    renderStockScene();
    fireEvent.click(screen.getByTestId("stock-option-harbor_seal"));
    const panel = screen.getByTestId("stock-deltas");
    // Signed attr mods — the math Sebastien/Jade read before committing.
    expect(panel).toHaveTextContent(/STR\s*\+1/);
    expect(panel).toHaveTextContent(/WIS\s*-1/);
    // Move/AC/Trauma trait hooks, by value.
    expect(panel).toHaveTextContent(/12/);
    expect(panel).toHaveTextContent(/14/);
    // Granted mutations by display name, not catalog id.
    expect(panel).toHaveTextContent("Crushing Jaws");
    expect(panel).not.toHaveTextContent("hybrid/");
  });

  it("selecting a stock does NOT respond — preview only", () => {
    const onRespond = renderStockScene();
    fireEvent.click(screen.getByTestId("stock-option-harbor_seal"));
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("confirm is disabled until a stock is selected", () => {
    renderStockScene();
    expect(screen.getByTestId("stock-confirm")).toBeDisabled();
  });

  it("confirm sends the standard scene-choice response for the selected index", () => {
    const onRespond = renderStockScene();
    fireEvent.click(screen.getByTestId("stock-option-harbor_seal"));
    fireEvent.click(screen.getByTestId("stock-confirm"));
    expect(onRespond).toHaveBeenCalledWith({ phase: "scene", choice: "2" });
  });

  it("switching selection updates the preview to the new stock", () => {
    renderStockScene();
    fireEvent.click(screen.getByTestId("stock-option-harbor_seal"));
    expect(screen.getByTestId("stock-deltas")).toHaveTextContent("Crushing Jaws");
    fireEvent.click(screen.getByTestId("stock-option-sleeper"));
    expect(screen.getByTestId("stock-deltas")).not.toHaveTextContent("Crushing Jaws");
    expect(screen.getByTestId("stock-deltas")).not.toHaveTextContent(/STR/);
  });
});
