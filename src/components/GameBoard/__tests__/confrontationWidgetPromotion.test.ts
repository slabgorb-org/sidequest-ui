/**
 * RED — Story 85-3 (Tier B): promote the confrontation back into the dockview
 * as a data-gated, auto-focused panel.
 *
 * REVIVAL, not greenfield. Per the operator (Keith, 2026-06-04) this surface WAS
 * a dockview panel, then was moved to a bottom strip when "chandelier swinging"
 * (free environmental action) was wired in — to signal that off-beat creative
 * actions were possible. Tier B brings it back to a panel. Vestigial panel-era
 * wiring remains and must be REVIVED/cleaned, not duplicated:
 *   - widgetRegistry.ts:13  "Confrontation is intentionally not a widget id …"
 *   - GameBoard.tsx:727     add/remove effect comment still names "confrontation"
 *
 * This file pins the promotion contract at the registry level (refactor-stable;
 * no dockview rendering). The operator-decided SPLIT layout (narration left,
 * confrontation right — NOT full takeover) is asserted structurally: `narrative`
 * stays always-present so the confrontation panel can never REPLACE the prose
 * column. That preserves the chandelier affordance — the InputBar + narration
 * stay reachable, so a player can still type a creative action (The Zork
 * Problem: never imply a closed verb set).
 *
 * `confrontation` is not yet a `WidgetId`, so the registry is accessed through a
 * widened type — the RED signal is the missing entry at runtime, not a type error.
 */
import { describe, it, expect } from "vitest";
import {
  WIDGET_REGISTRY,
  buildHotkeyMap,
  type WidgetDef,
} from "@/components/GameBoard/widgetRegistry";

const REGISTRY = WIDGET_REGISTRY as Record<string, WidgetDef | undefined>;

describe("85-3 confrontation dockview promotion", () => {
  it("registers `confrontation` as a dockview widget", () => {
    const def = REGISTRY["confrontation"];
    expect(def, "confrontation must be a registered widget (Tier B revival)").toBeDefined();
    expect(def?.id).toBe("confrontation");
  });

  it("gates the confrontation widget on data presence so it auto-appears/disappears", () => {
    // dataGated:true → GameBoard's sync effect adds the panel when
    // confrontationData arrives and removes it on resolution (auto-focus /
    // release, AC2). A non-data-gated confrontation tab would sit empty between
    // encounters — the opposite of "claims the canvas while active".
    const def = REGISTRY["confrontation"];
    expect(def?.dataGated).toBe(true);
  });

  it("keeps the confrontation panel closable so a player can dismiss the focus", () => {
    const def = REGISTRY["confrontation"];
    expect(def?.closable).toBe(true);
  });

  it("preserves SPLIT layout: narrative stays always-present and is never replaced", () => {
    // The operator chose SPLIT over full-takeover (2026-06-04). Narration must
    // remain mounted alongside the confrontation panel — confrontation is a
    // SEPARATE widget, and narrative is non-data-gated (always present), so the
    // promotion can never take over the prose column. This is what keeps the
    // soloist reachable (The Guitar Solo) and the chandelier affordance alive.
    expect(REGISTRY["narrative"]?.dataGated).toBe(false);
    expect(REGISTRY["confrontation"]?.id).not.toBe(REGISTRY["narrative"]?.id);
  });

  it("does not introduce a hotkey collision (confrontation auto-focuses, no toggle key)", () => {
    // Confrontation auto-focuses on data arrival; it should not claim a manual
    // hotkey. buildHotkeyMap must still produce a 1:1 key→widget map with no
    // duplicate keys after the new entry lands.
    const map = buildHotkeyMap();
    const hotkeyWidgets = Object.values(map);
    expect(new Set(hotkeyWidgets).size).toBe(hotkeyWidgets.length);
    // If confrontation declares a hotkey at all, it must resolve back to itself.
    const conf = REGISTRY["confrontation"];
    if (conf?.hotkey) {
      expect(map[conf.hotkey]).toBe("confrontation");
    }
  });
});
