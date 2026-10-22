import { Rules, hashNums } from "./rollback";

export const CW = 80;
export const CH = 50;
export const CELL = 2;
/** a cable moves one cell a step */
export const TICK_MS = 100;
export const WIN_AT = 3;
/** the countdown before the first round, the pause before each next one, and the crash shown in between, in steps */
export const FIRST_STEPS = 15;
const READY_STEPS = 6;
const SHOW_STEPS = 12;

/** 0 up, 1 right, 2 down, 3 left */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

interface Cell {
  x: number;
  y: number;
}

/** where each seat's cable comes out of the wall, for two players and for three */
export const STARTS: Record<number, readonly (Cell & { d: Dir })[]> = {
  2: [
    { x: 8, y: 24, d: 1 },
    { x: CW - 9, y: 24, d: 3 },
  ],
  3: [
    { x: 8, y: 14, d: 1 },
    { x: CW - 9, y: 14, d: 3 },
    { x: 40, y: CH - 6, d: 0 },
  ],
};

export const opposite = (a: Dir, b: Dir) => (a + 2) % 4 === b;

/**
 * One round's floor and the match around it. `grid` holds who laid cable where (0 nobody, seat + 1), `trail` each
 * seat's cells in the order laid, for drawing, and `crash` where plugs ran into something this round.
 */
export interface CablesState {
  n: number;
  round: number;
  grid: Uint8Array;
  head: Cell[];
  dir: Dir[];
  alive: boolean[];
  trail: number[][];
  crash: (Cell & { seat: number })[];
  score: number[];
  /** the step the cables start moving on */
  go: number;
  /** the step the next round begins on once this one is decided, or 0 */
  next: number;
  /** who won the round: a seat, -1 for nobody, null while it's on */
  won: number | null;
  over: boolean;
}

function round(s: CablesState, seats: number, wait: number) {
  const starts = STARTS[seats];
  s.round += 1;
  s.grid = new Uint8Array(CW * CH);
  s.head = starts.map((c) => ({ x: c.x, y: c.y }));
  s.dir = starts.map((c) => c.d);
  s.alive = starts.map(() => true);
  s.trail = starts.map((c, k) => {
    s.grid[c.y * CW + c.x] = k + 1;
    return [c.y * CW + c.x];
  });
  s.crash = [];
  s.go = s.n + wait;
  s.next = 0;
  s.won = null;
}

const copyState = (s: CablesState): CablesState => ({
  ...s,
  grid: s.grid.slice(),
  head: s.head.map((c) => ({ ...c })),
  dir: s.dir.slice(),
  alive: s.alive.slice(),
  trail: s.trail.map((t) => t.slice()),
  crash: s.crash.map((c) => ({ ...c })),
  score: s.score.slice(),
});

function gridSum(g: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < g.length; i++) h = Math.imul(h ^ g[i], 0x01000193);
  return h >>> 0;
}

const int = (v: unknown, lo: number, hi: number): v is number =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

function unpackState(v: unknown, seats: number): CablesState | null {
  const s = v as Record<string, unknown> | null;
  if (!s || !int(s.n, 0, 1e8) || !int(s.round, 1, 1e4) || typeof s.grid !== "string" || s.grid.length !== CW * CH) {
    return null;
  }
  const list = (a: unknown, ok: (x: unknown) => boolean) => Array.isArray(a) && a.length === seats && a.every(ok);
  const cell = (c: unknown) => {
    const p = c as Partial<Cell> | null;
    return !!p && int(p.x, 0, CW - 1) && int(p.y, 0, CH - 1);
  };
  const ok =
    list(s.head, cell) &&
    list(s.dir, (d) => int(d, 0, 3)) &&
    list(s.alive, (a) => typeof a === "boolean") &&
    list(s.trail, (t) => Array.isArray(t) && t.length <= CW * CH && t.every((i) => int(i, 0, CW * CH - 1))) &&
    list(s.score, (n) => int(n, 0, WIN_AT)) &&
    Array.isArray(s.crash) &&
    s.crash.length <= seats &&
    s.crash.every((c) => cell(c) && int((c as { seat: unknown }).seat, 0, seats - 1)) &&
    int(s.go, 0, 1e8) &&
    int(s.next, 0, 1e8) &&
    (s.won === null || int(s.won, -1, seats - 1)) &&
    typeof s.over === "boolean";
  if (!ok) return null;
  const grid = new Uint8Array(CW * CH);
  for (let i = 0; i < grid.length; i++) {
    const g = s.grid.charCodeAt(i) - 48;
    if (g < 0 || g > seats) return null;
    grid[i] = g;
  }
  return copyState({ ...(s as unknown as CablesState), grid });
}

/**
 * Cables for two or three, as every screen plays it: a step moves each plug one cell its way, and whoever runs into a
 * wall, any cable or another plug is out of the round. The last one left takes it. A turn counts a step after it is
 * made, which is about as long as it takes to reach the others, so they rarely have to guess.
 */
export function cablesRules(seats: number): Rules<CablesState, Dir> {
  const starts = STARTS[seats];
  return {
    ms: TICK_MS,
    delay: 1,
    start() {
      const s = { n: 0, round: 0, score: starts.map(() => 0), over: false } as unknown as CablesState;
      round(s, seats, FIRST_STEPS);
      return s;
    },
    step(s, want) {
      s.n += 1;
      if (s.over) return;
      if (s.next && s.n >= s.next) round(s, seats, READY_STEPS);
      if (s.n < s.go || s.won !== null) return;
      const next: Cell[] = s.head.map((h, k) => {
        if (!opposite(s.dir[k], want[k])) s.dir[k] = want[k];
        return { x: h.x + DX[s.dir[k]], y: h.y + DY[s.dir[k]] };
      });
      const live = s.alive.map((a, k) => (a ? k : -1)).filter((k) => k >= 0);
      const blocked = (c: Cell) => c.x < 0 || c.y < 0 || c.x >= CW || c.y >= CH || s.grid[c.y * CW + c.x] !== 0;
      const out = live.filter(
        (k) => blocked(next[k]) || live.some((j) => j !== k && next[j].x === next[k].x && next[j].y === next[k].y),
      );
      for (const k of live) {
        if (out.includes(k)) {
          s.alive[k] = false;
          const c = next[k];
          s.crash.push({ x: Math.max(0, Math.min(CW - 1, c.x)), y: Math.max(0, Math.min(CH - 1, c.y)), seat: k });
          continue;
        }
        s.head[k] = next[k];
        s.grid[next[k].y * CW + next[k].x] = k + 1;
        s.trail[k].push(next[k].y * CW + next[k].x);
      }
      const left = s.alive.map((a, k) => (a ? k : -1)).filter((k) => k >= 0);
      if (left.length > 1) return;
      s.won = left.length ? left[0] : -1;
      if (s.won >= 0) s.score[s.won] += 1;
      if (s.won >= 0 && s.score[s.won] >= WIN_AT) s.over = true;
      else s.next = s.n + SHOW_STEPS;
    },
    copy: copyState,
    idle: (seat) => starts[seat].d,
    same: (a, b) => a === b,
    guess: (last) => last,
    enc: (d) => d,
    dec: (v) => (int(v, 0, 3) ? (v as Dir) : null),
    sum: (s) =>
      hashNums([
        s.n,
        s.round,
        gridSum(s.grid),
        ...s.head.flatMap((c) => [c.x, c.y]),
        ...s.dir,
        ...s.alive.map(Number),
        ...s.score,
        s.go,
        s.next,
        s.won ?? -2,
        s.over ? 1 : 0,
      ]),
    pack: (s) => ({ ...copyState(s), grid: Array.from(s.grid, (g) => String.fromCharCode(48 + g)).join("") }),
    unpack: (v) => unpackState(v, seats),
  };
}
