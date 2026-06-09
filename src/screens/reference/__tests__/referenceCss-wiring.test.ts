/**
 * Wiring guard for the reference stylesheet (2026-06-09 regression).
 *
 * Epic 100's /reference/* SPA shipped with `src/styles/reference.css`
 * orphaned — never committed, never imported — so the 100-12 server cutover
 * (which deleted the old styled HTML path) left the lore/rules pages raw
 * unstyled HTML. Classname-present ≠ stylesheet-loaded: the components and
 * their tests were green the whole time.
 *
 * Two pins, same idiom as MapWidget.test.tsx's "wiring — imports" block:
 *   1. ReferenceDocument (the shell every reference page renders through)
 *      imports the stylesheet.
 *   2. The stylesheet actually defines the shell's root classname, so the
 *      import can't be satisfied by an empty/renamed file.
 */
import { describe, it, expect } from "vitest";

describe("reference stylesheet wiring", () => {
  it("ReferenceDocument imports @/styles/reference.css", async () => {
    const src = (await import("../ReferenceDocument.tsx?raw")) as unknown as {
      default: string;
    };
    expect(src.default).toContain('import "@/styles/reference.css"');
  });

  it("reference.css defines the .reference-document shell rules", async () => {
    const css = (await import("@/styles/reference.css?raw")) as unknown as {
      default: string;
    };
    expect(css.default).toContain(".reference-document");
    expect(css.default).toContain(".reference-document--loading");
    expect(css.default).toContain(".reference-document--error");
  });
});
