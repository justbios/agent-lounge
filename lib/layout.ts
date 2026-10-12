export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  points: Point[];
  width: number;
  height: number;
  cols: number;
  rows: number;
}

export interface LayoutOpts {
  width: number;
  stepX: number;
  marginY: number;
  rowStep: number;
  bottomMargin: number;
  maxCols?: number;
}

/**
 * Arranges N stations in a horizontal snake (left→right, then right→left),
 * centered within `width`. Consecutive stations are always adjacent, so the
 * courier path is a clean serpentine for any count.
 */
export function snakeLayout(n: number, o: LayoutOpts): Layout {
  const cols = Math.max(1, Math.min(o.maxCols ?? 4, n));
  const rows = Math.ceil(n / cols);
  const marginX = (o.width - (cols - 1) * o.stepX) / 2;
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const raw = i % cols;
    const c = r % 2 === 1 ? cols - 1 - raw : raw;
    points.push({ x: marginX + c * o.stepX, y: o.marginY + r * o.rowStep });
  }
  const height = o.marginY + (rows - 1) * o.rowStep + o.bottomMargin;
  return { points, width: o.width, height, cols, rows };
}

/** SVG path string threading the points in order (the serpentine track). */
export function pathThrough(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}
