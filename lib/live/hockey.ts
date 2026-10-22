import { Side } from "./duel";
import { Rules, hashNums } from "./rollback";

export const W = 90;
export const H = 150;
export const PUCK_R = 4;
export const MALLET_R = 6;
export const GOAL_W = 32;
export const WIN_AT = 5;
const FRICTION = 0.00025;
const BOUNCE = 0.9;
const MAX_PUCK = 0.22;
export const MAX_MALLET = 0.35;
/** ms a step stands for, played as SUBS moves of the mallets and the puck */
export const STEP_MS = 8;
const SUBS = 2;
const SUB_MS = STEP_MS / SUBS;
/** the countdown before the first puck, and the pause after a goal, in steps */
export const FIRST_STEPS = 188;
const NEXT_STEPS = 150;
/** where a mallet is aimed at, in steps of 1/AIM units, so every screen reads the same number */
const AIM = 8;
const SIDES: readonly Side[] = ["x", "o"];

export interface Puck {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Mallet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** where a player points their mallet; it heads there as fast as a mallet goes */
export interface Aim {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** x keeps the bottom half and o the top; a mallet stays far enough back that it touches only pucks on its side. */
export function keepIn(s: Side, x: number, y: number): { x: number; y: number } {
  const reach = MALLET_R + PUCK_R;
  const [lo, hi] = s === "x" ? [H / 2 + reach, H - MALLET_R] : [MALLET_R, H / 2 - reach];
  return { x: clamp(x, MALLET_R, W - MALLET_R), y: clamp(y, lo, hi) };
}

export const startAt = (s: Side): { x: number; y: number } => ({ x: W / 2, y: s === "x" ? H - 26 : 26 });

const home = (s: Side): Mallet => ({ ...keepIn(s, W / 2, s === "x" ? H - 14 : 14), vx: 0, vy: 0 });

/** An aim inside the player's own half, on the grid every screen reads the same. */
export function aimAt(s: Side, x: number, y: number): Aim {
  const p = keepIn(s, x, y);
  return { x: Math.round(p.x * AIM) / AIM, y: Math.round(p.y * AIM) / AIM };
}

const inMouth = (x: number) => Math.abs(x - W / 2) < GOAL_W / 2;

function hit(p: Puck, m: Mallet): Puck {
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const min = PUCK_R + MALLET_R;
  if (d >= min || d === 0) return p;
  const nx = dx / d;
  const ny = dy / d;
  const rel = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
  let vx = p.vx;
  let vy = p.vy;
  if (rel < 0) {
    vx -= (1 + BOUNCE) * rel * nx;
    vy -= (1 + BOUNCE) * rel * ny;
  }
  const v = Math.sqrt(vx * vx + vy * vy);
  const k = v > MAX_PUCK ? MAX_PUCK / v : 1;
  return { x: m.x + nx * min, y: m.y + ny * min, vx: vx * k, vy: vy * k };
}

/**
 * The puck a few ms on: friction, both mallets, the side walls and the end walls beside each goal. `goal` is the side
 * whose goal it went into.
 */
export function glide(p0: Puck, dt: number, ms: readonly Mallet[]): { p: Puck; goal: Side | null } {
  const slow = Math.max(0, 1 - FRICTION * dt);
  let p: Puck = { x: p0.x + p0.vx * dt, y: p0.y + p0.vy * dt, vx: p0.vx * slow, vy: p0.vy * slow };
  for (const m of ms) p = hit(p, m);
  if (p.x < PUCK_R) p = { ...p, x: 2 * PUCK_R - p.x, vx: Math.abs(p.vx) * BOUNCE };
  else if (p.x > W - PUCK_R) p = { ...p, x: 2 * (W - PUCK_R) - p.x, vx: -Math.abs(p.vx) * BOUNCE };
  if (inMouth(p.x)) {
    if (p.y > H + PUCK_R) return { p, goal: "x" };
    if (p.y < -PUCK_R) return { p, goal: "o" };
  } else if (p.y < PUCK_R) p = { ...p, y: 2 * PUCK_R - p.y, vy: Math.abs(p.vy) * BOUNCE };
  else if (p.y > H - PUCK_R) p = { ...p, y: 2 * (H - PUCK_R) - p.y, vy: -Math.abs(p.vy) * BOUNCE };
  return { p, goal: null };
}

/** A mallet SUB_MS on, heading for its aim no faster than a mallet goes. */
function reach(m: Mallet, s: Side, aim: Aim) {
  const dx = aim.x - m.x;
  const dy = aim.y - m.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const most = MAX_MALLET * SUB_MS;
  const k = d > most ? most / d : 1;
  const next = keepIn(s, m.x + dx * k, m.y + dy * k);
  m.vx = (next.x - m.x) / SUB_MS;
  m.vy = (next.y - m.y) / SUB_MS;
  m.x = next.x;
  m.y = next.y;
}

/** The whole table at one step; x is seat 0 and plays from the bottom. */
export interface HockeyState {
  n: number;
  puck: Puck | null;
  mal: [Mallet, Mallet];
  /** x then o */
  score: [number, number];
  /** the step the next puck comes on, or 0 */
  serve: number;
  /** whose half it comes on: whoever let the last goal in */
  to: 0 | 1;
  over: boolean;
}

const copyState = (s: HockeyState): HockeyState => ({
  n: s.n,
  puck: s.puck && { ...s.puck },
  mal: [{ ...s.mal[0] }, { ...s.mal[1] }],
  score: [s.score[0], s.score[1]],
  serve: s.serve,
  to: s.to,
  over: s.over,
});

const fin = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const cleanMover = (v: unknown, lim: number): Puck | null => {
  const p = v as Partial<Puck> | null;
  const ok = p && fin(p.x, -20, W + 20) && fin(p.y, -20, H + 20) && fin(p.vx, -lim, lim) && fin(p.vy, -lim, lim);
  return ok ? { x: p.x!, y: p.y!, vx: p.vx!, vy: p.vy! } : null;
};

/**
 * Air hockey as both screens play it, step by step: each player only says where their mallet is aimed, and every
 * screen moves both mallets and the puck the same way, so a hit lands where it is seen.
 */
export const HOCKEY: Rules<HockeyState, Aim> = {
  ms: STEP_MS,
  delay: 0,
  start: () => ({
    n: 0,
    puck: null,
    mal: [home("x"), home("o")],
    score: [0, 0],
    serve: FIRST_STEPS,
    to: 0,
    over: false,
  }),
  step(s, aims) {
    s.n += 1;
    if (s.over) return;
    if (s.serve && s.n >= s.serve) {
      s.puck = { ...startAt(SIDES[s.to]), vx: 0, vy: 0 };
      s.serve = 0;
    }
    for (let k = 0; k < SUBS; k++) {
      reach(s.mal[0], "x", aims[0]);
      reach(s.mal[1], "o", aims[1]);
      if (!s.puck) continue;
      const g = glide(s.puck, SUB_MS, s.mal);
      s.puck = g.p;
      if (!g.goal) continue;
      const lost = g.goal === "x" ? 0 : 1;
      s.score[1 - lost] += 1;
      s.puck = null;
      s.to = lost;
      if (s.score[1 - lost] >= WIN_AT) s.over = true;
      else s.serve = s.n + NEXT_STEPS;
    }
  },
  copy: copyState,
  idle: (seat) => {
    const m = home(SIDES[seat]);
    return { x: m.x, y: m.y };
  },
  same: (a, b) => a.x === b.x && a.y === b.y,
  guess: (last) => last,
  enc: (a) => [Math.round(a.x * AIM), Math.round(a.y * AIM)],
  dec(v) {
    if (!Array.isArray(v) || !Number.isInteger(v[0]) || !Number.isInteger(v[1])) return null;
    const [x, y] = v as number[];
    return x >= 0 && x <= W * AIM && y >= 0 && y <= H * AIM ? { x: x / AIM, y: y / AIM } : null;
  },
  sum: (s) => {
    const p = s.puck;
    const m = s.mal;
    return hashNums([
      s.n,
      p ? 1 : 0,
      p?.x ?? 0,
      p?.y ?? 0,
      p?.vx ?? 0,
      p?.vy ?? 0,
      m[0].x,
      m[0].y,
      m[1].x,
      m[1].y,
      ...s.score,
      s.serve,
      s.to,
      s.over ? 1 : 0,
    ]);
  },
  pack: (s) => copyState(s),
  unpack(v) {
    const s = v as Partial<HockeyState> | null;
    if (!s || !fin(s.n, 0, 1e8) || !Array.isArray(s.mal) || !Array.isArray(s.score) || s.mal.length !== 2) return null;
    const puck = s.puck === null ? null : cleanMover(s.puck, 1);
    const m0 = cleanMover(s.mal[0], 1);
    const m1 = cleanMover(s.mal[1], 1);
    const [a, b] = s.score;
    if ((s.puck !== null && !puck) || !m0 || !m1 || !fin(a, 0, WIN_AT) || !fin(b, 0, WIN_AT)) return null;
    if (!fin(s.serve, 0, 1e8) || (s.to !== 0 && s.to !== 1) || typeof s.over !== "boolean") return null;
    return { n: s.n, puck, mal: [m0, m1], score: [a, b], serve: s.serve, to: s.to, over: s.over };
  },
};
