import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface InputBarRevealCall {
  status: "composing" | "submitted";
  action: string;
  aside: boolean;
  seq: number;
}

/**
 * Imperative handle for sibling components that need to read+clear the
 * field atomically. Currently used by the confrontation panel (D2 mock,
 * 2026-05-13): when a player clicks a beat tile, the panel asks the
 * InputBar for the current draft and clears it in one call so the typed
 * text rides along with the beat dispatch.
 */
export interface InputBarHandle {
  /** Returns the current trimmed draft and clears the field. */
  consumeDraft(): string;
  /** Returns the current draft text without mutating state. */
  peekDraft(): string;
}

export interface InputBarProps {
  onSend: (text: string, aside: boolean) => void;
  /**
   * ADR-036 Action Visibility Model: emit composing/submitted action reveal
   * to peers. Optional — single-player and legacy callers pass nothing.
   */
  onReveal?: (call: InputBarRevealCall) => void;
  /**
   * Current ADR-051 round counter; passed in so the component can reset its
   * monotonic seq counter on round transitions. Default 0 (single-player).
   */
  round?: number;
  disabled?: boolean;
  mobile?: boolean;
  thinking?: boolean;
  waitingForPlayer?: string;
  /**
   * When true, plain-Enter submit is locked: beat tiles in the confrontation
   * panel are the only commit path. Typing remains live so peers see the
   * draft via ACTION_REVEAL and the text is the flavor a beat carries.
   * The field renders a struck-through ↵ glyph + helper line so the lock
   * is visible (D2 mock, 2026-05-13).
   */
  confrontationActive?: boolean;
  /**
   * Draft restoration channel (sq-playtest 2026-06-07 silent blocked-paused
   * drop): when the server bounces a submitted action with GAME_PAUSED, App
   * bumps `epoch` and the field re-fills with the dropped text — but only
   * when the field is currently empty, never clobbering fresh typing.
   */
  restoredDraft?: { text: string; epoch: number } | null;
}

const COMPOSING_DEBOUNCE_MS = 250;

function InputBarImpl(
  {
    onSend,
    onReveal,
    round = 0,
    disabled,
    mobile,
    thinking,
    waitingForPlayer,
    confrontationActive = false,
    restoredDraft = null,
  }: InputBarProps,
  ref: React.ForwardedRef<InputBarHandle>,
) {
  const [text, setText] = useState("");
  const [aside, setAside] = useState(false);

  // Restore a server-bounced draft (GAME_PAUSED while our action was in
  // flight). Epoch-keyed so the same text restores again on a second
  // bounce; empty-field guard so we never clobber what the player has
  // started retyping. Render-phase state adjustment (the React-endorsed
  // "adjusting state when a prop changes" pattern) — the lint rule
  // forbids the setState-in-effect equivalent.
  const [restoredEpochSeen, setRestoredEpochSeen] = useState(0);
  if (restoredDraft && restoredDraft.epoch !== restoredEpochSeen) {
    setRestoredEpochSeen(restoredDraft.epoch);
    if (text.length === 0) {
      setText(restoredDraft.text);
    }
  }

  // Ref-shadow of `text` so the imperative handle below can read the latest
  // value without rebinding on every keystroke.
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Monotonic seq per round; resets when round prop changes.
  // Held in a ref so debounce flushes can read+increment without
  // re-rendering on every keystroke.
  const seqRef = useRef(0);
  useEffect(() => {
    seqRef.current = 0;
  }, [round]);

  // Keep a stable ref to onReveal so the debounce timeout closure doesn't
  // capture a stale value. We do NOT add onReveal to the debounce effect's
  // dep array — changes to the callback should not restart the debounce timer.
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  });

  // Debounced composing broadcast — fires 250ms after the last keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose read+clear to siblings (beat-tile clicks need the draft atomically).
  // Declared AFTER debounceRef so the callback can cancel a pending composing
  // broadcast — the draft is being committed via a beat, which fires its own
  // dispatch path, and the trailing composing event would race with it.
  useImperativeHandle(
    ref,
    () => ({
      consumeDraft: () => {
        const draft = textRef.current.trim();
        if (draft.length > 0) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          setText("");
          textRef.current = "";
        }
        return draft;
      },
      peekDraft: () => textRef.current,
    }),
    [],
  );

  useEffect(() => {
    if (!onRevealRef.current) return;
    if (text.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onRevealRef.current?.({
        status: "composing",
        action: text,
        aside,
        seq: seqRef.current++,
      });
    }, COMPOSING_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // aside intentionally included so a toggle re-debounces with the new flag
  }, [text, aside]);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Cancel pending composing — submitted supersedes it.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (onRevealRef.current) {
      onRevealRef.current({
        status: "submitted",
        action: trimmed,
        aside,
        seq: seqRef.current++,
      });
    }
    onSend(trimmed, aside);
    setText("");
  }, [text, aside, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (confrontationActive) {
          // Plain Enter is locked during confrontation — beat tiles are the
          // only commit path. We still preventDefault so the field doesn't
          // flush, but we don't submit.
          return;
        }
        submit();
      }
    },
    [submit, confrontationActive],
  );

  const placeholder =
    waitingForPlayer ? `Waiting for ${waitingForPlayer}…` :
    thinking ? "The narrator is thinking..." :
    confrontationActive ? "What do you do? (then pick a beat below)" :
    aside ? "Ask the GM — no turn spent" :
    "What do you do?";

  return (
    <div data-testid="input-bar" className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex items-center flex-1">
          {aside && (
            <span className="text-muted-foreground/40 text-lg pl-1 select-none">(</span>
          )}
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            data-confrontation-active={confrontationActive ? "true" : undefined}
            className={cn(aside && "text-muted-foreground/70 italic")}
            {...(mobile ? { "data-mobile": "true" } : {})}
          />
          {aside && (
            <span className="text-muted-foreground/40 text-lg pr-1 select-none">)</span>
          )}
          {confrontationActive && (
            <span
              data-testid="input-enter-locked"
              title="Enter is locked — pick a beat to commit"
              aria-label="Enter disabled during confrontation"
              className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded border border-border/40 text-[10px] tracking-wider text-muted-foreground/50 flex-shrink-0"
            >
              <span className="line-through font-semibold">↵ enter</span>
            </span>
          )}
        </div>
        <button
          data-testid="aside-toggle"
          className={cn(
            "text-sm transition-colors px-1.5",
            aside
              ? "text-muted-foreground/60"
              : "text-muted-foreground/25 hover:text-muted-foreground/45"
          )}
          onClick={() => setAside(!aside)}
          aria-label={aside ? "Speaking aside (click to speak normally)" : "Click to speak aside"}
          title={aside ? "Speaking aside" : "Aside"}
        >
          (…)
        </button>
      </div>
      {confrontationActive && (
        <div
          data-testid="confrontation-lock-helper"
          className="flex items-center gap-1 text-[10.5px] text-muted-foreground/70 tracking-wide"
        >
          <span aria-hidden="true">↑</span>
          Pick a beat above to commit · plain Enter is locked during confrontation
        </div>
      )}
    </div>
  );
}

const InputBar = forwardRef<InputBarHandle, InputBarProps>(InputBarImpl);
InputBar.displayName = "InputBar";
export default InputBar;
