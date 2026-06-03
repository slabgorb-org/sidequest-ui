/**
 * Cross-origin CDN proxy rewriter.
 *
 * Audio fetched by `AudioCache.getBuffer` uses `fetch()`, which enforces CORS
 * on cross-origin responses. Historically the R2 bucket at `cdn.slabgorb.com`
 * served no permissive `Access-Control-Allow-Origin` header, so fetches from
 * the playgroup's `player[1-4].local:5173` origins failed — silently breaking
 * music for every player except the host on `localhost` (playtest 2026-05-12:
 * Donut on player2.local, Katia on player3.local).
 *
 * The fix below routes audio fetches through the Vite dev server's same-origin
 * `/audio-cdn/` proxy, configured in `vite.config.ts` to forward to
 * `https://cdn.slabgorb.com`. The browser sees a same-origin response
 * (no CORS preflight), and Vite reads from R2 on its own behalf where
 * there is no Origin header to fail.
 *
 * NOTE (2026-06-03, story 65-15): the bucket now *does* serve
 * `access-control-allow-origin: *` (verified live), so direct cross-origin
 * fetches succeed today — this is what lets the self-hosted `@font-face` URLs
 * point straight at the CDN. This same-origin proxy is therefore no longer
 * strictly required for audio, but is retained as belt-and-suspenders so audio
 * never depends on the CORS header staying in place. Removing it is a separate
 * cleanup, not part of 65-15.
 *
 * Images (`<img src>`) are not affected by CORS for display, so this
 * rewrite is scoped to audio only — change the call site, not the wire
 * URL the server emits. Image URLs continue to point at the CDN directly.
 */

const CDN_ORIGIN = "https://cdn.slabgorb.com";
const PROXY_PREFIX = "/audio-cdn";

/**
 * Rewrite a `cdn.slabgorb.com` URL to the same-origin Vite proxy path.
 *
 * Non-CDN URLs (absolute or relative) pass through unchanged so callers
 * can apply this rewrite unconditionally without breaking server-served
 * paths (e.g. `/genre/...` static mount) or already-rewritten URLs.
 */
export function rewriteCdnUrl(url: string): string {
  if (url.startsWith(CDN_ORIGIN)) {
    return PROXY_PREFIX + url.slice(CDN_ORIGIN.length);
  }
  return url;
}
