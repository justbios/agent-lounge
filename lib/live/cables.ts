import { Side } from "./duel";

export const CW = 80;
export const CH = 50;
export const CELL = 2;
export const TICK_MS = 100;
/** a turn takes effect this many steps after it is made, so the other side hears of it before it is needed */
export const DELAY = 3;
export const WIN_AT = 3;
export const SIDES: readonly Side[] = ["x", "o"];

/** 0 up, 1 right, 2 down, 3 left */
export type Dir = 0 | 1 | 2 | 3;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export const START: Record<Side, { x: number; y: number; d: Dir }> = {
  x: { x: 8, y: 24, d: 1 },
  o: { x: CW - 9, y: 24, d: 3 },
};

export const opposite = (a: Dir, b: Dir) => (a + 2) % 4 === b;

interface Cell {
  x: number;
  y: number;
}

/** The floor of one round: who laid cable where (0 nobody, 1 x, 2 o), where each plug is and where it crashed. */
export interface Field {
  grid: Uint8Array;
  head: Record<Side, Cell>;
  dir: Record<Side, Dir>;
  crash: Cell[];
}

export function newField(): Field {
  const grid = new Uint8Array(CW * CH);
  grid[START.x.y * CW + START.x.x] = 1;
  grid[START.o.y * CW + START.o.x] = 2;
  return {
    grid,
    head: { x: { x: START.x.x, y: START.x.y }, o: { x: START.o.x, y: START.o.y } },
    dir: { x: START.x.d, o: START.o.d },
    crash: [],
  };
}

/**
 * Moves both plugs one cell and returns who crashed: into a wall, into any cable, or into the same cell as the other
 * plug. Both sides run it on the same turns and so agree on every crash without telling each other.
 */
export function step(f: Field, want: Record<Side, Dir>): Side[] {
  const next = {} as Record<Side, Cell>;
  for (const s of SIDES) {
    if (!opposite(f.dir[s], want[s])) f.dir[s] = want[s];
    next[s] = { x: f.head[s].x + DX[f.dir[s]], y: f.head[s].y + DY[f.dir[s]] };
  }
  const blocked = (c: Cell) => c.x < 0 || c.y < 0 || c.x >= CW || c.y >= CH || f.grid[c.y * CW + c.x] !== 0;
  const crashed =
    next.x.x === next.o.x && next.x.y === next.o.y ? [...SIDES] : SIDES.filter((s) => blocked(next[s]));
  for (const s of SIDES) {
    if (crashed.includes(s)) continue;
    f.head[s] = next[s];
    f.grid[next[s].y * CW + next[s].x] = s === "x" ? 1 : 2;
  }
  f.crash = crashed.map((s) => ({
    x: Math.max(0, Math.min(CW - 1, next[s].x)),
    y: Math.max(0, Math.min(CH - 1, next[s].y)),
  }));
  return crashed;
}

/** `d` holds the turns for steps `n - d.length + 1` … `n` of round `r`. */
export type CablesMsg = { t: "hello" } | { t: "in"; r: number; n: number; d: Dir[] };

export const SENT = 4;

const int = (v: unknown, lo: number, hi: number): v is number =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

export function cleanCables(p: unknown): CablesMsg | null {
  const m = p as Record<string, unknown> | null;
  if (!m) return null;
  if (m.t === "hello") return { t: "hello" };
  if (m.t !== "in" || !int(m.r, 1, 999) || !int(m.n, 1, 100000) || !Array.isArray(m.d)) return null;
  const d = m.d;
  if (d.length < 1 || d.length > SENT || d.length > m.n || !d.every((v) => int(v, 0, 3))) return null;
  return { t: "in", r: m.r, n: m.n, d: d as Dir[] };
}
