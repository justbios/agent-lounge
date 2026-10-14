import { Side } from "./duel";

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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** x keeps the bottom half and o the top; a mallet stays far enough back that it touches only pucks on its side. */
export function keepIn(s: Side, x: number, y: number): { x: number; y: number } {
  const reach = MALLET_R + PUCK_R;
  const [lo, hi] = s === "x" ? [H / 2 + reach, H - MALLET_R] : [MALLET_R, H / 2 - reach];
  return { x: clamp(x, MALLET_R, W - MALLET_R), y: clamp(y, lo, hi) };
}

export const half = (p: Puck): Side => (p.y >= H / 2 ? "x" : "o");

export const startAt = (s: Side): { x: number; y: number } => ({ x: W / 2, y: s === "x" ? H - 26 : 26 });

const inMouth = (x: number) => Math.abs(x - W / 2) < GOAL_W / 2;

function hit(p: Puck, m: Mallet): Puck {
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const d = Math.hypot(dx, dy);
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
  const v = Math.hypot(vx, vy);
  const k = v > MAX_PUCK ? MAX_PUCK / v : 1;
  return { x: m.x + nx * min, y: m.y + ny * min, vx: vx * k, vy: vy * k };
}

/**
 * The puck a few ms on: friction, the side walls, the end walls beside each goal and, when given, one mallet. `goal`
 * is the side whose goal it went into.
 */
export function glide(p0: Puck, dt: number, m?: Mallet): { p: Puck; goal: Side | null } {
  const slow = Math.max(0, 1 - FRICTION * dt);
  let p: Puck = { x: p0.x + p0.vx * dt, y: p0.y + p0.vy * dt, vx: p0.vx * slow, vy: p0.vy * slow };
  if (m) p = hit(p, m);
  if (p.x < PUCK_R) p = { ...p, x: 2 * PUCK_R - p.x, vx: Math.abs(p.vx) * BOUNCE };
  else if (p.x > W - PUCK_R) p = { ...p, x: 2 * (W - PUCK_R) - p.x, vx: -Math.abs(p.vx) * BOUNCE };
  if (inMouth(p.x)) {
    if (p.y > H + PUCK_R) return { p, goal: "x" };
    if (p.y < -PUCK_R) return { p, goal: "o" };
  } else if (p.y < PUCK_R) p = { ...p, y: 2 * PUCK_R - p.y, vy: Math.abs(p.vy) * BOUNCE };
  else if (p.y > H - PUCK_R) p = { ...p, y: 2 * (H - PUCK_R) - p.y, vy: -Math.abs(p.vy) * BOUNCE };
  return { p, goal: null };
}

/** The puck after `ms` of free flight, for guessing where the other side's word has got to by now. */
export function glideFor(p: Puck, ms: number): Puck {
  let out = p;
  for (let left = ms; left > 0; left -= 4) {
    const g = glide(out, Math.min(4, left));
    if (g.goal) return out;
    out = g.p;
  }
  return out;
}

/**
 * `e` counts every change of who rules on the puck; `boss` is who does from then on. The puck is null between a
 * goal and the next serve. `s` is the score, x then o.
 */
export type HockeyMsg =
  | { t: "hello" }
  | { t: "ping"; a: number }
  | { t: "pong"; a: number }
  | { t: "mal"; x: number; y: number }
  | { t: "puck"; e: number; boss: Side; p: Puck | null; s: [number, number] };

const num = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

function cleanPuck(v: unknown): Puck | null {
  const p = v as Partial<Puck> | null;
  const ok = p && num(p.x, -10, W + 10) && num(p.y, -10, H + 10) && num(p.vx, -1, 1) && num(p.vy, -1, 1);
  return ok ? { x: p.x!, y: p.y!, vx: p.vx!, vy: p.vy! } : null;
}

export function cleanHockey(v: unknown): HockeyMsg | null {
  const m = v as Record<string, unknown> | null;
  if (!m) return null;
  switch (m.t) {
    case "hello":
      return { t: "hello" };
    case "ping":
    case "pong":
      return num(m.a, 0, 1e12) ? { t: m.t, a: m.a } : null;
    case "mal":
      return num(m.x, 0, W) && num(m.y, 0, H) ? { t: "mal", x: m.x, y: m.y } : null;
    case "puck": {
      const s = m.s as unknown[];
      const p = m.p === null ? null : cleanPuck(m.p);
      if (!num(m.e, 1, 1e6) || (m.boss !== "x" && m.boss !== "o") || (m.p !== null && !p)) return null;
      if (!Array.isArray(s) || !num(s[0], 0, WIN_AT) || !num(s[1], 0, WIN_AT)) return null;
      return { t: "puck", e: m.e, boss: m.boss, p, s: [s[0], s[1]] };
    }
  }
  return null;
}
