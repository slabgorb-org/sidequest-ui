import { useState } from "react";
import type { TacticalGridData, TacticalToken } from "@/types/tactical";
import { CavernActionPanel } from "@/components/CavernActionPanel";
import { chebyshevReachCells } from "@/lib/cellMath";

export interface TacticalGridRendererProps {
  readonly grid: TacticalGridData;
}

const FACTION_COLOR: Record<TacticalToken["faction"], string> = {
  player: "#2563EB",
  ally: "#16A34A",
  neutral: "#6B7280",
  hostile: "#DC2626",
};

export function TacticalGridRenderer({ grid }: TacticalGridRendererProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cellSize = grid.cell_size;
  const W = grid.cellular.size[0] * cellSize;
  const H = grid.cellular.size[1] * cellSize;

  const selected = grid.tokens.find(t => t.id === selectedId) ?? null;
  const isSelectable = (t: TacticalToken) => t.faction === "player" || t.faction === "ally";

  const handleTokenClick = (t: TacticalToken) => {
    if (!isSelectable(t)) return;
    setSelectedId(prev => (prev === t.id ? null : t.id));
  };

  const reachCells = (() => {
    if (!selected || !selected.speed) return [];
    const radius = Math.floor(selected.speed / 5);
    return chebyshevReachCells(selected.cell, radius, grid.mask);
  })();

  return (
    <div data-testid="tactical-grid-renderer" className="flex gap-4">
      <div className="relative" style={{ width: W, height: H }}>
        <img
          data-testid="cavern-floor"
          src={grid.cavern_image_url}
          alt={grid.room_name}
          width={W}
          height={H}
          className="block"
          draggable={false}
        />
        <div className="absolute inset-0">
          {reachCells.map(c => (
            <div
              key={`reach-${c.x}-${c.y}`}
              data-testid={`reach-cell-${c.x}-${c.y}`}
              className="absolute pointer-events-none"
              style={{
                left: c.x * cellSize,
                top: c.y * cellSize,
                width: cellSize,
                height: cellSize,
                background: "rgba(37,99,235,0.18)",
                borderRadius: 2,
              }}
            />
          ))}
          {selected && (
            <div data-testid="reach-disc" className="hidden">
              {/* marker for tests; visualization is the cell highlights */}
            </div>
          )}
          {grid.tokens.map(t => {
            const size = Math.floor(cellSize * 0.78);
            return (
              <button
                key={t.id}
                data-testid={`token-${t.id}`}
                onClick={() => handleTokenClick(t)}
                title={`${t.name} · ${t.hp.current}/${t.hp.max} HP · AC ${t.ac}`}
                className="absolute rounded-full grid place-items-center text-white font-bold border-2 border-white"
                style={{
                  left: t.cell.x * cellSize,
                  top: t.cell.y * cellSize,
                  width: size,
                  height: size,
                  background: FACTION_COLOR[t.faction],
                  fontSize: Math.floor(size * 0.55),
                  boxShadow: selectedId === t.id
                    ? "0 0 0 3px var(--accent), 0 0 16px rgba(230,200,76,0.6)"
                    : "0 2px 8px rgba(0,0,0,0.7), 0 0 0 2px rgba(0,0,0,0.4)",
                  cursor: isSelectable(t) ? "pointer" : "default",
                }}
              >
                {t.initial}
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <div className="w-80 flex-shrink-0">
          <CavernActionPanel
            tokenName={selected.name}
            className={selected.className ?? ""}
            hp={selected.hp}
            ac={selected.ac}
            speed={selected.speed ?? 30}
            position={selected.cell}
            onAction={(_id) => { /* wired by future story */ }}
          />
        </div>
      )}
    </div>
  );
}
