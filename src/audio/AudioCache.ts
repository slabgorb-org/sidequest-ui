import { rewriteCdnUrl } from "./cdnProxy";

/**
 * Caches decoded AudioBuffers to avoid redundant fetch + decode cycles.
 */
export class AudioCache {
  private cache: Map<string, AudioBuffer> = new Map();

  async getBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    // Route cdn.slabgorb.com fetches through the same-origin Vite proxy so
    // non-localhost playgroup origins (player[1-4].local:5173) don't trip
    // CORS — see ./cdnProxy.ts for the why. Cache keyed by the rewritten
    // URL so subsequent same-track plays hit the same entry.
    const fetchUrl = rewriteCdnUrl(url);
    const cached = this.cache.get(fetchUrl);
    if (cached) return cached;

    const response = await fetch(fetchUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.cache.set(fetchUrl, audioBuffer);
    return audioBuffer;
  }
}
