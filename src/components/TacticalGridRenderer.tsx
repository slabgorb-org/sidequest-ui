import { useState } from "react";
import type { TacticalGridData, TacticalToken } from "@/types/tactical";
import { CavernActionPanel } from "@/components/CavernActionPanel";
import { chebyshevReachCells } from "@/lib/cellMath";
import { FEATURE_MARKERS, FEATURE_COLORS, WATER_MARKER, WATER_COLOR } from "@/lib/featureGlyphs";

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
  // Story 52-5: runtime caverns (ADR-106) have cellular=null because the persisted
  // mask BLOB does not carry generation params. Fall back to the mask string itself
  // — rows are "\n"-separated; width = longest row, height = row count.
  const [cols, rows] = grid.cellular
    ? grid.cellular.size
    : (() => {
        const lines = grid.mask.split("\n");
        const width = lines.reduce((m, line) => Math.max(m, line.length), 0);
        return [width, lines.length] as const;
      })();
  const W = cols * cellSize;
  const H = rows * cellSize;

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

  const presentFeatureTypes = Array.from(new Set(grid.features.map(f => f.feature_type)));

  // Echoed tactical math (Story 165-4): denied adjudications surface as a banner
  // with the server's reason; move summaries surface as a cells-spent/budget chip.
  const adjudications = grid.adjudications ?? [];
  const denials = adjudications.filter(a => !a.valid);
  const moveEchoes = adjudications.filter(a => a.kind === "move");

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
          {grid.features.map(f => {
            const isWater = f.feature_type === "water";
            const glyph = isWater ? WATER_MARKER : (FEATURE_MARKERS[f.feature_type] ?? "•");
            const color = isWater ? WATER_COLOR : (FEATURE_COLORS[f.feature_type] ?? "#9CA3AF");
            return (
              <div
                key={`feat-${f.feature_type}-${f.cell.x}-${f.cell.y}`}
                data-testid={`feature-${f.feature_type}-${f.cell.x}-${f.cell.y}`}
                title={f.label}
                className="absolute pointer-events-none grid place-items-center"
                style={{
                  left: f.cell.x * cellSize, top: f.cell.y * cellSize,
                  width: cellSize, height: cellSize,
                  color, fontSize: Math.floor(cellSize * 0.6),
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                }}
              >
                {glyph}
              </div>
            );
          })}
          {Object.entries(grid.derived.exits).map(([bearing, cell]) =>
            cell ? (
              <div
                key={`exit-${bearing}`}
                data-testid={`exit-${bearing}`}
                title={`exit: ${bearing}`}
                className="absolute pointer-events-none border-2 border-dashed"
                style={{
                  left: cell[0] * cellSize, top: cell[1] * cellSize,
                  width: cellSize, height: cellSize,
                  borderColor: "rgba(230,200,76,0.8)", borderRadius: 3,
                }}
              />
            ) : null,
          )}
          {grid.derived.pois.map(([x, y]) => (
            <div
              key={`poi-${x}-${y}`}
              data-testid={`poi-${x}-${y}`}
              className="absolute pointer-events-none rounded-full"
              style={{
                left: x * cellSize + cellSize * 0.35, top: y * cellSize + cellSize * 0.35,
                width: cellSize * 0.3, height: cellSize * 0.3,
                background: "rgba(230,200,76,0.9)",
              }}
            />
          ))}
        </div>
      </div>
      {presentFeatureTypes.length > 0 && (
        <div data-testid="feature-legend" className="text-xs space-y-1">
          {presentFeatureTypes.map(ft => (
            <div key={ft} data-testid={`legend-${ft}`} className="flex items-center gap-2">
              <span style={{ color: ft === "water" ? WATER_COLOR : (FEATURE_COLORS[ft] ?? "#9CA3AF") }}>
                {ft === "water" ? WATER_MARKER : (FEATURE_MARKERS[ft] ?? "•")}
              </span>
              <span className="opacity-80">{ft.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}
      {(denials.length > 0 || moveEchoes.length > 0) && (
        <div data-testid="tactical-adjudications" className="text-xs space-y-1">
          {denials.map((a, i) => (
            <div
              key={`denial-${i}`}
              data-testid="tactical-denial"
              className="text-red-400"
            >
              {a.reason}
            </div>
          ))}
          {moveEchoes.map((a, i) => (
            <div
              key={`move-${i}`}
              data-testid="tactical-move-budget"
              className="opacity-80"
            >
              {a.actor}: {a.cells_spent ?? 0}/{a.cells_budget ?? 0} cells
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div className="w-80 flex-shrink-0">
          <CavernActionPanel
            tokenName={selected.name}
            className={selected.className ?? ""}
            hp={selected.hp}
            ac={selected.ac}
            speed={selected.speed ?? 30}
            position={selected.cell}
            actionsEnabled={false}
            onAction={() => {}}
          />
        </div>
      )}
    </div>
  );
}
