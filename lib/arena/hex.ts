/**
 * The battlefield's hexes, as in Heroes III: rows of pointy-topped hexes, every odd row pushed half a hex right.
 * A hex is its index, row by row from the top-left. Distances, neighbours and lines go through cube coordinates
 * (Red Blob Games' hex guide), so they are exact on any row.
 */

export const COLS = 11;
export const ROWS = 8;
export const HEXES = COLS * ROWS;

export type Hex = number;

export const hexAt = (col: number, row: number): Hex => row * COLS + col;
export const colOf = (h: Hex): number => h % COLS;
export const rowOf = (h: Hex): number => Math.floor(h / COLS);
export const onBoard = (col: number, row: number): boolean => col >= 0 && col < COLS && row >= 0 && row < ROWS;
export const isHex = (v: unknown): v is Hex => Number.isInteger(v) && (v as number) >= 0 && (v as number) < HEXES;

interface Cube {
  q: number;
  r: number;
  s: number;
}

function cube(h: Hex): Cube {
  const col = colOf(h);
  const row = rowOf(h);
  const q = col - (row - (row & 1)) / 2;
  return { q, r: row, s: -q - row };
}

function fromCube(c: Cube): Hex | null {
  const col = c.q + (c.r - (c.r & 1)) / 2;
  return onBoard(col, c.r) ? hexAt(col, c.r) : null;
}

export function distance(a: Hex, b: Hex): number {
  const x = cube(a);
  const y = cube(b);
  return Math.max(Math.abs(x.q - y.q), Math.abs(x.r - y.r), Math.abs(x.s - y.s));
}

/** The six steps from a hex, clockwise from east, for even rows and for odd ones. */
const STEPS: readonly (readonly [number, number])[][] = [
  [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
  ],
  [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ],
];

/** The hex one step from `h` in direction 0–5 (clockwise from east), or null off the board. */
export function step(h: Hex, dir: number): Hex | null {
  const [dc, dr] = STEPS[rowOf(h) & 1][((dir % 6) + 6) % 6];
  const col = colOf(h) + dc;
  const row = rowOf(h) + dr;
  return onBoard(col, row) ? hexAt(col, row) : null;
}

export function neighbours(h: Hex): Hex[] {
  const out: Hex[] = [];
  for (let d = 0; d < 6; d++) {
    const n = step(h, d);
    if (n != null) out.push(n);
  }
  return out;
}

/** The direction 0–5 from `a` to its neighbour `b`, or -1 when they are not neighbours. */
export function dirTo(a: Hex, b: Hex): number {
  for (let d = 0; d < 6; d++) if (step(a, d) === b) return d;
  return -1;
}

function round(c: Cube): Cube {
  let q = Math.round(c.q);
  let r = Math.round(c.r);
  let s = Math.round(c.s);
  const dq = Math.abs(q - c.q);
  const dr = Math.abs(r - c.r);
  const ds = Math.abs(s - c.s);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  else s = -q - r;
  return { q, r, s };
}

/** Every hex on the straight line from `a` to `b`, both ends included. */
export function line(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b);
  const x = cube(a);
  const y = cube(b);
  const out: Hex[] = [];
  // nudged off the exact edges between hexes, so a line along an edge picks one side every time
  const e = 1e-6;
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const hex = fromCube(round({ q: x.q + e + (y.q - x.q) * t, r: x.r + e + (y.r - x.r) * t, s: x.s - 2 * e + (y.s - x.s) * t }));
    if (hex != null && out[out.length - 1] !== hex) out.push(hex);
  }
  return out;
}

/** Every hex within `n` steps of `h`, itself included. */
export function area(h: Hex, n: number): Hex[] {
  const out: Hex[] = [];
  for (let i = 0; i < HEXES; i++) if (distance(h, i) <= n) out.push(i);
  return out;
}

/**
 * How far a unit at `from` can go: steps to every hex it can stand on within `range`. Walkers go round what `blocked`
 * says; fliers go straight over it but still land only on a free hex. `parent` leads back from any hex to `from`.
 */
export function reach(
  from: Hex,
  range: number,
  blocked: (h: Hex) => boolean,
  flying = false,
): { steps: Map<Hex, number>; parent: Map<Hex, Hex> } {
  const steps = new Map<Hex, number>([[from, 0]]);
  const parent = new Map<Hex, Hex>();
  let edge = [from];
  for (let d = 1; d <= range && edge.length; d++) {
    const next: Hex[] = [];
    for (const h of edge) {
      for (const n of neighbours(h)) {
        if (steps.has(n) || (!flying && blocked(n))) continue;
        steps.set(n, d);
        parent.set(n, h);
        next.push(n);
      }
    }
    edge = next;
  }
  if (flying) for (const h of [...steps.keys()]) if (h !== from && blocked(h)) steps.delete(h);
  return { steps, parent };
}

/** The hexes walked from the start of a {@link reach} to `to`, the start left out; a flier's is a straight line. */
export function pathTo(parent: Map<Hex, Hex>, from: Hex, to: Hex, flying = false): Hex[] {
  if (flying) return line(from, to).slice(1);
  const out: Hex[] = [];
  for (let h: Hex | undefined = to; h != null && h !== from; h = parent.get(h)) out.unshift(h);
  return out;
}
