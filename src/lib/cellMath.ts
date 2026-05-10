export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Pixel {
  readonly x: number;
  readonly y: number;
}

/** Cell → pixel center (top-left origin). */
export function cellToPixel(cell: Cell, cellSize: number): Pixel {
  return {
    x: cell.x * cellSize + Math.floor(cellSize / 2),
    y: cell.y * cellSize + Math.floor(cellSize / 2),
  };
}

/** Pixel → enclosing cell. Floors the division. */
export function pixelToCell(pixel: Pixel, cellSize: number): Cell {
  return {
    x: Math.floor(pixel.x / cellSize),
    y: Math.floor(pixel.y / cellSize),
  };
}

/** True if the mask has a floor cell ('.') at this position. */
export function isFloor(mask: string, cell: Cell): boolean {
  const rows = mask.split("\n").filter(r => r.length > 0);
  if (cell.y < 0 || cell.y >= rows.length) return false;
  const row = rows[cell.y];
  if (cell.x < 0 || cell.x >= row.length) return false;
  return row[cell.x] === ".";
}

/**
 * Floor cells within Chebyshev radius of origin (excluding origin).
 * Used to draw the reach disc when a token is selected.
 */
export function chebyshevReachCells(
  origin: Cell,
  radius: number,
  mask: string,
): Cell[] {
  const out: Cell[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c = { x: origin.x + dx, y: origin.y + dy };
      if (isFloor(mask, c)) out.push(c);
    }
  }
  return out;
}
