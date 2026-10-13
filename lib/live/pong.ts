import { Side } from "./duel";

export const W = 160;
export const H = 100;
export const PAD_H = 20;
export const PAD_W = 3;
export const GAP = 5;
export const R = 1.5;
export const WIN_AT = 5;
const SPEED = 0.075;
const SPEED_UP = 1.06;
const MAX_SPEED = 0.17;

/** Where each paddle's face is; x plays on the left in the shared coordinates, o on the right. */
export const FACE: Record<Side, number> = { x: GAP + PAD_W, o: W - GAP - PAD_W };

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const clampPad = (y: number) => clamp(y, PAD_H / 2, H - PAD_H / 2);

/** The ball after a few ms of flight, bouncing off the top and bottom walls; the paddles are the caller's business. */
export function fly(b: Ball, dt: number): Ball {
  let y = b.y + b.vy * dt;
  let vy = b.vy;
  if (y < R) {
    y = 2 * R - y;
    vy = -vy;
  } else if (y > H - R) {
    y = 2 * (H - R) - y;
    vy = -vy;
  }
  return { x: b.x + b.vx * dt, y, vx: b.vx, vy };
}

export function flyFor(b: Ball, ms: number): Ball {
  let out = b;
  for (let left = ms; left > 0; left -= 8) out = fly(out, Math.min(8, left));
  return out;
}

export const heading = (b: Ball): Side => (b.vx < 0 ? "x" : "o");

export const atFace = (b: Ball): boolean => (b.vx < 0 ? b.x - R <= FACE.x : b.x + R >= FACE.o);

export const covers = (pad: number, b: Ball): boolean => Math.abs(b.y - pad) <= PAD_H / 2 + R;

export const gone = (b: Ball): boolean => b.x < -6 || b.x > W + 6;

/** Off the paddle: a little faster each time, and steeper the further from the paddle's middle it struck. */
export function bounce(b: Ball, pad: number): Ball {
  const speed = Math.min(MAX_SPEED, Math.hypot(b.vx, b.vy) * SPEED_UP);
  const off = clamp((b.y - pad) / (PAD_H / 2 + R), -1, 1);
  const vy = off * speed * 0.7;
  const vx = Math.sqrt(speed * speed - vy * vy) * (b.vx < 0 ? 1 : -1);
  return { x: b.vx < 0 ? FACE.x + R : FACE.o - R, y: b.y, vx, vy };
}

/** The other side's paddle as last seen would send it back; a guess until their own word arrives. */
export const reflect = (b: Ball): Ball => ({ ...b, x: b.vx < 0 ? FACE.x + R : FACE.o - R, vx: -b.vx });

export function serve(from: Side): Ball {
  const vy = (Math.random() * 2 - 1) * SPEED * 0.5;
  const vx = Math.sqrt(SPEED * SPEED - vy * vy) * (from === "x" ? 1 : -1);
  return { x: from === "x" ? FACE.x + R + 1 : FACE.o - R - 1, y: H / 2 + (Math.random() * 2 - 1) * 20, vx, vy };
}

export type PongMsg =
  | { t: "hello" }
  | { t: "ping"; a: number }
  | { t: "pong"; a: number }
  | { t: "pad"; y: number }
  | { t: "ball"; n: number; b: Ball }
  | { t: "point"; n: number; x: number; o: number };

const num = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && v >= lo && v <= hi;

function cleanBall(v: unknown): Ball | null {
  const b = v as Partial<Ball> | null;
  return b && num(b.x, -10, W + 10) && num(b.y, 0, H) && num(b.vx, -1, 1) && num(b.vy, -1, 1) && b.vx !== 0
    ? { x: b.x, y: b.y, vx: b.vx, vy: b.vy }
    : null;
}

export function cleanPong(p: unknown): PongMsg | null {
  const m = p as Record<string, unknown> | null;
  if (!m) return null;
  switch (m.t) {
    case "hello":
      return { t: "hello" };
    case "ping":
    case "pong":
      return num(m.a, 0, 1e12) ? { t: m.t, a: m.a } : null;
    case "pad":
      return num(m.y, 0, H) ? { t: "pad", y: m.y } : null;
    case "ball": {
      const b = cleanBall(m.b);
      return b && num(m.n, 1, 1e6) ? { t: "ball", n: m.n, b } : null;
    }
    case "point":
      return num(m.n, 1, 1e6) && num(m.x, 0, WIN_AT) && num(m.o, 0, WIN_AT) ? { t: "point", n: m.n, x: m.x, o: m.o } : null;
  }
  return null;
}
