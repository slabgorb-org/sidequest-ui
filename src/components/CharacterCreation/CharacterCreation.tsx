import { useState } from "react";
import { toRoman } from "@/lib/utils";
import { parseStatLine } from "./parseStatLine";
import { StatArrangePanel } from "./StatArrangePanel";
import { StoryPanel } from "./StoryPanel";

interface CreationChoice {
  label: string;
  description: string;
}

interface RolledStat {
  name: string;
  value: number;
}

export interface CreationScene {
  phase: string;
  scene_index?: number;
  total_scenes?: number;
  prompt?: string;
  summary?: string;
  message?: string;
  choices?: CreationChoice[];
  allows_freeform?: boolean;
  input_type?: string;
  loading_text?: string;
  character_preview?: Record<string, unknown>;
  rolled_stats?: RolledStat[];
  previous_choice?: number;
  previous_input?: string;
  // --- the_arrangement (stat_arrange input_type) ---
  pool?: number[];
  assignment?: Record<string, number | null>;
  class_requirements?: { name: string; requirement_label: string }[];
  qualifying_classes?: string[];
  confirm_enabled?: boolean;
  // --- the_story (story input_type) ---
  pronouns_options?: string[];
  pronouns_allow_freeform?: boolean;
  background_optional?: boolean;
  description_optional?: boolean;
  autogen_available?: boolean;
  autogen_result?: { background: string; description: string };
}

export interface CharacterCreationProps {
  scene: CreationScene | null;
  loading: boolean;
  onRespond: (payload: Record<string, unknown>) => void;
}

export function CharacterCreation({ scene, loading, onRespond }: CharacterCreationProps) {
  // React idiom: reset state during render when the identifying prop changes,
  // instead of useEffect → setState (which forces an extra render). When
  // `scene_index` or `phase` change, snap the local input/selection back to
  // whatever the scene was last given. See:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const sceneKey = scene ? `${scene.scene_index}-${scene.phase}` : null;
  const [lastSceneKey, setLastSceneKey] = useState<string | null>(sceneKey);
  const [inputValue, setInputValue] = useState(scene?.previous_input ?? "");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    scene?.previous_choice ?? null,
  );
  if (sceneKey !== lastSceneKey) {
    setLastSceneKey(sceneKey);
    setInputValue(scene?.previous_input ?? "");
    setSelectedIndex(scene?.previous_choice ?? null);
  }

  if (loading) {
    // Default copy used to read "Considering your words..." which implies
    // the player just typed something. After Create Character, no input
    // was submitted — the player is waiting for the narrator's opening
    // turn. "Waiting for the narrator..." is true regardless of which
    // chargen step we're between. Genre packs can override via
    // ``scene.loading_text``.
    //
    // The heartbeat dot is the "system is alive" cue — playtest 2026-04-24
    // flagged the all-text spinner as indistinguishable from a crash. Pulse
    // matches the in-game MultiplayerTurnBanner idiom (emerald, w-2 h-2).
    return (
      <div data-testid="character-creation">
        <div data-testid="creation-loading" role="status"
             className="flex items-center justify-center gap-2 min-h-[200px]">
          <span
            data-testid="chargen-heartbeat-dot"
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full shrink-0 bg-emerald-500 animate-pulse"
          />
          <p className="text-sm italic text-muted-foreground/50 animate-pulse">
            {scene?.loading_text ?? "Waiting for the narrator..."}
          </p>
        </div>
      </div>
    );
  }

  if (!scene) {
    return <div data-testid="character-creation" />;
  }

  const handleChoice = (index: number) => {
    setSelectedIndex(index);
    onRespond({ phase: "scene", choice: String(index + 1) });
  };

  const handleFreeform = () => {
    onRespond({ phase: "scene", choice: inputValue });
    setInputValue("");
  };

  const handleName = () => {
    onRespond({ phase: "scene", choice: inputValue });
    setInputValue("");
  };

  const handleConfirm = () => {
    onRespond({ phase: "confirmation", choice: "1" });
  };

  const handleContinue = () => {
    onRespond({ phase: "continue" });
  };

  const handleBack = () => {
    onRespond({ action: "back" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scene.input_type === "name") handleName();
    else handleFreeform();
  };

  if (scene.phase === "confirmation") {
    const previewEntries = scene.character_preview
      ? Object.entries(scene.character_preview)
      : [];

    return (
      <div data-testid="character-creation" className="flex flex-col items-center px-6 py-10 gap-6 max-w-2xl mx-auto">
        <h2 className="text-lg font-semibold tracking-tight">Your Character</h2>
        <div data-testid="character-review" className="bg-card/80 border border-border/50 rounded-lg p-6 w-full max-w-lg space-y-3">
          <div className="text-xs tracking-widest uppercase text-muted-foreground/60 mb-4">Character Sheet</div>
          {previewEntries.length > 0 ? (
            previewEntries.map(([key, value]) => {
              // Stats arrive from the server as a flat string like
              // "STR 10  DEX 7  CON 12  INT 17  WIS 5  CHA 11" — built in
              // sidequest-server/sidequest/server/dispatch/chargen_summary.py
              // ~line 193. Rendered as a single small horizontal line that
              // is dense and unscannable. Per CLAUDE.md playgroup notes:
              // Alex (slow reader) loses it at-a-glance and Sebastien
              // (mechanics-first) wants stats clearly visible. Detect the
              // stat-line shape and render as a 3-col label-above-value
              // mini-grid. Pure presentational — wire data shape unchanged.
              const parsedStats = parseStatLine(value);
              return (
                <div
                  key={key}
                  data-testid={`review-section-${key}`}
                  className="flex items-start py-2 px-2 -mx-2 rounded-md border-b border-border/20 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60">{key}</span>
                    {parsedStats ? (
                      <dl
                        data-testid="review-stats-grid"
                        className="grid grid-cols-3 gap-2 mt-2"
                      >
                        {parsedStats.map(([statName, statValue]) => (
                          <div
                            key={statName}
                            data-testid={`review-stat-${statName}`}
                            className="flex flex-col items-center rounded bg-background/40 border border-border/30 py-1.5"
                          >
                            <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                              {statName}
                            </dt>
                            <dd className="text-lg font-bold text-[var(--primary)] tabular-nums m-0">
                              {statValue}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-sm text-card-foreground">{String(value)}</p>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-card-foreground font-sans">{scene.summary}</div>
          )}
        </div>
        <p className="text-base italic text-foreground/80 max-w-prose">{scene.message}</p>
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            className="inline-flex items-center justify-center rounded-lg text-sm font-semibold h-11 px-8 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Create Character
          </button>
          <button
            onClick={handleBack}
            className="inline-flex items-center justify-center rounded-lg text-sm font-medium h-11 px-6 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (scene.input_type === "stat_arrange") {
    return (
      <div data-testid="character-creation" className="flex flex-col items-center px-6 py-10 gap-6 max-w-2xl mx-auto">
        <p className="text-lg leading-relaxed italic text-foreground/90 max-w-prose">
          {scene.prompt}
        </p>
        <StatArrangePanel
          pool={scene.pool ?? []}
          assignment={scene.assignment ?? {}}
          classRequirements={
            (scene.class_requirements ?? []).map((r) => ({
              name: r.name,
              requirementLabel: r.requirement_label,
            }))
          }
          qualifyingClasses={scene.qualifying_classes ?? []}
          confirmEnabled={scene.confirm_enabled ?? false}
          onAssign={({ stat, value }) => onRespond({ phase: "arrange_assign", stat, value })}
          onClear={({ stat }) => onRespond({ phase: "arrange_clear", stat })}
          onConfirm={() => onRespond({ phase: "arrange_confirm" })}
          onReject={() => onRespond({ phase: "arrange_reject" })}
        />
      </div>
    );
  }

  if (scene.input_type === "story") {
    return (
      <div data-testid="character-creation" className="flex flex-col items-center px-6 py-10 gap-6 max-w-2xl mx-auto">
        <p className="text-lg leading-relaxed italic text-foreground/90 max-w-prose">
          {scene.prompt}
        </p>
        <StoryPanel
          pronounsOptions={scene.pronouns_options ?? []}
          pronounsAllowFreeform={scene.pronouns_allow_freeform ?? true}
          backgroundOptional={scene.background_optional ?? true}
          descriptionOptional={scene.description_optional ?? true}
          autogenAvailable={scene.autogen_available ?? false}
          autogenResult={scene.autogen_result}
          onAutogen={() => onRespond({ phase: "story_autogen" })}
          onConfirm={(payload) => onRespond({ phase: "story_confirm", ...payload })}
        />
      </div>
    );
  }

  const showBack = scene.scene_index != null && scene.scene_index > 0 && scene.input_type !== "confirm";

  return (
    <div data-testid="character-creation" className="flex flex-col items-center px-6 py-10 gap-6 max-w-2xl mx-auto relative">
      {scene.scene_index != null && scene.total_scenes != null && (
        <span className="absolute top-4 right-4 text-xs tracking-widest text-muted-foreground/40 font-light">
          {toRoman(scene.scene_index + 1)}
        </span>
      )}

      <div className="text-center mt-2 mb-4">
        <span className="text-muted-foreground/30 text-sm tracking-[0.5em]">
          ── ◇ ──
        </span>
      </div>

      <p className="text-lg leading-relaxed italic text-foreground/90 max-w-prose">{scene.prompt}</p>

      {scene.rolled_stats && scene.rolled_stats.length > 0 && (
        <div
          data-testid="creation-rolled-stats"
          className="grid grid-cols-3 gap-3 w-full max-w-md border-y border-border/40 py-4 my-2"
        >
          {scene.rolled_stats.map((stat) => (
            <div key={stat.name} className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
                {stat.name}
              </span>
              <span className="text-2xl font-bold text-[var(--primary)] tabular-nums">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {scene.choices && scene.choices.length > 0 && (
        <div className="flex flex-col gap-3 w-full max-w-prose">
          {scene.choices.map((choice, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-selected={selectedIndex === i}
              data-selected={selectedIndex === i}
              onClick={() => handleChoice(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleChoice(i); }}
              className={`cursor-pointer rounded-lg border px-4 py-3
                         focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                         transition-all duration-150 ${
                           selectedIndex === i
                             ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/50 scale-[0.98]"
                             : "border-border/40 bg-card/50 text-foreground/70 hover:text-foreground hover:border-border hover:bg-card/80"
                         }`}
            >
              <span className="font-medium text-lg">{choice.label}</span>
              {choice.description && (
                <span className="block text-sm text-muted-foreground mt-0.5">{choice.description}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {(scene.allows_freeform || scene.input_type === "freeform" || scene.input_type === "name") && (
        <>
          {scene.choices && scene.choices.length > 0 && (
            <div className="flex items-center gap-3 w-full max-w-lg text-muted-foreground/40">
              <div className="flex-1 border-t border-border/30" />
              <span className="text-xs tracking-widest uppercase">or</span>
              <div className="flex-1 border-t border-border/30" />
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-lg">
            <input
            type="text"
            role="textbox"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Or describe it in your own words..."
            className="flex-1 rounded-md border border-input bg-background text-sm px-3 py-2 placeholder:italic placeholder:text-muted-foreground/50"
          />
            <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50">Submit</button>
          </form>
        </>
      )}

      {scene.input_type === "confirm" && (
        <div className="flex gap-3">
          <button onClick={handleConfirm} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90">
            Confirm
          </button>
          <button
            onClick={handleBack}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Go Back
          </button>
        </div>
      )}

      {scene.input_type === "continue" && (
        <button
          onClick={handleContinue}
          data-testid="creation-continue"
          className="inline-flex items-center justify-center rounded-lg text-sm font-semibold h-11 px-8 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Continue
        </button>
      )}

      {showBack && (
        <button
          onClick={handleBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
