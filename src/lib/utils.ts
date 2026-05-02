import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// crypto.randomUUID() is only defined in secure contexts (HTTPS / localhost).
// Multiplayer playtests use plain HTTP hosts-file aliases (player1.local etc.),
// where it is undefined. crypto.getRandomValues is available everywhere.
export function makeRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" + hex.slice(4, 6).join("") +
    "-" + hex.slice(6, 8).join("") +
    "-" + hex.slice(8, 10).join("") +
    "-" + hex.slice(10, 16).join("")
  );
}

export function toRoman(n: number): string {
  const pairs: [number, string][] = [[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
  let result = '';
  for (const [value, numeral] of pairs) {
    while (n >= value) { result += numeral; n -= value; }
  }
  return result;
}
