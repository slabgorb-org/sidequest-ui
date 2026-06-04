/**
 * Wiring test — verifies the GameBoard composable dashboard is fully connected.
 *
 * Per CLAUDE.md: "Every test suite needs a wiring test that verifies the component
 * is wired into the system — imported, called, and reachable from production code paths."
 */
import { describe, it, expect } from "vitest";

describe("GameBoard wiring", () => {
  it("GameBoard is importable from @/components/GameBoard/GameBoard", async () => {
    const mod = await import("@/components/GameBoard/GameBoard");
    expect(typeof mod.GameBoard).toBe("function");
  });

  it("ImageBusProvider is importable from @/providers/ImageBusProvider", async () => {
    const mod = await import("@/providers/ImageBusProvider");
    expect(typeof mod.ImageBusProvider).toBe("function");
    expect(typeof mod.useImageBus).toBe("function");
  });

  it("App.tsx imports GameBoard (not GameLayout)", async () => {
    const appSource = await import("@/App?raw");
    const src = typeof appSource === "string" ? appSource : appSource.default;
    expect(src).toContain("GameBoard");
    expect(src).not.toMatch(/import.*GameLayout.*from/);
  });

  it("App.tsx wraps GameBoard in ImageBusProvider", async () => {
    const appSource = await import("@/App?raw");
    const src = typeof appSource === "string" ? appSource : appSource.default;
    expect(src).toContain("ImageBusProvider");
  });

  it("all widget wrappers are importable", async () => {
    const widgets = [
      "@/components/GameBoard/widgets/NarrativeWidget",
      "@/components/GameBoard/widgets/CharacterWidget",
      "@/components/GameBoard/widgets/MapWidget",
      "@/components/GameBoard/widgets/InventoryWidget",
      // JournalWidget removed playtest 2026-04-11 — see widgetRegistry.ts.
      "@/components/GameBoard/widgets/KnowledgeWidget",
      "@/components/GameBoard/widgets/ImageGalleryWidget",
      // ConfrontationWidget removed 2026-05-13 — confrontation panel now
      // mounts directly above the InputBar via ConfrontationOverlay; it is
      // not a dockview tab.
      "@/components/GameBoard/widgets/AudioWidget",
    ];
    for (const path of widgets) {
      const mod = await import(path);
      const exportNames = Object.keys(mod);
      expect(exportNames.length).toBeGreaterThan(0);
    }
  });

  it("useGameBoardLayout hook is importable", async () => {
    const mod = await import("@/hooks/useGameBoardLayout");
    expect(typeof mod.useGameBoardLayout).toBe("function");
  });

  it("useGameBoardHotkeys hook is importable", async () => {
    const mod = await import("@/hooks/useGameBoardHotkeys");
    expect(typeof mod.useGameBoardHotkeys).toBe("function");
  });

  it("widgetRegistry exports all required widgets", async () => {
    const mod = await import("@/components/GameBoard/widgetRegistry");
    // `settings` was removed during the dockview migration (the old
    // SettingsOverlay is gone — settings live in their own screen now).
    // `lore` was absorbed into `knowledge` (backstory now renders as a
    // header section inside KnowledgeJournal).
    const requiredIds = [
      "narrative", "character", "inventory", "map", "ship",
      // "journal" removed playtest 2026-04-11 — empty Handouts tab.
      // "confrontation" was a bottom strip 2026-05-13; Story 85-3 (2026-06-04)
      // promoted it back to a data-gated dockview widget — guard it here so it
      // can't silently vanish from the registry again.
      "confrontation",
      "knowledge", "gallery", "audio",
    ];
    for (const id of requiredIds) {
      expect(mod.WIDGET_REGISTRY[id as keyof typeof mod.WIDGET_REGISTRY]).toBeDefined();
    }
  });

  // Regression guard for sq-playtest 2026-05-03 [BUG] Ship widget registered
  // but never appears in dockview. The render branch for `ship` already
  // existed (gated by worldSlug === "coyote_star") and the registry entry
  // existed, but availableWidgets never added "ship", so the dockview's
  // initial layout skipped it entirely. Comment in GameBoard.tsx makes the
  // contract explicit: every widget that should ever appear MUST be added
  // to availableWidgets at mount.
  it("availableWidgets adds 'ship' when worldSlug === 'coyote_star'", async () => {
    const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
      default: string;
    };
    expect(src.default).toMatch(
      /worldSlug\s*===\s*["']coyote_star["']\s*\)\s*available\.add\(\s*["']ship["']\s*\)/,
    );
  });

  it("availableWidgets useMemo deps include worldSlug (so ship appears on world bind)", async () => {
    const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
      default: string;
    };
    const memoMatch = src.default.match(
      /const availableWidgets = useMemo\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\)/,
    );
    expect(memoMatch).not.toBeNull();
    expect(memoMatch![1]).toContain("worldSlug");
  });

  // Source-level regression guards for the sq-playtest 2026-04-09 fix:
  // the right tab group must land on `character`, not `audio`, and the
  // narrative panel must get focus on mount.
  describe("initial active-panel state (Dockview layout drift fix)", () => {
    it("character is the first entry in rightGroupOrder", async () => {
      const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
        default: string;
      };
      // Match the literal array declaration with whitespace tolerance.
      const arrayMatch = src.default.match(
        /rightGroupOrder:\s*WidgetId\[\]\s*=\s*\[([\s\S]*?)\]/
      );
      expect(arrayMatch).not.toBeNull();
      const firstEntry = arrayMatch![1]
        .split(",")
        .map((s) => s.trim().replace(/["']/g, ""))
        .filter((s) => s.length > 0)[0];
      expect(firstEntry).toBe("character");
    });

    it("GameBoard explicitly activates rightFirst (character tab)", async () => {
      // Without this call, dockview activates the last-added panel, which
      // meant the right group landed on `audio` on every fresh game load.
      // (Renamed from `api.setActivePanel(rightFirst)` to
      // `rightFirst.api.setActive()` in commit 7490fb1.)
      const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
        default: string;
      };
      expect(src.default).toContain("rightFirst.api.setActive()");
    });

    it("GameBoard focuses the narrative panel on mount", async () => {
      const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
        default: string;
      };
      expect(src.default).toContain("narrative.focus()");
    });
  });

  // Regression guard for sq-playtest 2026-05-16 [BUG] party-panel peer label
  // stays "ACTING" after that peer submits (observer tab). CharacterPanel was
  // a third seal-state consumer fed a loose, length-gated `submittedPlayerIdSet`
  // (every turnStatusEntry player_id) while PeerRevealList read the precise
  // `sealedPlayerIds` (status submitted/auto_resolved). The two diverged on an
  // observer tab — banner correct, party panel stale. The fix makes both
  // consumers read the SAME authoritative set; the loose memo was deleted.
  describe("seal-state consumers share one authoritative set", () => {
    it("submittedPlayerIdSet memo is deleted (no loose seal set survives)", async () => {
      const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
        default: string;
      };
      // Allowed only inside the explanatory history comment, never as a
      // `const ... = useMemo` declaration.
      expect(src.default).not.toMatch(/const\s+submittedPlayerIdSet\s*=/);
    });

    it("CharacterPanel is fed sealedPlayerIds (gated), the same set PeerRevealList reads", async () => {
      const src = (await import("@/components/GameBoard/GameBoard?raw")) as unknown as {
        default: string;
      };
      // CharacterWidget gets the authoritative set, length-gated so solo
      // keeps its activePlayerId fallback.
      expect(src.default).toMatch(
        /submittedPlayerIds=\{\s*\(characters\?\.length \?\? 0\) > 1 \? sealedPlayerIds : undefined\s*\}/,
      );
      // PeerRevealList still reads the identical source of truth.
      expect(src.default).toMatch(/sealedPlayerIds=\{sealedPlayerIds\}/);
    });
  });

  it("deleted files do not exist (GameLayout, OverlayManager, SettingsOverlay, presetLayouts)", async () => {
    const tryImport = async (path: string) => {
      try {
        await import(path);
        return true;
      } catch {
        return false;
      }
    };
    expect(await tryImport("@/components/GameLayout")).toBe(false);
    expect(await tryImport("@/components/OverlayManager")).toBe(false);
    expect(await tryImport("@/components/SettingsOverlay")).toBe(false);
    // react-grid-layout preset system removed after dockview migration —
    // presetLayouts.ts was orphaned dead code (no runtime consumers).
    expect(await tryImport("@/components/GameBoard/presetLayouts")).toBe(false);
  });
});
