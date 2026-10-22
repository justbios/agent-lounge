import { Side } from "./duel";
import { Rules, hashNums } from "./rollback";

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

export const heading = (b: Ball): Side => (b.vx < 0 ? "x" : "o");

export const atFace = (b: Ball): boolean => (b.vx < 0 ? b.x - R <= FACE.x : b.x + R >= FACE.o);

export const covers = (pad: number, b: Ball): boolean => Math.abs(b.y - pad) <= PAD_H / 2 + R;

export const gone = (b: Ball): boolean => b.x < -6 || b.x > W + 6;

/** Off the paddle: a little faster each time, and steeper the further from the paddle's middle it struck. */
export function bounce(b: Ball, pad: number): Ball {
  const speed = Math.min(MAX_SPEED, Math.sqrt(b.vx * b.vx + b.vy * b.vy) * SPEED_UP);
  const off = clamp((b.y - pad) / (PAD_H / 2 + R), -1, 1);
  const vy = off * speed * 0.7;
  const vx = Math.sqrt(speed * speed - vy * vy) * (b.vx < 0 ? 1 : -1);
  return { x: b.vx < 0 ? FACE.x + R : FACE.o - R, y: b.y, vx, vy };
}

/** A serve from one side's paddle, its angle and height from two numbers between 0 and 1. */
export function serve(from: Side, a: number, b: number): Ball {
  const vy = (a * 2 - 1) * SPEED * 0.5;
  const vx = Math.sqrt(SPEED * SPEED - vy * vy) * (from === "x" ? 1 : -1);
  return { x: from === "x" ? FACE.x + R + 1 : FACE.o - R - 1, y: H / 2 + (b * 2 - 1) * 20, vx, vy };
}

/** A number between 0 and 1 from a seed, the same in every browser. */
export function chance(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A match id as a number to seed its serves with. */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** ms a step stands for */
export const STEP_MS = 8;
/** the countdown before the first serve, and the pause before the next, in steps */
export const FIRST_STEPS = 188;
const NEXT_STEPS = 125;
/** where a paddle is, in steps of 1/AIM units */
const AIM = 8;
const SIDES: readonly Side[] = ["x", "o"];

/** A paddle's height on the grid every screen reads the same. */
export const padAt = (y: number): number => Math.round(clampPad(y) * AIM) / AIM;

/** The table at one step; x is seat 0 and plays on the left. */
export interface PongState {
  n: number;
  ball: Ball | null;
  pads: [number, number];
  /** x then o */
  score: [number, number];
  /** the step the next serve comes on, or 0 */
  serve: number;
  /** who serves it: whoever lost the last point */
  to: 0 | 1;
  /** the ball got past a paddle and is on its way out */
  dead: boolean;
  over: boolean;
}

const copyState = (s: PongState): PongState => ({
  ...s,
  ball: s.ball && { ...s.ball },
  pads: [s.pads[0], s.pads[1]],
  score: [s.score[0], s.score[1]],
});

const fin = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Ping-pong as both screens play it, step by step from both paddles' heights; the serves come from the match's seed
 * and the points played, so they are the same on both too.
 */
export function pongRules(seed: number): Rules<PongState, number> {
  return {
    ms: STEP_MS,
    delay: 0,
    start: () => ({
      n: 0,
      ball: null,
      pads: [H / 2, H / 2],
      score: [0, 0],
      serve: FIRST_STEPS,
      to: 0,
      dead: false,
      over: false,
    }),
    step(s, pads) {
      s.n += 1;
      if (s.over) return;
      s.pads[0] = pads[0];
      s.pads[1] = pads[1];
      if (s.serve && s.n >= s.serve) {
        const k = seed + 7919 * (s.score[0] + s.score[1]);
        s.ball = serve(SIDES[s.to], chance(k), chance(k + 1));
        s.serve = 0;
        s.dead = false;
      }
      if (!s.ball) return;
      let b = fly(s.ball, STEP_MS);
      if (!s.dead && atFace(b)) {
        const at = heading(b) === "x" ? 0 : 1;
        if (covers(s.pads[at], b)) b = bounce(b, s.pads[at]);
        else {
          s.dead = true;
          s.score[1 - at] += 1;
          s.to = at;
          if (s.score[1 - at] >= WIN_AT) s.over = true;
          else s.serve = s.n + NEXT_STEPS;
        }
      }
      s.ball = s.dead && gone(b) ? null : b;
    },
    copy: copyState,
    idle: () => H / 2,
    same: (a, b) => a === b,
    guess: (last) => last,
    enc: (y) => Math.round(y * AIM),
    dec: (v) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= H * AIM ? (v as number) / AIM : null),
    sum: (s) =>
      hashNums([
        s.n,
        s.ball ? 1 : 0,
        s.ball?.x ?? 0,
        s.ball?.y ?? 0,
        s.ball?.vx ?? 0,
        s.ball?.vy ?? 0,
        ...s.pads,
        ...s.score,
        s.serve,
        s.to,
        s.dead ? 1 : 0,
        s.over ? 1 : 0,
      ]),
    pack: (s) => copyState(s),
    unpack(v) {
      const s = v as Partial<PongState> | null;
      if (!s || !fin(s.n, 0, 1e8) || !Array.isArray(s.pads) || !Array.isArray(s.score)) return null;
      const b = s.ball as Partial<Ball> | null | undefined;
      const ball =
        b === null
          ? null
          : b && fin(b.x, -20, W + 20) && fin(b.y, -5, H + 5) && fin(b.vx, -1, 1) && fin(b.vy, -1, 1)
            ? { x: b.x, y: b.y, vx: b.vx, vy: b.vy }
            : undefined;
      const [p0, p1] = s.pads;
      const [a, z] = s.score;
      if (ball === undefined || !fin(p0, 0, H) || !fin(p1, 0, H) || !fin(a, 0, WIN_AT) || !fin(z, 0, WIN_AT))
        return null;
      if (!fin(s.serve, 0, 1e8) || (s.to !== 0 && s.to !== 1) || typeof s.dead !== "boolean") return null;
      if (typeof s.over !== "boolean") return null;
      return { n: s.n, ball, pads: [p0, p1], score: [a, z], serve: s.serve, to: s.to, dead: s.dead, over: s.over };
    },
  };
}
