import { useEffect, useRef, useState } from "react";
import {
  CENTERED_LOADERS,
  GENRE_LOADERS,
  type LoaderId,
} from "./GenreLoader.constants";
import "@/styles/genre-loaders.css";

/**
 * Narration-pause divider, one of two per genre, randomised per mount.
 *
 * Sixteen loaders total (8 genres × 2), ported pixel-faithfully from the
 * design handoff "Sixteen Quiet Marks" (v3 LOCKED). Each loader sits in a
 * 400×100 stage and is tuned to read on its genre's authentic background.
 *
 * For genres without a designed loader (road_warrior, spaghetti_western,
 * heavy_metal), the parent ThinkingIndicator renders its default diamond
 * triplet — this component is not rendered. See NarrationShared.tsx.
 */
export interface GenreLoaderProps {
  genre: string;
  className?: string;
}

export function GenreLoader({ genre, className }: GenreLoaderProps) {
  const pair = GENRE_LOADERS[genre];
  // Pick once per mount. Each "narrator is thinking" beat mounts a fresh
  // indicator (parents render this conditionally on `thinking`), so the loader
  // rotates naturally turn-to-turn without an external scheduler. Random pick
  // happens in an effect (not render) to satisfy react-hooks/purity — the
  // first paint shows pair[0], then a re-render picks one of the two at
  // random. Acceptable for a transient thinking indicator.
  const [id, setId] = useState<LoaderId>(pair[0]);
  useEffect(() => {
    setId(pair[Math.floor(Math.random() * pair.length)]);
  }, [pair]);

  const stageClasses = `gl-stage${CENTERED_LOADERS.has(id) ? " gl-center" : ""}${className ? ` ${className}` : ""}`;

  return <div className={stageClasses}>{renderLoader(id)}</div>;
}

function renderLoader(id: LoaderId) {
  switch (id) {
    case "tea-rule":   return <TeaRule />;
    case "tea-trail":  return <TeaTrail />;
    case "cav-spell":  return <CavSpell />;
    case "cav-room":   return <CavRoom />;
    case "wst-bar":    return <WstBar />;
    case "wst-wave":   return <WstWave />;
    case "so-hud":     return <SoHud />;
    case "so-hyper":   return <SoHyper />;
    case "ele-brush":  return <EleBrush />;
    case "ele-ripple": return <EleRipple />;
    case "lf-quill":   return <LfQuill />;
    case "lf-initial": return <LfInitial />;
    case "neon-ascii": return <NeonAscii />;
    case "neon-hex":   return <NeonHex />;
    case "noir-type":  return <NoirType />;
    case "noir-redact":return <NoirRedact />;
  }
}

/* ─────────────────────────── TEA & MURDER ─────────────────────────── */

function TeaRule() {
  return (
    <div className="l-tea-rule">
      <svg viewBox="0 0 360 24" width="100%" height="24" preserveAspectRatio="none">
        <path d="M2 12 Q 90 8 180 12 T 358 12" />
      </svg>
    </div>
  );
}

function TeaTrail() {
  return (
    <div className="l-tea-trail">
      <svg viewBox="0 0 400 100" preserveAspectRatio="none">
        <path d="M30 60 C 90 30, 140 80, 200 50 S 320 30, 360 60" />
      </svg>
      <div className="glyph" style={{ left: 360, top: "50%", transform: "translate(-50%, -50%)" }}>
        ❧
      </div>
    </div>
  );
}

/* ─────────────────────────── CAVERNS & CLAUDES ─────────────────────────── */

const SPELL_WORDS = ["Ignis", "Lumen", "Glyph", "Ventus", "Aegis"];
const SPELL_STAGGER_MS = 110;
const SPELL_HOLD_MS = 1400;
const SPELL_OUT_MS = 540;
const SPELL_IN_ANIM_MS = 720;

function CavSpell() {
  const elRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let wordIdx = 0;
    let cancelled = false;

    const clearTimers = () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };

    const show = (word: string) => {
      if (cancelled || !el) return;
      el.innerHTML = "";
      const chars: HTMLSpanElement[] = [];
      for (const ch of word) {
        const span = document.createElement("span");
        span.className = "ch";
        span.textContent = ch;
        el.appendChild(span);
        chars.push(span);
      }
      chars.forEach((sp, k) => {
        timersRef.current.push(
          window.setTimeout(() => sp.classList.add("in"), k * SPELL_STAGGER_MS),
        );
      });
      const inDur = chars.length * SPELL_STAGGER_MS + SPELL_IN_ANIM_MS;
      timersRef.current.push(
        window.setTimeout(() => {
          chars.forEach((sp) => {
            sp.classList.remove("in");
            sp.classList.add("out");
          });
        }, inDur + SPELL_HOLD_MS),
      );
      timersRef.current.push(
        window.setTimeout(() => {
          wordIdx = (wordIdx + 1) % SPELL_WORDS.length;
          show(SPELL_WORDS[wordIdx]);
        }, inDur + SPELL_HOLD_MS + SPELL_OUT_MS),
      );
    };

    show(SPELL_WORDS[0]);
    return () => {
      cancelled = true;
      clearTimers();
    };
  }, []);

  return <div ref={elRef} className="l-cav-spell" />;
}

function CavRoom() {
  return (
    <div className="l-cav-room">
      <svg viewBox="0 0 400 100" preserveAspectRatio="none">
        {/* room walls: top-left, top-right (with door gap), right top half,
            right bottom half (with door gap), bottom + left */}
        <path
          className="walls"
          pathLength={100}
          d="M170 20 L190 20 M200 20 L230 20 L230 40 M230 50 L230 80 L170 80 L170 20"
        />
        {/* door 1 — top wall, swings into the room */}
        <g className="door d1">
          <path pathLength={100} d="M190 20 L190 28" />
          <path pathLength={100} d="M200 20 L200 28" />
          <path pathLength={100} d="M190 28 A 5 5 0 0 1 200 28" />
        </g>
        {/* door 2 — right wall, swings outward */}
        <g className="door d2">
          <path pathLength={100} d="M230 40 L238 40" />
          <path pathLength={100} d="M230 50 L238 50" />
          <path pathLength={100} d="M238 40 A 5 5 0 0 0 238 50" />
        </g>
      </svg>
    </div>
  );
}

/* ─────────────────────────── MUTANT WASTELAND ─────────────────────────── */

function WstBar() {
  return <div className="l-wst-bar" />;
}

function WstWave() {
  return (
    <div className="l-wst-wave">
      <div className="baseline" />
      <svg viewBox="0 0 800 100" preserveAspectRatio="none">
        <path d="M0 50 L80 50 L80 30 L92 30 L92 50 L160 50 L160 18 L174 18 L174 50 L260 50 L260 38 L272 38 L272 50 L360 50 L360 22 L374 22 L374 50 L460 50 L460 30 L472 30 L472 50 L560 50 L560 14 L574 14 L574 50 L660 50 L660 38 L674 38 L674 50 L800 50" />
      </svg>
    </div>
  );
}

/* ─────────────────────────── SPACE OPERA ─────────────────────────── */

const HUD_CHARS = "0123456789AB";

function SoHud() {
  const [count, setCount] = useState("0B");
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      n++;
      const a = HUD_CHARS[n % HUD_CHARS.length];
      const b = HUD_CHARS[(n * 3 + 1) % HUD_CHARS.length];
      setCount(a + b);
    }, 140);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="l-so-hud">
      <svg width="360" height="72" viewBox="0 0 360 72">
        <rect x="1" y="1" width="358" height="70" fill="none" stroke="#E8A838" strokeWidth="1.2" rx="4" />
        <g stroke="#E8A838" strokeWidth="1" fill="none" opacity="0.95">
          <line x1="1"   y1="1"  x2="180" y2="28" />
          <line x1="359" y1="1"  x2="180" y2="28" />
          <line x1="1"   y1="14" x2="160" y2="30" />
          <line x1="359" y1="14" x2="200" y2="30" />
          <line x1="40"  y1="1"  x2="168" y2="30" />
          <line x1="320" y1="1"  x2="192" y2="30" />
          <line x1="1"   y1="71" x2="180" y2="44" />
          <line x1="359" y1="71" x2="180" y2="44" />
          <line x1="1"   y1="58" x2="160" y2="42" />
          <line x1="359" y1="58" x2="200" y2="42" />
          <line x1="40"  y1="71" x2="168" y2="42" />
          <line x1="320" y1="71" x2="192" y2="42" />
          <rect x="160" y="28" width="40" height="18" />
          <line x1="100" y1="68" x2="100" y2="56" />
          <line x1="260" y1="68" x2="260" y2="56" />
          <line x1="100" y1="4"  x2="100" y2="16" />
          <line x1="260" y1="4"  x2="260" y2="16" />
        </g>
        <g stroke="#FF3030" strokeWidth="1.6" opacity="0.95">
          <line x1="176" y1="2"  x2="176" y2="70" />
          <line x1="184" y1="2"  x2="184" y2="70" />
        </g>
        <g className="reticle" stroke="#FF3030" strokeWidth="1.2" fill="none">
          <circle cx="180" cy="36" r="6" />
          <line x1="170" y1="36" x2="178" y2="36" />
          <line x1="182" y1="36" x2="190" y2="36" />
        </g>
        <g className="scan">
          <circle cx="180" cy="36" r="2" fill="#E8A838" />
        </g>
      </svg>
      <div className="readout">
        <b>00</b> <b>11</b> <b>{count}</b>
      </div>
    </div>
  );
}

const HYPER_STREAK_COUNT = 36;

function SoHyper() {
  // Initial render lays down a deterministic ring (uniform angles, uniform
  // duration) — looks like a regular pulsing aperture. After mount the effect
  // mutates each streak's inline style directly to apply random angle jitter
  // and per-streak delay/duration, giving the chaotic warp look from the
  // design. We mutate DOM via ref rather than setState to avoid the
  // react-hooks/set-state-in-effect lint; the visual swap happens before the
  // browser paints, so users don't see the deterministic phase.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ctr = containerRef.current;
    if (!ctr) return;
    const streaks = ctr.querySelectorAll<HTMLElement>(":scope > i");
    streaks.forEach((s, i) => {
      const angle = (i / HYPER_STREAK_COUNT) * 360 + (Math.random() - 0.5) * 6;
      s.style.transform = `rotate(${angle}deg)`;
      s.style.animationDelay = `${-Math.random() * 1.4}s`;
      s.style.animationDuration = `${1.0 + Math.random() * 0.8}s`;
    });
  }, []);

  return (
    <div className="l-so-hyper" ref={containerRef}>
      <div className="core" />
      {Array.from({ length: HYPER_STREAK_COUNT }, (_, i) => (
        <i
          key={i}
          style={{
            transform: `rotate(${(i / HYPER_STREAK_COUNT) * 360}deg)`,
            animationDelay: `${-((i / HYPER_STREAK_COUNT) * 1.4)}s`,
            animationDuration: "1.4s",
          }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────── ELEMENTAL HARMONY ─────────────────────────── */

function EleBrush() {
  return (
    <div className="l-ele-brush">
      <svg viewBox="0 0 400 100" preserveAspectRatio="none">
        <path className="s" d="M20 60 C 100 20, 180 80, 280 40 Q 320 22, 360 50" />
      </svg>
      <div className="seal" />
    </div>
  );
}

function EleRipple() {
  return (
    <div className="l-ele-ripple">
      <div className="baseline" />
      <div className="drop" />
      <div className="drop" />
      <div className="drop" />
    </div>
  );
}

/* ─────────────────────────── LOW FANTASY ─────────────────────────── */

function LfQuill() {
  return (
    <div className="l-lf-quill">
      <div className="line" />
      <div className="ink" />
      <div className="nib" />
    </div>
  );
}

// Letters cycled by the illuminated-initial loader. Animation period is 3.8s,
// which is when the previous letter fades out and a new one fades in.
const INITIAL_LETTERS = ["M", "A", "S", "T", "E", "H", "R"];
const INITIAL_PERIOD_MS = 3800;

function LfInitial() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % INITIAL_LETTERS.length),
      INITIAL_PERIOD_MS,
    );
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="l-lf-initial">
      <div className="frame" />
      <div className="letter">{INITIAL_LETTERS[idx]}</div>
    </div>
  );
}

/* ─────────────────────────── NEON DYSTOPIA ─────────────────────────── */

const ASCII_WIDTH = 20;
const ASCII_CYCLE_FRAMES = 60;
const ASCII_FILLED = "█";
const ASCII_EMPTY = "░";
const ASCII_GLITCH = ["▓", "▒", "░", "█"] as const;

function NeonAscii() {
  const [text, setText] = useState(`[${ASCII_EMPTY.repeat(ASCII_WIDTH)}]`);
  useEffect(() => {
    let frame = 0;
    const id = window.setInterval(() => {
      frame++;
      const phase = (frame % ASCII_CYCLE_FRAMES) / ASCII_CYCLE_FRAMES;
      const fillN = Math.floor(phase * (ASCII_WIDTH + 1));
      let s = "";
      for (let i = 0; i < ASCII_WIDTH; i++) {
        if (i < fillN) {
          s += Math.random() < 0.07 ? ASCII_GLITCH[Math.floor(Math.random() * 4)] : ASCII_FILLED;
        } else {
          s += Math.random() < 0.04 ? ASCII_GLITCH[Math.floor(Math.random() * 4)] : ASCII_EMPTY;
        }
      }
      setText(`[${s}]`);
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="l-neon-ascii">
      <span className="label">SYS://BUFFER</span>
      <span>{text}</span>
    </div>
  );
}

const HEX_CHARS = "0123456789ABCDEF";
const HEX_TARGET = ["1F", "4A", "7C", "3E", "B2", "0D"] as const;
const HEX_CYCLE_FRAMES = 90;

function NeonHex() {
  const [parts, setParts] = useState<Array<{ resolved: boolean; value: string }>>(
    () => HEX_TARGET.map((t) => ({ resolved: false, value: t })),
  );
  useEffect(() => {
    let frame = 0;
    const id = window.setInterval(() => {
      frame = (frame + 1) % HEX_CYCLE_FRAMES;
      const phase = frame / HEX_CYCLE_FRAMES;
      const resolvedCount = Math.min(
        HEX_TARGET.length,
        Math.floor(phase * (HEX_TARGET.length + 2)),
      );
      setParts(
        HEX_TARGET.map((t, i) => {
          if (i < resolvedCount) return { resolved: true, value: t };
          return {
            resolved: false,
            value:
              HEX_CHARS[Math.floor(Math.random() * 16)] +
              HEX_CHARS[Math.floor(Math.random() * 16)],
          };
        }),
      );
    }, 75);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="l-neon-hex">
      <span className="label">DECRYPT://PAYLOAD</span>
      <span>
        {"0x "}
        {parts.map((p, i) => (
          <span key={i}>
            <span className={p.resolved ? "resolved" : undefined}>{p.value}</span>
            {i < parts.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </div>
  );
}

/* ─────────────────────────── PULP NOIR ─────────────────────────── */

const NOIR_LINES = [
  "A QUIET DRINK",
  "NO NAMES TONIGHT",
  "THE LAST TRAIN OUT",
];
const NOIR_HOLD_TICKS = 18;

function NoirType() {
  const [text, setText] = useState("");
  useEffect(() => {
    let li = 0, ci = 0, hold = 0;
    let mode: "type" | "hold" | "erase" = "type";
    const id = window.setInterval(() => {
      const line = NOIR_LINES[li];
      if (mode === "type") {
        ci++;
        if (ci >= line.length) { mode = "hold"; hold = 0; }
      } else if (mode === "hold") {
        hold++;
        if (hold > NOIR_HOLD_TICKS) mode = "erase";
      } else {
        ci--;
        if (ci <= 0) { mode = "type"; li = (li + 1) % NOIR_LINES.length; }
      }
      setText(line.slice(0, ci));
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="l-noir-type">
      <span className="label">CASE NOTE / 22:14</span>
      <span>
        <span>{text}</span>
        <span className="cur" />
      </span>
    </div>
  );
}

// Five redacted bars with the design's hand-picked widths. Staggered delays
// and alternating transform-origin (left/right) drive the breathing-bar
// scaleX in the keyframes.
const REDACT_BARS: ReadonlyArray<{ width: number; delay: number; origin: string }> = [
  { width:  80, delay: 0.00, origin: "left center"  },
  { width:  56, delay: 0.12, origin: "right center" },
  { width: 110, delay: 0.24, origin: "left center"  },
  { width:  44, delay: 0.36, origin: "right center" },
  { width:  96, delay: 0.48, origin: "left center"  },
];

function NoirRedact() {
  return (
    <div className="l-noir-redact">
      {REDACT_BARS.map((b, i) => (
        <i
          key={i}
          style={{
            width: `${b.width}px`,
            animationDelay: `${b.delay}s`,
            transformOrigin: b.origin,
          }}
        />
      ))}
    </div>
  );
}
