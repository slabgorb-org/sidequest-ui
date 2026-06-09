/**
 * Story 100-10 (Phase 3, RED) — deletion guard for the legacy layout module.
 *
 * The split-brain ends by DELETING `src/lib/cartographyLayout.ts` (the verbatim
 * TS port of `reference_map.py`) once both surfaces render through the shared
 * <CartographyMap>. This guard fails LOUDLY until that file is gone, so the
 * story can't be called done while the dead duplicate still ships.
 *
 * Behavioral, not a source-text grep: it asks the module system to resolve the
 * module and asserts the resolution REJECTS (module absent). It also asserts the
 * sole production consumer — MapOverlay — no longer pulls a symbol from it.
 *
 * RED reason NOW: `@/lib/cartographyLayout` still exists and MapOverlay still
 * imports `computeCartographyLayout` / `NODE_R` from it, so both assertions
 * below fail. They go green only after Dev migrates MapOverlay to the shared
 * component and deletes the legacy module (and its `cartographyLayout.test.ts`).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// repo-root/src/components/map/__tests__ → repo-root/src
const SRC = resolve(HERE, "..", "..", "..");

describe("legacy cartographyLayout module is deleted", () => {
  it("no longer resolves as an importable module", async () => {
    // Dynamic import so the missing module is a runtime rejection, not a
    // collect-time error for this file. The specifier is built at runtime
    // (not a string literal) so vite's `import-analysis` plugin does not try to
    // statically resolve `@/lib/cartographyLayout` at transform time — which
    // would fail the whole suite to collect instead of rejecting here. Vite's
    // runtime resolver still maps the `@/` alias, so a deleted module rejects.
    const spec = ["@", "lib", "cartographyLayout"].join("/");
    await expect(import(/* @vite-ignore */ spec)).rejects.toThrow();
  });

  it("MapOverlay no longer imports from the legacy layout module", () => {
    // The one production consumer must have moved to the shared component.
    const overlay = readFileSync(resolve(SRC, "components/MapOverlay.tsx"), "utf8");
    expect(overlay).not.toMatch(/lib\/cartographyLayout/);
    expect(overlay).not.toMatch(/computeCartographyLayout/);
  });
});
