import { useState } from "react";

/**
 * Interactive Fate chargen renderers (ADR-144 F4a3 / story 121-8).
 *
 * Three server-driven panels, one per `input_type` (fate_aspects /
 * fate_skill_pyramid / fate_stunts). Each MIRRORS the server payload and submits
 * a per-step confirm; the server (validate_fate_sheet) stays the validation
 * authority — these panels preview and submit, they never adjudicate
 * (No Silent Fallbacks). Mechanics-first legibility (Sebastien/Jade): the ladder,
 * the rung labels, and the refresh math are on screen. No auto-commit (Alex):
 * an explicit confirm is the only way forward.
 *
 * Keyed by scene in CharacterCreation so local edit state re-initializes per step.
 */

export interface FateAspectSlot {
  kind: string;
  label: string;
  value?: string;
  required?: boolean;
  suggestion?: string;
}

export interface FateStuntOption {
  name: string;
  description?: string;
}

type Respond = (payload: Record<string, unknown>) => void;

const WRAP =
  "flex flex-col items-center px-6 py-10 gap-6 max-w-2xl mx-auto";
const PROMPT = "text-lg leading-relaxed italic text-foreground/90 max-w-prose";
const CONFIRM_BTN =
  "inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90";
const FIELD =
  "w-full rounded-md border border-border/60 bg-card/50 px-3 py-2 text-sm";

// ---------------------------------------------------------------------------
// fate_aspects
// ---------------------------------------------------------------------------

export function FateAspectsPanel({
  prompt,
  slots,
  onRespond,
}: {
  prompt?: string;
  slots: FateAspectSlot[];
  onRespond: Respond;
}) {
  const hcSlot = slots.find((s) => s.kind === "high_concept");
  const troubleSlot = slots.find((s) => s.kind === "trouble");
  const freeSlots = slots.filter(
    (s) => s.kind !== "high_concept" && s.kind !== "trouble",
  );
  // `value` is the player's own text (empty on first visit); `suggestion` is the
  // pack default. HC/Trouble seed ONLY from `value` and render the pack default as
  // a PLACEHOLDER — never as a pre-filled accept-on-submit value — so a player who
  // just clicks Confirm submits empty strings and the server re-prompts loud
  // (chargen_mixin requires both non-empty) instead of silently shipping the genre
  // default sheet. Returning to the step restores the player's prior `value`. Free
  // aspects carry no pack default, so seeding from `value` covers them too.
  const seed = (s?: FateAspectSlot) => s?.value ?? "";

  const [hc, setHc] = useState(seed(hcSlot));
  const [trouble, setTrouble] = useState(seed(troubleSlot));
  const [free, setFree] = useState<string[]>(freeSlots.map(seed));

  const setFreeAt = (i: number, v: string) =>
    setFree((prev) => prev.map((x, j) => (j === i ? v : x)));

  return (
    <div data-testid="character-creation" className={WRAP}>
      <p className={PROMPT}>{prompt}</p>
      <div className="flex flex-col gap-4 w-full max-w-prose">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">High Concept *</span>
          <input
            data-testid="fate-aspect-high_concept"
            className={FIELD}
            value={hc}
            placeholder={hcSlot?.suggestion}
            onChange={(e) => setHc(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Trouble *</span>
          <input
            data-testid="fate-aspect-trouble"
            className={FIELD}
            value={trouble}
            placeholder={troubleSlot?.suggestion}
            onChange={(e) => setTrouble(e.target.value)}
          />
        </label>
        {freeSlots.map((slot, i) => (
          <label key={i} className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{slot.label}</span>
            <input
              data-testid={`fate-aspect-free-${i}`}
              className={FIELD}
              value={free[i] ?? ""}
              placeholder={slot.suggestion}
              onChange={(e) => setFreeAt(i, e.target.value)}
            />
          </label>
        ))}
      </div>
      <button
        data-testid="fate-aspects-confirm"
        className={CONFIRM_BTN}
        onClick={() =>
          onRespond({
            phase: "fate_aspects_confirm",
            fate_high_concept: hc,
            fate_trouble: trouble,
            fate_free_aspects: free.filter((x) => x.trim() !== ""),
          })
        }
      >
        Confirm Aspects
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// fate_skill_pyramid
// ---------------------------------------------------------------------------

export function FateSkillPyramidPanel({
  prompt,
  availableSkills,
  apexRating,
  pyramid,
  ladderLabels,
  currentAllocation,
  legal,
  violations,
  onRespond,
}: {
  prompt?: string;
  availableSkills: string[];
  apexRating: number;
  pyramid: number[];
  ladderLabels: Record<string, string>;
  currentAllocation: Record<string, number>;
  legal: boolean;
  violations: string[];
  onRespond: Respond;
}) {
  const [allocation, setAllocation] = useState<Record<string, number>>({
    ...currentAllocation,
  });
  // The `legal`/`violations` props are the server's verdict for the INITIAL
  // allocation; the live mirror isn't re-fetched per change (no preview
  // round-trip is wired). Once the player edits, those props are stale — and
  // we must NOT recompute legality client-side (the panel mirrors the server,
  // it does not adjudicate — No Silent Fallbacks). So after the first edit we
  // stop showing the stale verdict and defer to the server's authority on
  // Confirm (which re-validates and re-prompts). The per-rung counters below
  // carry the live shape signal in the meantime. (playtest [FATE/UX-LOW])
  const [edited, setEdited] = useState(false);

  const ratings = Array.from({ length: apexRating }, (_, i) => apexRating - i); // apex..1
  const labelFor = (r: number) => ladderLabels[String(r)] ?? ladderLabels[r] ?? `+${r}`;
  // Per-rung budget: pyramid[i] skills sit at rating (apexRating - i). The math on
  // screen (mechanics-first): how many skills go at each rung, and how many remain.
  const budgetFor = (r: number) => pyramid[apexRating - r] ?? 0;
  const placedAt = (r: number) =>
    Object.values(allocation).filter((rating) => rating === r).length;

  const setRating = (skill: string, rating: number) => {
    setEdited(true);
    setAllocation((prev) => ({ ...prev, [skill]: rating }));
  };

  const placed = Object.fromEntries(
    Object.entries(allocation).filter(([, r]) => r > 0),
  );

  return (
    <div data-testid="character-creation" className={WRAP}>
      <p className={PROMPT}>{prompt}</p>

      {/* Ladder legend with per-rung budgets — the math on screen (each adjective
          once): "place N skills at this rung; M remaining". */}
      <div data-testid="fate-ladder" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {ratings.map((r) => (
          <span key={r} data-testid={`fate-rung-${r}`}>
            {labelFor(r)} (+{r}): {placedAt(r)}/{budgetFor(r)}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2 w-full max-w-prose">
        {availableSkills.map((skill) => (
          <div
            key={skill}
            className="flex items-center justify-between rounded-lg border border-border/40 bg-card/50 px-4 py-2"
          >
            <span className="font-medium">{skill}</span>
            <select
              aria-label={`Rating for ${skill}`}
              data-testid={`fate-skill-${skill}`}
              value={allocation[skill] ?? 0}
              onChange={(e) => setRating(skill, Number(e.target.value))}
              className="rounded-md border border-border/60 bg-card/50 px-2 py-1 text-sm tabular-nums"
            >
              <option value={0}>—</option>
              {ratings.map((r) => (
                <option key={r} value={r}>
                  +{r}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <p
        data-testid="fate-pyramid-legality"
        className={`text-sm ${
          edited ? "text-muted-foreground" : legal ? "text-emerald-500" : "text-destructive"
        }`}
      >
        {edited
          ? "Match each rung to its budget above, then Confirm to validate."
          : legal
            ? "Legal pyramid"
            : violations.join("; ")}
      </p>

      <button
        data-testid="fate-pyramid-confirm"
        className={CONFIRM_BTN}
        onClick={() =>
          onRespond({ phase: "fate_pyramid_confirm", fate_allocation: placed })
        }
      >
        Confirm Pyramid
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// fate_stunts
// ---------------------------------------------------------------------------

export function FateStuntsPanel({
  prompt,
  stunts,
  selectedStunts,
  freeStunts,
  baseRefresh,
  onRespond,
}: {
  prompt?: string;
  stunts: FateStuntOption[];
  selectedStunts: string[];
  freeStunts: number;
  baseRefresh: number;
  onRespond: Respond;
}) {
  const [selected, setSelected] = useState<string[]>([...selectedStunts]);

  const toggle = (name: string) =>
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  // Live refresh readout (the gear-model invariant, mirrored): base minus one
  // per stunt over the free allotment, floored at 1.
  const currentRefresh = Math.max(
    1,
    baseRefresh - Math.max(0, selected.length - freeStunts),
  );

  return (
    <div data-testid="character-creation" className={WRAP}>
      <p className={PROMPT}>{prompt}</p>
      <div className="flex flex-col gap-2 w-full max-w-prose">
        {stunts.map((stunt, i) => (
          <div
            key={stunt.name}
            role="button"
            tabIndex={0}
            data-testid={`fate-stunt-${i}`}
            aria-pressed={selected.includes(stunt.name)}
            data-selected={selected.includes(stunt.name)}
            onClick={() => toggle(stunt.name)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") toggle(stunt.name);
            }}
            className={`cursor-pointer rounded-lg border px-4 py-3 transition-all duration-150 ${
              selected.includes(stunt.name)
                ? "border-primary bg-primary/10 ring-2 ring-primary/50"
                : "border-border/40 bg-card/50 hover:bg-card/80"
            }`}
          >
            <span className="font-medium">{stunt.name}</span>
            {stunt.description && (
              <span className="block text-sm text-muted-foreground mt-0.5">
                {stunt.description}
              </span>
            )}
          </div>
        ))}
      </div>
      <p data-testid="fate-refresh" className="text-sm text-muted-foreground">
        Refresh: <span className="tabular-nums font-medium">{currentRefresh}</span>
      </p>
      <button
        data-testid="fate-stunts-confirm"
        className={CONFIRM_BTN}
        onClick={() =>
          onRespond({ phase: "fate_stunts_confirm", fate_selected_stunts: selected })
        }
      >
        Confirm Stunts
      </button>
    </div>
  );
}
