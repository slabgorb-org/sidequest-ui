export interface SettlementExit {
  readonly to: string;
  readonly label: string;
}

export interface SettlementRoomViewProps {
  readonly name: string;
  readonly description: string;
  readonly exits: readonly SettlementExit[];
}

export function SettlementRoomView({
  name, description, exits,
}: SettlementRoomViewProps) {
  return (
    <div data-testid="settlement-room-view" className="p-6 space-y-4">
      <h2 className="text-2xl font-bold text-[var(--accent)]">{name}</h2>
      <p className="text-[var(--text)] leading-relaxed">{description}</p>
      {exits.length > 0 && (
        <ul className="space-y-1">
          {exits.map(exit => (
            <li
              key={exit.to}
              data-testid={`settlement-exit-${exit.to}`}
              className="text-sm text-[var(--text-mut)]"
            >
              <span className="text-[var(--accent)]">→</span> {exit.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
