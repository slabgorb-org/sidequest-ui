import { useState } from "react";

export interface StoryPanelProps {
  pronounsOptions: string[];
  pronounsAllowFreeform: boolean;
  backgroundOptional: boolean;
  descriptionOptional: boolean;
  autogenAvailable: boolean;
  autogenResult?: { background: string; description: string };
  onAutogen: () => void;
  onConfirm: (payload: {
    pronouns: string;
    background: string;
    description: string;
  }) => void;
}

export function StoryPanel({
  pronounsOptions,
  pronounsAllowFreeform,
  autogenAvailable,
  autogenResult,
  onAutogen,
  onConfirm,
}: StoryPanelProps) {
  // Reset textareas when autogenResult prop changes (React idiom: track prev value).
  const autogenKey = autogenResult
    ? `${autogenResult.background}|${autogenResult.description}`
    : null;
  const [lastAutogenKey, setLastAutogenKey] = useState<string | null>(null);

  const [pronounChoice, setPronounChoice] = useState<string | null>(null);
  const [pronounFreeform, setPronounFreeform] = useState("");
  const [background, setBackground] = useState("");
  const [description, setDescription] = useState("");

  if (autogenKey !== null && autogenKey !== lastAutogenKey) {
    setLastAutogenKey(autogenKey);
    setBackground(autogenResult!.background);
    setDescription(autogenResult!.description);
  }

  const isOther = pronounChoice === "__other__";
  const effectivePronouns = isOther ? pronounFreeform.trim() : (pronounChoice ?? "");
  const confirmEnabled = effectivePronouns.length > 0;

  return (
    <div data-testid="story-panel" className="flex flex-col gap-4 w-full max-w-xl">
      {/* Pronouns */}
      <div className="border-b border-border/40 pb-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-2">
          Pronouns
        </div>
        <div className="flex flex-col gap-2 text-sm">
          {pronounsOptions.map((p) => (
            <label
              key={p}
              data-testid={`story-pronoun-${p}`}
              className="inline-flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="story-pronouns"
                checked={pronounChoice === p}
                onChange={() => setPronounChoice(p)}
              />
              <span>{p}</span>
            </label>
          ))}
          {pronounsAllowFreeform && (
            <label
              data-testid="story-pronoun-other"
              className="inline-flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="story-pronouns"
                checked={pronounChoice === "__other__"}
                onChange={() => setPronounChoice("__other__")}
              />
              <input
                type="text"
                data-testid="story-pronoun-other-input"
                value={pronounFreeform}
                onChange={(e) => {
                  setPronounFreeform(e.target.value);
                  if (e.target.value) setPronounChoice("__other__");
                }}
                placeholder="other..."
                className="flex-1 rounded border border-input bg-background text-sm px-2 py-1"
              />
            </label>
          )}
        </div>
      </div>

      {/* Background */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-1">
          Background
        </div>
        <textarea
          data-testid="story-background"
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          rows={3}
          placeholder="Former ratcatcher. Three lost fingers. Owes the apothecary money."
          className="w-full rounded border border-input bg-background text-sm px-3 py-2 placeholder:italic placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Description */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-1">
          Description
        </div>
        <textarea
          data-testid="story-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Tall, soot-stained, missing a tooth."
          className="w-full rounded border border-input bg-background text-sm px-3 py-2 placeholder:italic placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3 justify-between border-t border-border/40 pt-3">
        {autogenAvailable && (
          <button
            data-testid="story-autogen"
            onClick={onAutogen}
            className="text-sm px-4 py-2 rounded border border-border/50 hover:border-border text-muted-foreground hover:text-foreground"
          >
            Let Brecca tell my story
          </button>
        )}
        <button
          data-testid="story-confirm"
          onClick={() =>
            onConfirm({
              pronouns: effectivePronouns,
              background: background.trim(),
              description: description.trim(),
            })
          }
          disabled={!confirmEnabled}
          className="text-sm px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
