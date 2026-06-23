export type CavernActionId =
  | "move" | "dash" | "attack" | "cast" | "object" | "dodge" | "end_turn";

export interface CavernActionPanelProps {
  readonly tokenName: string;
  readonly className: string;
  readonly hp: { current: number; max: number };
  readonly ac: number;
  readonly speed: number;
  readonly position: { x: number; y: number };
  readonly onAction: (id: CavernActionId) => void;
  readonly actionsEnabled?: boolean;
}

const ACTIONS: { id: CavernActionId; label: string; primary?: boolean }[] = [
  { id: "move",   label: "Move" },
  { id: "dash",   label: "Dash" },
  { id: "attack", label: "Attack" },
  { id: "cast",   label: "Cast" },
  { id: "object", label: "Object" },
  { id: "dodge",  label: "Dodge" },
  { id: "end_turn", label: "End turn", primary: true },
];

export function CavernActionPanel({
  tokenName, className, hp, ac, speed, position, onAction, actionsEnabled = false,
}: CavernActionPanelProps) {
  return (
    <div data-testid="cavern-action-panel" className="space-y-3 p-3">
      <div className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-3">
        <h3 className="mb-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--text-dim)]">
          {tokenName} — {className}
        </h3>
        <div className="space-y-1 text-xs">
          <Row k="HP" v={`${hp.current} / ${hp.max}`} />
          <Row k="AC" v={String(ac)} />
          <Row k="Speed" v={`${speed} ft`} />
          <Row k="Position" v={`[${position.x},${position.y}]`} />
        </div>
      </div>
      {actionsEnabled && (
        <div className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <h3 className="mb-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--text-dim)]">
            Actions
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {ACTIONS.map(a => (
              <button
                key={a.id}
                data-testid={`cavern-action-${a.id}`}
                onClick={() => onAction(a.id)}
                className={
                  a.primary
                    ? "col-span-2 rounded bg-[var(--accent)] px-2 py-2 text-xs font-semibold text-[#1a1500] hover:bg-[#f5d660]"
                    : "rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-2 text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--text-mut)]">{k}</span>
      <span className="font-mono text-right">{v}</span>
    </div>
  );
}
