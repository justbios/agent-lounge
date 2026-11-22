"use client";

import type { Side } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";
import { botThinking } from "@/lib/live/soloStore";
import { chalk as snd } from "@/lib/live/sounds/drop";
import { INTRO_MS } from "../beats";
import { Ctx, Cues, Screen, Sparks, calm } from "../fx";
import { Kept, boardBefore, clamp, countGame, ease, hash, keepBoard, seedOf, seriesOf, span } from "./stage";

/*
 * Noughts and crosses on the café's chalk board: a slate in a wooden frame with a ledge for the chalk and the rag.
 * Every mark is drawn stroke by stroke in pixel chalk, a little differently each time, by a stick of chalk that
 * leaves the ledge to do it. The top of the slate keeps the score of the sitting in tally strokes. Everything
 * here is looks and sound; the game itself is the board it is shown.
 */

/** the canvas in its own units */
export const W = 112;
export const H = 122;
const CELL = 30;
/** the corner of the nine squares */
const GX = 11;
const GY = 20;
const SLATE = { x: 4, y: 4, w: 104, h: 108 };
const LEDGE = 116;
/** where each thing lies on the ledge */
const HOME: Record<Side, Point> = { x: [20, 117], o: [34, 117] };
const RAG_HOME: Point = [84, 116];

/** the rag crosses the slate three times, this long each; quicker when a mark is already waiting to be drawn */
const PASS_MS = 130;
const HURRY_MS = 70;
const NEVER = -1e9;
const LATER = 1e12;
/** a mark asked for again shakes its head this long */
const NOPE_MS = 260;
/** how many wins and draws the top of the slate has room for */
const WINS = 10;
const DRAWS = 3;

const INK = "#07050d";
type Tone = readonly [light: string, main: string, dim: string];
/** each side's chalk, and the white one the grid, the stars and the "=" are drawn with */
const CHALK: Record<Side | "w", Tone> = {
  x: ["#ffdcc4", "#ffb07a", "#b8744c"],
  o: ["#d2ebff", "#7cc0f2", "#4c84ad"],
  w: ["#f7fbf7", "#d3ded6", "#8a9c93"],
};

type Point = readonly [number, number];
type Path = (t: number) => Point;
/** the units a piece of chalk covers round where it touches; the last number marks its ragged edge */
type Brush = readonly (readonly [number, number, number])[];

const DOT: Brush = [[0, 0, 0]];
const PLUS: Brush = [
  [0, 0, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
];
const FAT: Brush = [
  ...PLUS,
  [1, 1, 1],
  [-1, 1, 1],
  [1, -1, 1],
  [-1, -1, 1],
];
const NIB: Brush = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 1],
];
const ACROSS: Brush = [
  [0, 0, 0],
  [0, 1, 0],
];
const DOWN: Brush = [
  [0, 0, 0],
  [1, 0, 0],
];
/** a little four-pointed star, laid down all at once */
const STAR: Brush = [
  [0, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [2, 0, 1],
  [-2, 0, 1],
  [0, 2, 1],
  [0, -2, 1],
];

/** One stroke as it is meant: where it runs, how long it is, with what, and when after the first of its group. */
interface Plan {
  path: Path;
  len: number;
  brush: Brush;
  delay: number;
  ms: number;
  say?: () => void;
}

interface Dab {
  x: number;
  y: number;
  /** how far along the stroke the chalk is when it lays this unit down */
  t: number;
}

/** One stroke as it is drawn: its units by shade (light, main, dim), each in the order the chalk lays them down. */
interface Stroke {
  px: [Dab[], Dab[], Dab[]];
  tone: Tone;
  path: Path;
  at: number;
  ms: number;
  /** whose chalk draws it: that stick follows its tip */
  by: Side | null;
  say?: () => void;
}

interface Mark {
  cell: number;
  side: Side;
  strokes: Stroke[];
  /** it pales from this moment; it flares from this one, as one of the three */
  dimAt: number;
  shineAt: number;
}

/** a unit of chalk left from the game before, till the rag gets to it */
interface Faded {
  x: number;
  y: number;
  color: string;
  a: number;
}

const mid = (cell: number): Point => [GX + (cell % 3) * CELL + CELL / 2, GY + Math.floor(cell / 3) * CELL + CELL / 2];

/** A straight stroke from `a` to `b`, bowed sideways by `bow` units in the middle, as a hand draws one. */
function line(a: Point, b: Point, bow = 0): Path {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy) || 1;
  return (t) => {
    const w = bow * Math.sin(Math.PI * t);
    return [a[0] + dx * t - (dy / len) * w, a[1] + dy * t + (dx / len) * w];
  };
}

/** The units a stroke covers: chalk skips some, more along its edge, and comes out in three shades. */
function dabs(plan: Plan, seed: number): Stroke["px"] {
  const seen = new Set<number>();
  const px: Stroke["px"] = [[], [], []];
  const n = Math.max(1, Math.ceil(plan.len * 2));
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const [x, y] = plan.path(t);
    for (const [dx, dy, edge] of plan.brush) {
      const i = Math.floor(x) + dx;
      const j = Math.floor(y) + dy;
      const key = (i + 64) * 1024 + j + 64;
      if (seen.has(key)) continue;
      seen.add(key);
      if (hash(i, j, seed) < (edge ? 0.3 : 0.06)) continue;
      const q = hash(j, i, seed ^ 0x51ed);
      px[q < 0.2 ? 2 : q < 0.78 ? 1 : 0].push({ x: i, y: j, t });
    }
  }
  return px;
}

/** A cross: two strokes, the second a beat after the first. A nought: once round, the end running past the start. */
function markPlans(cell: number, side: Side, seed: number): Plan[] {
  const [cx, cy] = mid(cell);
  const j = (k: number, by = 1) => (hash(seed, cell, k) - 0.5) * 2 * by;
  if (side === "x") {
    const r = 8.5;
    return [
      {
        path: line([cx - r + j(1), cy - r + j(2)], [cx + r + j(3), cy + r + j(4)], j(5, 1.3)),
        len: 25,
        brush: PLUS,
        delay: 0,
        ms: 110,
        say: () => snd.stroke(false),
      },
      {
        path: line([cx + r + j(6), cy - r + j(7)], [cx - r + j(8), cy + r + j(9)], j(10, 1.3)),
        len: 25,
        brush: PLUS,
        delay: 150,
        ms: 110,
        say: () => snd.stroke(true),
      },
    ];
  }
  const [rx, ry] = [9 + j(1, 0.8), 9 + j(2, 0.8)];
  const [ox, oy] = [cx + j(4, 0.7), cy + j(5, 0.7)];
  const from = -Math.PI / 2 - 0.4 + j(3, 0.35);
  const round = Math.PI * 2 + 0.55;
  return [
    {
      path: (t) => {
        const a = from + round * t;
        const pull = 1 - 0.1 * t;
        return [ox + Math.cos(a) * rx * pull, oy + Math.sin(a) * ry * pull];
      },
      len: 62,
      brush: PLUS,
      delay: 0,
      ms: 270,
      say: () => snd.round(),
    },
  ];
}

/** The four lines of the grid, each a little unsteady. */
function gridPlans(seed: number): Plan[] {
  const j = (k: number, by = 1) => (hash(seed, 77, k) - 0.5) * 2 * by;
  const far = 3 * CELL;
  return [1, 2].flatMap((n, i) => [
    {
      path: line([GX + n * CELL - 1 + j(i * 8 + 1, 0.8), GY + 1 + j(i * 8 + 2)], [GX + n * CELL - 1 + j(i * 8 + 3, 0.8), GY + far - 1 + j(i * 8 + 4)], j(i * 8 + 5)),
      len: far,
      brush: DOWN,
      delay: i * 160,
      ms: 70,
      say: () => snd.rule(i * 2),
    },
    {
      path: line([GX + 1 + j(i * 8 + 6), GY + n * CELL - 1 + j(i * 8 + 7, 0.8)], [GX + far - 1 + j(i * 8 + 8), GY + n * CELL - 1 + j(i * 8 + 9, 0.8)], j(i * 8 + 10)),
      len: far,
      brush: ACROSS,
      delay: i * 160 + 80,
      ms: 70,
      say: () => snd.rule(i * 2 + 1),
    },
  ]);
}

/** The cells of a line from left to right, or from the top down when it stands upright. */
const inOrder = (cells: readonly number[]) => [...cells].sort((a, b) => (a % 3) - (b % 3) || a - b);

/** The line struck through three in a row, running out past both ends, and the tail the hand adds to it. */
function strikePlans(cells: readonly number[], seed: number): Plan[] {
  const order = inOrder(cells);
  const [a, b] = [mid(order[0]), mid(order[order.length - 1])];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const past = 11;
  const from: Point = [a[0] - ux * past, a[1] - uy * past];
  const to: Point = [b[0] + ux * past, b[1] + uy * past];
  const bow = (hash(seed, 91) - 0.5) * 2.4;
  // the flourish: the hand does not stop at the end of the line but comes off it in a small curl
  const [nx, ny] = [-uy, ux];
  const R = 4.2;
  const c: Point = [to[0] + nx * R, to[1] + ny * R];
  return [
    { path: line(from, to, bow), len: len + past * 2, brush: FAT, delay: 0, ms: 200, say: () => snd.strike() },
    {
      path: (t) => {
        const a = t * Math.PI * 2.3;
        const r = R * (1 - 0.28 * t);
        return [c[0] + (ux * Math.sin(a) - nx * Math.cos(a)) * r, c[1] + (uy * Math.sin(a) - ny * Math.cos(a)) * r];
      },
      len: 26,
      brush: NIB,
      delay: 200,
      ms: 140,
      say: () => snd.curl(),
    },
  ];
}

/** The line through three is drawn pressing hard: the same chalk, a shade brighter than the marks under it. */
const pressed = (tone: Tone): Tone => ["#ffffff", tone[0], tone[1]];

/** Where the three stars go: off both ends of the line, on the bare slate round the grid. */
function starSpots(cells: readonly number[]): Point[] {
  const order = inOrder(cells);
  const [a, b] = [mid(order[0]), mid(order[order.length - 1])];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const spot = (p: Point, along: number, side: number): Point => [
    clamp(p[0] + ux * along - uy * side, SLATE.x + 4, SLATE.x + SLATE.w - 4),
    clamp(p[1] + uy * along + ux * side, GY + 1, SLATE.y + SLATE.h - 4),
  ];
  // the far end keeps one side clear for the curl
  return [spot(a, -18, 5), spot(b, 18, -6), spot(a, -14, -6)];
}

/** Stroke `i` of a tally at the top of the slate: four upright and the fifth across them. */
function tallyPlan(group: Side | "=", i: number, seed: number): Plan | null {
  if (i >= (group === "=" ? DRAWS : WINS)) return null;
  const dir = group === "o" ? -1 : 1;
  const x0 = group === "x" ? 17 : group === "o" ? 94 : 60;
  const bundle = Math.floor(i / 5) * 16;
  const at = (n: number) => x0 + dir * (bundle + n) + 0.5;
  const j = (k: number) => (hash(seed, i * 9 + k, group.charCodeAt(0)) - 0.5) * 1.2;
  if (i % 5 < 4) {
    const x = at((i % 5) * 3);
    return { path: line([x + j(1), 8 + j(2)], [x + j(3), 15 + j(4)]), len: 8, brush: DOT, delay: 0, ms: 80, say: () => snd.tally() };
  }
  return { path: line([at(-2), 14], [at(11), 9]), len: 14, brush: DOT, delay: 0, ms: 100, say: () => snd.tally() };
}

/** The small cross, nought and "=" the tallies are counted under. */
function signPlans(group: Side | "="): Plan[] {
  const at = { delay: 0, ms: 60, brush: DOT, len: 7 };
  if (group === "x") return [{ ...at, path: line([8, 9], [13.5, 14.5]) }, { ...at, path: line([13, 9], [7.5, 14.5]) }];
  if (group === "=") return [{ ...at, path: line([51, 10.5], [57, 10.5]) }, { ...at, path: line([51, 13.5], [57, 13.5]) }];
  return [{ ...at, len: 18, path: (t) => [101.5 + Math.cos(t * 6.6) * 2.7, 12 + Math.sin(t * 6.6) * 2.7] }];
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export interface ChalkSeen {
  cells: readonly (Side | null)[];
  /** the square of the latest mark */
  last: number | null;
  ply: number;
  turn: Side;
  winner: Side | "draw" | null;
  line: number[] | null;
  /** the viewer's mark */
  mine: Side;
  /** the viewer may put a mark down now */
  go: boolean;
  /** the game goes on */
  live: boolean;
}

export class ChalkView {
  readonly screen: Screen;
  private readonly ctx: Ctx;
  private readonly sparks = new Sparks();
  private readonly cues = new Cues();
  private board: HTMLCanvasElement | null = null;

  private seen: ChalkSeen | null = null;
  private marks: Mark[] = [];
  /** the grid gone over fresh */
  private grid: Stroke[] = [];
  /** everything else chalked up: the signs and tallies, the line through three, its tail, the stars */
  private notes: Stroke[] = [];
  /** what the game before left on the slate, till the rag has been over it, and the trace it leaves after */
  private old: Faded[] = [];
  private smudge: Faded[] = [];
  private wipeAt = LATER;
  private pass = PASS_MS;
  private wiped = true;
  private wipeSaid = false;
  private readonly sticks: Record<Side, { x: number; y: number }> = {
    x: { x: HOME.x[0], y: HOME.x[1] },
    o: { x: HOME.o[0], y: HOME.o[1] },
  };
  /** the taken square the viewer asked for, and when */
  private no = { cell: -1, at: NEVER };
  private readonly rag = { x: RAG_HOME[0], y: RAG_HOME[1] };
  /** the square under the viewer's pointer, finger or focus */
  private pointer: number | null = null;
  private touch = false;
  private ghost: { cell: number; side: Side; strokes: Stroke[] } | null = null;
  private said = new WeakSet<Stroke>();
  private prev = 0;
  private dustAt = 0;
  private readonly seed: number;
  private readonly lines: number;

  constructor(
    canvas: HTMLCanvasElement,
    /** the match, the two players whoever sits where, and whose id plays which mark */
    private readonly id: string,
    private readonly pair: string,
    private readonly ids: Record<Side, string>,
  ) {
    this.screen = new Screen(canvas, W, H);
    this.ctx = canvas.getContext("2d")!;
    this.seed = seedOf(id);
    this.lines = seedOf(pair);
  }

  // ---- what the game tells it ---------------------------------------------------------------------------------

  /** The board as it stands now. The first one is simply shown; after that every new mark is drawn. */
  sync(seen: ChalkSeen) {
    const was = this.seen;
    const now = performance.now();
    this.seen = seen;
    if (!was || seen.ply < was.ply) return this.open(seen, now);
    if (seen.ply > was.ply) {
      // a move before the slate was made ready: it is ready at once
      this.settle(now);
      seen.cells.forEach((side, cell) => {
        if (!side || was.cells[cell]) return;
        const m = this.mark(cell, side, cell === seen.last ? now : NEVER, this.seed);
        this.marks.push(m);
        // the other side's mark is drawn: the viewer's turn
        const drawn = Math.max(...m.strokes.map((s) => s.at + s.ms));
        if (cell === seen.last && side !== seen.mine && seen.go) this.cues.at(drawn + 60, () => this.seen?.go && sfx("turn"));
      });
      if (this.touch) this.pointer = null;
      keepBoard(this.pair, this.id, [...seen.cells], seen.mine);
    }
    if (seen.winner && !was.winner) this.finish(seen, now, false);
  }

  /** The square the viewer points at, touches or has the focus on; null when none. */
  hover(cell: number | null, touch = false) {
    this.touch = touch;
    if (cell === this.pointer) return;
    this.pointer = cell;
    if (cell !== null && this.seen?.go && !this.seen.cells[cell]) snd.cell(cell);
  }

  /** A taken square was asked for: the mark in it shakes its head. */
  nope(cell: number) {
    if (!this.seen?.go) return;
    this.no = { cell, at: performance.now() };
    sfx("illegal");
  }

  private open(seen: ChalkSeen, now: number) {
    this.marks = [];
    this.notes = [];
    this.old = [];
    this.cues.clear();
    this.wipeAt = LATER;
    this.pass = PASS_MS;
    this.wiped = true;
    this.wipeSaid = false;
    seen.cells.forEach((side, cell) => side && this.marks.push(this.mark(cell, side, NEVER, this.seed)));
    if (seen.winner) this.finish(seen, now, true);
    // the score of the sitting so far
    const series = seriesOf(this.pair);
    for (const group of ["x", "o", "="] as const) {
      const n = series[group === "=" ? "=" : this.ids[group]] ?? 0;
      if (group !== "=" || n) this.lay(signPlans(group), CHALK[group === "=" ? "w" : group], NEVER, null, 3);
      for (let i = 0; i < n; i++) {
        const plan = tallyPlan(group, i, this.lines);
        if (plan) this.lay([plan], CHALK[group === "=" ? "w" : group], NEVER, null, i);
      }
    }
    let gridAt = NEVER;
    if (seen.ply === 0) {
      gridAt = now + INTRO_MS;
      const before = boardBefore(this.pair, this.id);
      if (before) {
        this.old = this.left(before);
        this.wipeAt = now + INTRO_MS;
        this.wiped = false;
        gridAt = this.wipeAt + this.pass * 3 + 40;
      }
    }
    this.grid = gridPlans(this.lines).map((p) => this.stroke(p, CHALK.w, calm() ? NEVER : gridAt, null, this.lines));
  }

  /** A mark is to be drawn and the slate is not ready yet: the rag sets off now, in a hurry, and the grid is there. */
  private settle(now: number) {
    if (!this.wiped && now < this.wipeAt) {
      this.wipeAt = now;
      this.pass = HURRY_MS;
    }
    for (const s of this.grid) {
      if (s.at + s.ms <= now) continue;
      s.at = NEVER;
      this.said.add(s);
    }
  }

  // ---- strokes ----------------------------------------------------------------------------------------------------

  private stroke(plan: Plan, tone: Tone, at: number, by: Side | null, seed: number): Stroke {
    const s: Stroke = {
      px: dabs(plan, seed),
      tone,
      path: plan.path,
      at: at === NEVER ? NEVER : at + plan.delay,
      ms: calm() ? 1 : plan.ms,
      by,
      say: plan.say,
    };
    if (at === NEVER) this.said.add(s);
    return s;
  }

  /** Chalks strokes up beside the game: a tally, a line through three, a star. Returns when the last one is done. */
  private lay(plans: Plan[], tone: Tone, at: number, by: Side | null, seed: number): number {
    let done = at;
    for (const p of plans) {
      const s = this.stroke(p, tone, at, by, seed);
      this.notes.push(s);
      done = Math.max(done, s.at + s.ms);
    }
    return done;
  }

  private mark(cell: number, side: Side, at: number, seed: number): Mark {
    const strokes = markPlans(cell, side, seed).map((p) => this.stroke(p, CHALK[side], at, side, seed + cell));
    return { cell, side, strokes, dimAt: LATER, shineAt: LATER };
  }

  /** The slate as the game before left it, unit by unit, for the rag to take away. */
  private left(before: Kept): Faded[] {
    const seed = seedOf(before.id);
    const out: Faded[] = [];
    const add = (px: Stroke["px"], tone: Tone, a: number) =>
      px.forEach((list, shade) => list.forEach((d) => out.push({ x: d.x, y: d.y, color: tone[shade], a })));
    const line = LINES.find(([p, q, r]) => before.cells[p] && before.cells[p] === before.cells[q] && before.cells[p] === before.cells[r]);
    const winner = line ? before.cells[line[0]] : null;
    for (const p of gridPlans(this.lines)) add(dabs(p, this.lines), CHALK.w, 1);
    before.cells.forEach((side, cell) => {
      if (!side) return;
      const pale = line ? !line.includes(cell) : before.cells.every(Boolean);
      for (const p of markPlans(cell, side, seed)) add(dabs(p, seed + cell), CHALK[side], pale ? 0.45 : 1);
    });
    if (line && winner) {
      for (const p of strikePlans(line, seed)) add(dabs(p, seed), pressed(CHALK[winner]), 1);
      if (winner === before.mine) starSpots(line).forEach(([x, y], i) => add(dabs(this.star(x, y), seed + i), CHALK.w, 1));
    }
    return out;
  }

  private star(x: number, y: number): Plan {
    return { path: () => [x, y], len: 1, brush: STAR, delay: 0, ms: 1 };
  }

  // ---- the end ----------------------------------------------------------------------------------------------------

  /** The game is decided: the line through three, the stars, the tally, once the last mark is drawn. */
  private finish(seen: ChalkSeen, now: number, opened: boolean) {
    const winner = seen.winner;
    if (!winner) return;
    const group = winner === "draw" ? "=" : winner;
    const key = group === "=" ? "=" : this.ids[group];
    const had = seriesOf(this.pair)[key] ?? 0;
    const fresh = countGame(this.pair, this.id, key);
    if (opened) {
      for (const m of this.marks) {
        if (!seen.line?.includes(m.cell)) m.dimAt = NEVER;
      }
      if (seen.line && winner !== "draw") {
        this.lay(strikePlans(seen.line, this.seed), pressed(CHALK[winner]), NEVER, null, this.seed);
        if (winner === seen.mine) {
          starSpots(seen.line).forEach(([x, y], i) => this.lay([this.star(x, y)], CHALK.w, NEVER, null, this.seed + i));
        }
      }
      return;
    }
    const last = this.marks.find((m) => m.cell === seen.last);
    const t = Math.max(now, ...(last?.strokes ?? []).map((s) => s.at + s.ms));
    const tone = CHALK[group === "=" ? "w" : group];
    const tally = fresh ? tallyPlan(group, had, this.lines) : null;
    if (winner === "draw") {
      for (const m of this.marks) m.dimAt = t + 120;
      this.cues.at(t + 120, () => {
        if (calm()) return;
        for (const m of this.marks) {
          const [x, y] = mid(m.cell);
          this.sparks.burst(x, y + 4, 4, 0.02, [CHALK[m.side][1], CHALK[m.side][2]], { dir: Math.PI / 2, spread: 2.6, life: 620, fall: 0.00016 });
        }
      });
      this.cues.at(t + 340, () => snd.quits());
      let at = t + 340;
      if (fresh && had === 0) at = this.lay(signPlans("="), tone, at, null, 3) + 60;
      if (tally) this.lay([tally], tone, at, null, had);
      return;
    }
    const won = winner === seen.mine;
    if (!seen.line) {
      if (tally) this.lay([tally], tone, t + 200, winner, had);
      return;
    }
    for (const m of this.marks) {
      if (seen.line.includes(m.cell)) m.shineAt = t + 120;
      else m.dimAt = t + 60;
    }
    let at = this.lay(strikePlans(seen.line, this.seed), pressed(tone), t + 60, winner, this.seed);
    if (won) {
      starSpots(seen.line).forEach(([x, y], i) => {
        const star = { ...this.star(x, y), say: () => snd.star(i) };
        at = this.lay([star], CHALK.w, t + 440 + i * 110, winner, this.seed + i);
        this.cues.at(t + 440 + i * 110, () => {
          if (!calm()) this.sparks.burst(x, y, 6, 0.035, [CHALK.w[0], CHALK[winner][0]], { life: 420, fall: 0.00012 });
        });
      });
    } else this.cues.at(t + 330, () => snd.lost());
    if (tally) this.lay([tally], tone, at + 110, winner, had);
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------

  /** The board itself, painted once: the frame, the slate with the grid worn into it, the ledge. */
  private paint(ctx: Ctx) {
    const box = (c: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    // the wooden frame, lit from the top left
    box("#6b4a35", 0, 0, W, LEDGE);
    box("#8a6444", 0, 0, W, 1);
    box("#8a6444", 0, 0, 1, LEDGE);
    box("#4a301d", W - 1, 0, 1, LEDGE);
    box("#4a301d", 0, LEDGE - 1, W, 1);
    for (let i = 0; i < 26; i++) {
      const top = i % 2 === 0;
      const x = 6 + Math.floor(hash(i, 3) * (W - 22));
      box(hash(i, 5) < 0.5 ? "#5c3e2b" : "#7a563c", x, top ? 2 : LEDGE - 3, 5 + Math.floor(hash(i, 7) * 8), 1);
    }
    for (let i = 0; i < 18; i++) {
      const y = 8 + Math.floor(hash(i, 11) * (LEDGE - 24));
      box(hash(i, 13) < 0.5 ? "#5c3e2b" : "#7a563c", i % 2 === 0 ? 2 : W - 3, y, 1, 4 + Math.floor(hash(i, 17) * 7));
    }
    // the slate, sunk into it
    box(INK, SLATE.x - 1, SLATE.y - 1, SLATE.w + 2, SLATE.h + 2);
    box("#1d2a25", SLATE.x, SLATE.y, SLATE.w, SLATE.h);
    for (let y = 0; y < SLATE.h; y++) {
      for (let x = 0; x < SLATE.w; x++) {
        const r = hash(x, y, 4242);
        if (r < 0.05) box("#23322c", SLATE.x + x, SLATE.y + y, 1, 1);
        else if (r > 0.96) box("#18231f", SLATE.x + x, SLATE.y + y, 1, 1);
      }
    }
    // where a rag has been a thousand times: paler streaks
    for (let i = 0; i < 9; i++) {
      const y = SLATE.y + 6 + Math.floor(hash(i, 21) * (SLATE.h - 12));
      const x = SLATE.x + 2 + Math.floor(hash(i, 23) * 40);
      box("rgba(190, 215, 200, 0.035)", x, y, 30 + Math.floor(hash(i, 29) * 40), 2 + Math.floor(hash(i, 31) * 4));
    }
    box("rgba(0, 0, 0, 0.3)", SLATE.x, SLATE.y, SLATE.w, 1);
    box("rgba(0, 0, 0, 0.3)", SLATE.x, SLATE.y, 1, SLATE.h);
    // the grid as it has always been there, worn pale
    ctx.globalAlpha = 0.42;
    for (const p of gridPlans(this.lines)) {
      dabs(p, this.lines).forEach((list, shade) => list.forEach((d) => box(CHALK.w[Math.max(1, shade)], d.x, d.y, 1, 1)));
    }
    // and the trace of the game before, smeared along the way the rag went: seen only if looked for
    for (const f of this.smudge) {
      ctx.globalAlpha = 0.022 * f.a;
      box(f.color, f.x - 1, f.y, 3, 1);
    }
    ctx.globalAlpha = 1;
    // the ledge under it, dusted with chalk
    box(INK, 0, LEDGE, W, 1);
    box("#8a6444", 0, LEDGE + 1, W, 2);
    box("#6b4a35", 0, LEDGE + 3, W, 2);
    box("#4a301d", 0, LEDGE + 5, W, 1);
    for (let i = 0; i < 22; i++) box("rgba(235, 240, 236, 0.5)", Math.floor(hash(i, 41) * W), LEDGE + 1 + Math.floor(hash(i, 43) * 2), 1, 1);
  }

  private draw(ctx: Ctx, s: Stroke, now: number) {
    const k = s.at === NEVER ? 1 : span(now, s.at, s.ms);
    if (k <= 0) return;
    for (let shade = 0; shade < 3; shade++) {
      ctx.fillStyle = s.tone[shade];
      for (const d of s.px[shade]) {
        if (d.t > k) break;
        ctx.fillRect(d.x, d.y, 1, 1);
      }
    }
  }

  /** A stick of chalk: lying on the ledge, or held to the slate with its tip at (x, y). */
  private stick(ctx: Ctx, side: Side, x: number, y: number, home: boolean) {
    const [light, main, dim] = CHALK[side];
    if (home) {
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1, y - 1, 9, 3);
      ctx.fillStyle = main;
      ctx.fillRect(x, y - 1, 7, 2);
      ctx.fillStyle = light;
      ctx.fillRect(x, y - 1, 7, 1);
      ctx.fillStyle = dim;
      ctx.fillRect(x + 6, y - 1, 1, 2);
      return;
    }
    const [tx, ty] = [Math.round(x), Math.round(y)];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(tx + i + 1, ty - i, 3, 1);
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = INK;
      ctx.fillRect(tx + i - 1, ty - 1 - i, 4, 1);
    }
    ctx.fillRect(tx + 5, ty - 7, 3, 1);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i === 0 ? dim : main;
      ctx.fillRect(tx + i, ty - 1 - i, 2, 1);
      ctx.fillStyle = light;
      ctx.fillRect(tx + i, ty - 1 - i, 1, 1);
    }
  }

  /** Where `side`'s chalk should be: at the tip of what it is drawing, over a square it is weighing, or at home. */
  private aim(side: Side, now: number): { to: Point; snap: boolean } {
    // the earliest stroke of its own that is being drawn or about to be
    const sooner = (best: Stroke | null, s: Stroke): Stroke | null =>
      s.by !== side || s.at === NEVER || now >= s.at + s.ms + 70 || s.at - now > 260 || (best && best.at <= s.at) ? best : s;
    let doing: Stroke | null = null;
    for (const m of this.marks) for (const s of m.strokes) doing = sooner(doing, s);
    for (const s of this.notes) doing = sooner(doing, s);
    if (doing) return { to: doing.path(span(now, doing.at, doing.ms)), snap: now >= doing.at };
    const seen = this.seen;
    const bob = Math.sin(now / 300 + (side === "x" ? 0 : 2)) * 1.2;
    if (seen && seen.live && !seen.winner && seen.turn === side && !calm()) {
      const t = botThinking();
      if (t && t.game === this.id && t.by === this.ids[side]) {
        // an agent looking for its move: the chalk wanders over the empty squares
        const free = seen.cells.flatMap((c, i) => (c ? [] : [i]));
        if (free.length) {
          const [x, y] = mid(free[Math.floor(hash(this.seed, seen.ply, Math.floor((now - t.since) / 560)) * free.length)]);
          return { to: [x + 2, y - 3 + bob], snap: false };
        }
      } else if (side === seen.mine && seen.go && this.ghost && this.pointer === this.ghost.cell) {
        const [x, y] = this.ghost.strokes[0].path(0);
        return { to: [x, y - 2 + bob * 0.6], snap: false };
      }
    }
    return { to: HOME[side], snap: false };
  }

  /** One frame: everything moves on to `now` and is drawn. */
  frame(now: number) {
    const dt = this.prev ? clamp(now - this.prev, 0, 50) : 16;
    this.prev = now;
    const sc = this.screen;
    const ctx = this.ctx;
    const seen = this.seen;
    const still = calm();
    const wipeMs = this.pass * 3;
    if (!this.wiped && now >= this.wipeAt + wipeMs) {
      // the rag is done: what it left is part of the slate from now on
      this.wiped = true;
      this.smudge = this.old;
      this.old = [];
      this.board = null;
    }
    if (sc.takeResize() || !this.board) this.board = sc.layer((c) => this.paint(c));
    this.cues.run(now);

    // every stroke speaks as the chalk touches the slate, and sheds a little dust while it runs
    const dusty = !still && now >= this.dustAt;
    const start = (s: Stroke) => {
      if (now < s.at || s.at === NEVER) return;
      if (!this.said.has(s)) {
        this.said.add(s);
        if (now - s.at < 400) s.say?.();
      }
      if (!dusty || now > s.at + s.ms || s.ms < 30) return;
      const [x, y] = s.path(span(now, s.at, s.ms));
      this.sparks.burst(x, y, 1, 0.012, [s.tone[0], s.tone[1]], { dir: Math.PI / 2, spread: 2.2, life: 460, fall: 0.0002 });
    };
    for (const m of this.marks) m.strokes.forEach(start);
    this.grid.forEach(start);
    this.notes.forEach(start);
    if (dusty) this.dustAt = now + 24;

    // the rag: across the slate three times, then back to the ledge
    if (still && !this.wiped && now >= this.wipeAt) this.wipeAt = now - wipeMs;
    const wiping = !this.wiped && now >= this.wipeAt;
    const since = now - this.wipeAt;
    if (wiping && since < wipeMs) {
      const pass = Math.min(2, Math.floor(since / this.pass));
      const f = span(since, pass * this.pass, this.pass);
      this.rag.x = SLATE.x + SLATE.w * (pass % 2 ? 1 - f : f);
      this.rag.y = GY - 1 + (pass + 0.5) * 31;
      if (!this.wipeSaid) snd.wipe();
      this.wipeSaid = true;
    } else {
      this.rag.x = ease(this.rag.x, RAG_HOME[0], dt, 70);
      this.rag.y = ease(this.rag.y, RAG_HOME[1], dt, 70);
    }
    for (const side of ["x", "o"] as const) {
      const st = this.sticks[side];
      const { to, snap } = this.aim(side, now);
      st.x = snap ? to[0] : ease(st.x, to[0], dt, 55);
      st.y = snap ? to[1] : ease(st.y, to[1], dt, 55);
    }
    this.sparks.step(dt);

    sc.blit(ctx, this.board);
    sc.begin(ctx);
    // the game before, as far as the rag has not been
    if (this.old.length) {
      for (const f of this.old) {
        const pass = clamp(Math.floor((f.y - (GY - 1)) / 31), 0, 2);
        const along = clamp((f.x - SLATE.x) / SLATE.w);
        const gone = since >= (pass + (pass % 2 ? 1 - along : along)) * this.pass;
        ctx.globalAlpha = gone ? 0.07 * f.a : f.a;
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x, f.y, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    for (const s of this.grid) this.draw(ctx, s, now);
    // a faint ghost of the viewer's mark in the square pointed at, exactly as it would be drawn
    const at = seen?.go && this.pointer !== null && !seen.cells[this.pointer] ? this.pointer : null;
    if (at !== null && seen) {
      if (this.ghost?.cell !== at || this.ghost.side !== seen.mine) {
        this.ghost = { cell: at, side: seen.mine, strokes: this.mark(at, seen.mine, NEVER, this.seed).strokes };
      }
      ctx.globalAlpha = 0.26;
      for (const s of this.ghost.strokes) this.draw(ctx, s, now);
      ctx.globalAlpha = 1;
    } else this.ghost = null;
    for (const m of this.marks) {
      const no = m.cell === this.no.cell ? 1 - span(now, this.no.at, NOPE_MS) : 0;
      const dx = still ? 0 : Math.round(Math.sin((now - this.no.at) / 20) * 2.4 * no);
      ctx.translate(dx, 0);
      ctx.globalAlpha = 1 - 0.58 * span(now, m.dimAt, 320);
      for (const s of m.strokes) this.draw(ctx, s, now);
      const shine = Math.max(now >= m.shineAt && !still ? 0.85 * (1 - span(now, m.shineAt, 520)) : 0, 0.5 * no);
      if (shine > 0) {
        ctx.globalAlpha = shine;
        ctx.fillStyle = "#ffffff";
        for (const s of m.strokes) for (const list of s.px) for (const d of list) ctx.fillRect(d.x, d.y, 1, 1);
      }
      ctx.translate(-dx, 0);
    }
    ctx.globalAlpha = 1;
    for (const s of this.notes) this.draw(ctx, s, now);

    // the ledge: the rag and whichever chalk is not in use
    const rx = Math.round(this.rag.x);
    const ry = Math.round(this.rag.y);
    ctx.fillStyle = INK;
    ctx.fillRect(rx - 7, ry - 3, 14, 6);
    ctx.fillStyle = "#8a6444";
    ctx.fillRect(rx - 6, ry - 2, 12, 2);
    ctx.fillStyle = "#d9d1e6";
    ctx.fillRect(rx - 6, ry, 12, 2);
    ctx.fillStyle = "#a79fba";
    ctx.fillRect(rx - 6, ry + 1, 12, 1);
    if (wiping && dusty) {
      this.sparks.burst(this.rag.x, this.rag.y + 3, 1, 0.02, ["#aebdb3", "#8a9c93"], { dir: Math.PI / 2, spread: 2.4, life: 380, fall: 0.00018 });
    }
    for (const side of ["x", "o"] as const) {
      const st = this.sticks[side];
      const home = Math.hypot(st.x - HOME[side][0], st.y - HOME[side][1]) < 1.5;
      if (home) this.stick(ctx, side, HOME[side][0], HOME[side][1], true);
      else this.stick(ctx, side, st.x, st.y, false);
    }
    this.sparks.draw(ctx, sc);
  }

  dispose() {
    this.cues.clear();
    this.screen.dispose();
  }
}
