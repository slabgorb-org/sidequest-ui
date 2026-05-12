import { describe, it, expect } from "vitest";
import { rewriteCdnUrl } from "@/audio/cdnProxy";

describe("rewriteCdnUrl", () => {
  it("rewrites cdn.slabgorb.com URLs to the same-origin /audio-cdn proxy", () => {
    expect(
      rewriteCdnUrl("https://cdn.slabgorb.com/genre_packs/caverns_and_claudes/audio/music/exploration_4.ogg"),
    ).toBe("/audio-cdn/genre_packs/caverns_and_claudes/audio/music/exploration_4.ogg");
  });

  it("preserves the path verbatim (including query strings)", () => {
    expect(
      rewriteCdnUrl("https://cdn.slabgorb.com/genre_packs/x/audio/music/y.ogg?v=2"),
    ).toBe("/audio-cdn/genre_packs/x/audio/music/y.ogg?v=2");
  });

  it("does not rewrite same-origin paths (already-proxied or static-mount URLs)", () => {
    expect(rewriteCdnUrl("/audio-cdn/genre_packs/x.ogg")).toBe(
      "/audio-cdn/genre_packs/x.ogg",
    );
    expect(rewriteCdnUrl("/genre/caverns_and_claudes/audio/music/x.ogg")).toBe(
      "/genre/caverns_and_claudes/audio/music/x.ogg",
    );
  });

  it("does not rewrite other origins (defensive — only the slabgorb CDN needs proxying)", () => {
    expect(rewriteCdnUrl("https://example.com/x.ogg")).toBe("https://example.com/x.ogg");
    expect(rewriteCdnUrl("http://localhost:5173/x.ogg")).toBe("http://localhost:5173/x.ogg");
  });

  it("is idempotent — re-applying does not double-rewrite", () => {
    const once = rewriteCdnUrl("https://cdn.slabgorb.com/x.ogg");
    expect(rewriteCdnUrl(once)).toBe(once);
  });
});
