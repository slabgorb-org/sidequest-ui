import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Guards for the "all fonts from R2, zero Google Fonts" cutover (2026-06-03).
// jsdom doesn't fetch external CSS, so we verify the static sources by text:
//   - no fonts.googleapis.com / gstatic anywhere in the UI shell
//   - the self-hosted chrome fonts.css exists, is wired into index.css, and
//     sources its faces from the R2 CDN
//   - the dice tray loads its faces from R2, not the retired /public/fonts dir
// ---------------------------------------------------------------------------

const UI_ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(UI_ROOT, rel), "utf-8");

describe("no Google Fonts in the UI shell", () => {
  it("index.html has zero Google Fonts links/preconnects", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("the chrome fonts.css exists and self-hosts from R2 (no Google)", () => {
    const css = read("src/styles/fonts.css");
    expect(css).toMatch(/@font-face/);
    expect(css).toContain("https://cdn.slabgorb.com/genre_packs/assets/fonts/");
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    // The faces index.html used to load eagerly must be declared here.
    for (const family of [
      "EB Garamond",
      "Cinzel",
      "Pirata One",
      "Orbitron",
      "VT323",
    ]) {
      expect(css).toContain(`font-family: "${family}"`);
    }
  });

  it("index.css imports the chrome fonts.css", () => {
    const css = read("src/index.css");
    expect(css).toMatch(/@import\s+["']\.\/styles\/fonts\.css["']/);
  });

  it("the dice tray loads label faces from R2, not /public/fonts", () => {
    const src = read("src/dice/InlineDiceTray.tsx");
    expect(src).not.toMatch(/["'`]\/fonts\//);
    expect(src).toContain(
      "https://cdn.slabgorb.com/genre_packs/assets/fonts",
    );
  });
});
